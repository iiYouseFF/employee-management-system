-- Migration 0018: Inventory Management
-- Adds: invoice_lines, stock_movements, security-definer RPCs for all writes,
--       allow_negative_stock setting, v_product_stock view, updated KPI function
-- Rollback notes: DROP TABLE invoice_lines, stock_movements; revert kpi_summary;
--                 revert app_settings; DROP all functions created here.

-- ─── 0. Settings: allow_negative_stock flag ──────────────────────────────────
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS allow_negative_stock boolean NOT NULL DEFAULT false;

-- ─── 1. Invoice Lines ─────────────────────────────────────────────────────────
-- Stores per-line detail for cash and credit invoices.
-- invoice_type: 'cash' | 'credit'
-- line_total is a generated column so it's always consistent.
CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_type  text          NOT NULL CHECK (invoice_type IN ('cash','credit')),
  invoice_id    uuid          NOT NULL,          -- FK handled at app layer (polymorphic)
  product_id    uuid          NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty           numeric(14,4) NOT NULL CHECK (qty > 0),
  unit_price    numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  line_total    numeric(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice
  ON public.invoice_lines (owner_id, invoice_type, invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_product
  ON public.invoice_lines (product_id);

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- Only managers read/write lines (no direct DML for anyone — RPCs handle writes)
DROP POLICY IF EXISTS "manager_all_invoice_lines" ON public.invoice_lines;
CREATE POLICY "manager_all_invoice_lines" ON public.invoice_lines
  FOR ALL
  USING  (public.is_manager() AND owner_id = public.get_manager_id())
  WITH CHECK (public.is_manager() AND owner_id = public.get_manager_id());

-- Reps: read lines for invoices they can see (their customers)
DROP POLICY IF EXISTS "rep_read_invoice_lines" ON public.invoice_lines;
CREATE POLICY "rep_read_invoice_lines" ON public.invoice_lines
  FOR SELECT
  USING (
    NOT public.is_manager()
    AND owner_id = public.get_manager_id()
    AND (
      (invoice_type = 'cash'   AND invoice_id IN (SELECT id FROM public.cash_invoices   WHERE rep_id = public.get_current_rep_id()))
      OR
      (invoice_type = 'credit' AND invoice_id IN (SELECT id FROM public.credit_invoices WHERE rep_id = public.get_current_rep_id()))
    )
  );

-- ─── 2. Stock Movements ───────────────────────────────────────────────────────
-- Immutable ledger. All writes are via security-definer functions.
-- qty: positive = stock in, negative = stock out
-- movement_type: 'in' | 'out' | 'adjustment'
-- avg_cost_snapshot: weighted average cost at time of movement (for COGS)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id       uuid          NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  movement_type    text          NOT NULL CHECK (movement_type IN ('in','out','adjustment')),
  qty              numeric(14,4) NOT NULL,          -- positive=in, negative=out/adj
  unit_cost        numeric(14,2) NOT NULL DEFAULT 0, -- cost at time of movement
  avg_cost_snapshot numeric(14,2),                  -- weighted avg cost at time of sale (COGS)
  reference_type   text,                            -- 'cash_invoice','credit_invoice','manual','adjustment'
  reference_id     uuid,                            -- invoice id if linked
  notes            text,
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON public.stock_movements (owner_id, product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref
  ON public.stock_movements (reference_type, reference_id);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- No direct DML from clients. Only security-definer functions write here.
-- Managers can SELECT for reporting.
DROP POLICY IF EXISTS "manager_read_stock_movements" ON public.stock_movements;
CREATE POLICY "manager_read_stock_movements" ON public.stock_movements
  FOR SELECT
  USING (public.is_manager() AND owner_id = public.get_manager_id());

-- ─── 3. Helper: weighted average cost per product ─────────────────────────────
CREATE OR REPLACE FUNCTION public.product_avg_cost(p_owner_id uuid, p_product_id uuid)
RETURNS numeric(14,2)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    CASE
      WHEN SUM(CASE WHEN qty > 0 THEN qty ELSE 0 END) = 0 THEN 0
      ELSE
        ROUND(
          SUM(CASE WHEN qty > 0 THEN qty * unit_cost ELSE 0 END) /
          SUM(CASE WHEN qty > 0 THEN qty ELSE 0 END),
          2
        )
    END
  FROM public.stock_movements
  WHERE owner_id = p_owner_id
    AND product_id = p_product_id;
$$;

-- ─── 4. Helper: current on-hand qty per product ───────────────────────────────
CREATE OR REPLACE FUNCTION public.product_on_hand(p_owner_id uuid, p_product_id uuid)
RETURNS numeric(14,4)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(qty), 0)
  FROM public.stock_movements
  WHERE owner_id = p_owner_id
    AND product_id = p_product_id;
$$;

-- ─── 5. RPC: Save cash invoice with lines ────────────────────────────────────
-- p_invoice: {id?, date, invoice_no, customer_id, rep_id, item, notes}
-- p_lines:   [{product_id, qty, unit_price}]
-- Returns the invoice id.
CREATE OR REPLACE FUNCTION public.save_cash_invoice(
  p_invoice jsonb,
  p_lines   jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id      uuid := public.get_manager_id();
  v_invoice_id    uuid;
  v_allow_neg     boolean;
  v_line          jsonb;
  v_product_id    uuid;
  v_qty           numeric(14,4);
  v_unit_price    numeric(14,2);
  v_on_hand       numeric(14,4);
  v_avg_cost      numeric(14,2);
  v_product_name  text;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT allow_negative_stock INTO v_allow_neg
  FROM public.app_settings WHERE owner_id = v_owner_id;
  v_allow_neg := COALESCE(v_allow_neg, false);

  -- Upsert invoice header
  IF p_invoice->>'id' IS NOT NULL AND p_invoice->>'id' != '' THEN
    v_invoice_id := (p_invoice->>'id')::uuid;

    UPDATE public.cash_invoices SET
      date       = (p_invoice->>'date')::date,
      invoice_no = p_invoice->>'invoice_no',
      customer_id= (p_invoice->>'customer_id')::uuid,
      rep_id     = (p_invoice->>'rep_id')::uuid,
      item       = COALESCE(p_invoice->>'item', ''),
      notes      = p_invoice->>'notes',
      amount     = 0  -- will be overwritten by line totals below
    WHERE id = v_invoice_id AND owner_id = v_owner_id;

    -- Reverse old stock movements
    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    SELECT
      owner_id, product_id, 'adjustment',
      -1 * qty,  -- reverse
      unit_cost, unit_cost,
      'reversal', id,
      'تصحيح تعديل فاتورة نقدية ' || v_invoice_id::text,
      auth.uid()
    FROM public.stock_movements
    WHERE reference_type = 'cash_invoice'
      AND reference_id = v_invoice_id
      AND owner_id = v_owner_id
      AND movement_type = 'out';

    -- Delete old lines
    DELETE FROM public.invoice_lines
    WHERE invoice_type = 'cash' AND invoice_id = v_invoice_id AND owner_id = v_owner_id;

  ELSE
    INSERT INTO public.cash_invoices
      (owner_id, date, invoice_no, customer_id, rep_id, item, notes, amount)
    VALUES (
      v_owner_id,
      (p_invoice->>'date')::date,
      p_invoice->>'invoice_no',
      NULLIF(p_invoice->>'customer_id','')::uuid,
      NULLIF(p_invoice->>'rep_id','')::uuid,
      COALESCE(p_invoice->>'item', ''),
      p_invoice->>'notes',
      0
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  -- Insert new lines + stock-out movements
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id  := (v_line->>'product_id')::uuid;
    v_qty         := (v_line->>'qty')::numeric;
    v_unit_price  := (v_line->>'unit_price')::numeric;

    -- Stock check
    v_on_hand := public.product_on_hand(v_owner_id, v_product_id);
    IF NOT v_allow_neg AND v_on_hand < v_qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'الكمية المتاحة من "%" هي % فقط ولا تكفي لإتمام الفاتورة',
        COALESCE(v_product_name, v_product_id::text), v_on_hand;
    END IF;

    v_avg_cost := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.invoice_lines
      (owner_id, invoice_type, invoice_id, product_id, qty, unit_price)
    VALUES (v_owner_id, 'cash', v_invoice_id, v_product_id, v_qty, v_unit_price);

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    VALUES (
      v_owner_id, v_product_id, 'out', -v_qty,
      v_unit_price, v_avg_cost,
      'cash_invoice', v_invoice_id,
      'فاتورة نقدية ' || (p_invoice->>'invoice_no'),
      auth.uid()
    );
  END LOOP;

  -- Update invoice amount = sum of lines
  UPDATE public.cash_invoices
  SET amount = COALESCE((
    SELECT SUM(line_total)
    FROM public.invoice_lines
    WHERE invoice_type = 'cash' AND invoice_id = v_invoice_id
  ), 0)
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

-- ─── 6. RPC: Save credit invoice with lines ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_credit_invoice(
  p_invoice jsonb,
  p_lines   jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id      uuid := public.get_manager_id();
  v_invoice_id    uuid;
  v_allow_neg     boolean;
  v_line          jsonb;
  v_product_id    uuid;
  v_qty           numeric(14,4);
  v_unit_price    numeric(14,2);
  v_on_hand       numeric(14,4);
  v_avg_cost      numeric(14,2);
  v_product_name  text;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT allow_negative_stock INTO v_allow_neg
  FROM public.app_settings WHERE owner_id = v_owner_id;
  v_allow_neg := COALESCE(v_allow_neg, false);

  IF p_invoice->>'id' IS NOT NULL AND p_invoice->>'id' != '' THEN
    v_invoice_id := (p_invoice->>'id')::uuid;

    UPDATE public.credit_invoices SET
      date       = (p_invoice->>'date')::date,
      invoice_no = p_invoice->>'invoice_no',
      customer_id= NULLIF(p_invoice->>'customer_id','')::uuid,
      rep_id     = NULLIF(p_invoice->>'rep_id','')::uuid,
      item       = COALESCE(p_invoice->>'item', ''),
      due_date   = NULLIF(p_invoice->>'due_date','')::date,
      amount     = 0
    WHERE id = v_invoice_id AND owner_id = v_owner_id;

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    SELECT
      owner_id, product_id, 'adjustment', -1 * qty, unit_cost, unit_cost,
      'reversal', id,
      'تصحيح تعديل فاتورة آجلة ' || v_invoice_id::text,
      auth.uid()
    FROM public.stock_movements
    WHERE reference_type = 'credit_invoice'
      AND reference_id = v_invoice_id
      AND owner_id = v_owner_id
      AND movement_type = 'out';

    DELETE FROM public.invoice_lines
    WHERE invoice_type = 'credit' AND invoice_id = v_invoice_id AND owner_id = v_owner_id;

  ELSE
    INSERT INTO public.credit_invoices
      (owner_id, date, invoice_no, customer_id, rep_id, item, due_date, amount, paid)
    VALUES (
      v_owner_id,
      (p_invoice->>'date')::date,
      p_invoice->>'invoice_no',
      NULLIF(p_invoice->>'customer_id','')::uuid,
      NULLIF(p_invoice->>'rep_id','')::uuid,
      COALESCE(p_invoice->>'item', ''),
      NULLIF(p_invoice->>'due_date','')::date,
      0,
      COALESCE((p_invoice->>'paid')::numeric, 0)
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;

    v_on_hand := public.product_on_hand(v_owner_id, v_product_id);
    IF NOT v_allow_neg AND v_on_hand < v_qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'الكمية المتاحة من "%" هي % فقط ولا تكفي لإتمام الفاتورة',
        COALESCE(v_product_name, v_product_id::text), v_on_hand;
    END IF;

    v_avg_cost := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.invoice_lines
      (owner_id, invoice_type, invoice_id, product_id, qty, unit_price)
    VALUES (v_owner_id, 'credit', v_invoice_id, v_product_id, v_qty, v_unit_price);

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    VALUES (
      v_owner_id, v_product_id, 'out', -v_qty,
      v_unit_price, v_avg_cost,
      'credit_invoice', v_invoice_id,
      'فاتورة آجلة ' || (p_invoice->>'invoice_no'),
      auth.uid()
    );
  END LOOP;

  UPDATE public.credit_invoices
  SET amount = COALESCE((
    SELECT SUM(line_total)
    FROM public.invoice_lines
    WHERE invoice_type = 'credit' AND invoice_id = v_invoice_id
  ), 0)
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$;

-- ─── 7. RPC: Delete cash invoice (reverse stock) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_cash_invoice(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- Reverse stock movements
  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    owner_id, product_id, 'adjustment', -1 * qty, unit_cost, unit_cost,
    'reversal', id,
    'حذف فاتورة نقدية ' || p_id::text,
    auth.uid()
  FROM public.stock_movements
  WHERE reference_type = 'cash_invoice'
    AND reference_id = p_id
    AND owner_id = v_owner_id
    AND movement_type = 'out';

  DELETE FROM public.invoice_lines
  WHERE invoice_type = 'cash' AND invoice_id = p_id AND owner_id = v_owner_id;

  DELETE FROM public.cash_invoices
  WHERE id = p_id AND owner_id = v_owner_id;
END;
$$;

-- ─── 8. RPC: Delete credit invoice (reverse stock) ───────────────────────────
CREATE OR REPLACE FUNCTION public.delete_credit_invoice(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    owner_id, product_id, 'adjustment', -1 * qty, unit_cost, unit_cost,
    'reversal', id,
    'حذف فاتورة آجلة ' || p_id::text,
    auth.uid()
  FROM public.stock_movements
  WHERE reference_type = 'credit_invoice'
    AND reference_id = p_id
    AND owner_id = v_owner_id
    AND movement_type = 'out';

  DELETE FROM public.invoice_lines
  WHERE invoice_type = 'credit' AND invoice_id = p_id AND owner_id = v_owner_id;

  DELETE FROM public.credit_invoices
  WHERE id = p_id AND owner_id = v_owner_id;
END;
$$;

-- ─── 9. RPC: Receive stock (manual stock-in) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.receive_stock(
  p_product_id uuid,
  p_qty        numeric,
  p_unit_cost  numeric,
  p_notes      text DEFAULT NULL,
  p_reference  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
  v_id       uuid;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;
  IF p_unit_cost < 0 THEN RAISE EXCEPTION 'تكلفة الوحدة لا يمكن أن تكون سالبة'; END IF;

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost,
     reference_type, notes, created_by)
  VALUES (
    v_owner_id, p_product_id, 'in', p_qty, p_unit_cost,
    'manual', COALESCE(p_notes, p_reference), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── 10. RPC: Adjust stock ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_product_id uuid,
  p_qty_delta  numeric,   -- positive = add, negative = remove
  p_notes      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
  v_avg_cost numeric(14,2);
  v_id       uuid;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_qty_delta = 0 THEN RAISE EXCEPTION 'كمية التعديل يجب أن تكون مختلفة عن صفر'; END IF;

  v_avg_cost := public.product_avg_cost(v_owner_id, p_product_id);

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, notes, created_by)
  VALUES (
    v_owner_id, p_product_id, 'adjustment', p_qty_delta, v_avg_cost, v_avg_cost,
    'adjustment', COALESCE(p_notes,'تسوية يدوية'), auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── 11. RPC: Product stock summary (on-hand + avg cost) ─────────────────────
CREATE OR REPLACE FUNCTION public.product_stock_summary()
RETURNS TABLE (
  product_id   uuid,
  name_ar      text,
  name_en      text,
  sku          text,
  unit         text,
  category     text,
  price        numeric,
  on_hand      numeric,
  avg_cost     numeric,
  stock_value  numeric,
  is_active    boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id,
    p.name_ar,
    p.name_en,
    p.sku,
    p.unit,
    p.category,
    p.price,
    COALESCE(SUM(sm.qty), 0) AS on_hand,
    CASE
      WHEN SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END) = 0 THEN 0
      ELSE ROUND(
        SUM(CASE WHEN sm.qty > 0 THEN sm.qty * sm.unit_cost ELSE 0 END) /
        SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END), 2)
    END AS avg_cost,
    COALESCE(SUM(sm.qty), 0) *
      CASE
        WHEN SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END) = 0 THEN 0
        ELSE ROUND(
          SUM(CASE WHEN sm.qty > 0 THEN sm.qty * sm.unit_cost ELSE 0 END) /
          SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END), 2)
      END AS stock_value,
    p.is_active
  FROM public.products p
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = p.id
    AND sm.owner_id = public.get_manager_id()
  WHERE p.owner_id = public.get_manager_id()
    OR p.owner_id = auth.uid()
  GROUP BY p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category, p.price, p.is_active
  ORDER BY p.sort_order, p.name_ar;
$$;

-- ─── 12. RPC: Stock movement history ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stock_movement_history(
  p_product_id uuid    DEFAULT NULL,
  p_from       date    DEFAULT NULL,
  p_to         date    DEFAULT NULL
)
RETURNS TABLE (
  id             uuid,
  product_id     uuid,
  product_name   text,
  movement_type  text,
  qty            numeric,
  unit_cost      numeric,
  avg_cost_snapshot numeric,
  reference_type text,
  reference_id   uuid,
  notes          text,
  created_at     timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    sm.id,
    sm.product_id,
    p.name_ar AS product_name,
    sm.movement_type,
    sm.qty,
    sm.unit_cost,
    sm.avg_cost_snapshot,
    sm.reference_type,
    sm.reference_id,
    sm.notes,
    sm.created_at
  FROM public.stock_movements sm
  JOIN public.products p ON p.id = sm.product_id
  WHERE sm.owner_id = public.get_manager_id()
    AND (p_product_id IS NULL OR sm.product_id = p_product_id)
    AND (p_from IS NULL OR sm.created_at::date >= p_from)
    AND (p_to   IS NULL OR sm.created_at::date <= p_to)
  ORDER BY sm.created_at DESC;
$$;

-- ─── 13. RPC: Stock valuation report ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stock_valuation()
RETURNS TABLE (
  product_id  uuid,
  name_ar     text,
  unit        text,
  category    text,
  on_hand     numeric,
  avg_cost    numeric,
  stock_value numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    product_id, name_ar, unit, category, on_hand, avg_cost, stock_value
  FROM public.product_stock_summary()
  WHERE on_hand != 0
  ORDER BY category NULLS LAST, name_ar;
$$;

-- ─── 14. Update kpi_summary to include COGS & gross margin ───────────────────
-- We replace the existing function with an extended version.
-- The existing columns are preserved; cogs and gross_margin are added.
CREATE OR REPLACE FUNCTION public.kpi_summary(
  p_from date DEFAULT (date_trunc('month', current_date)::date),
  p_to   date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
  v_income    numeric;
  v_outcome   numeric;
  v_cash_sales  numeric;
  v_credit_sales numeric;
  v_receivables  numeric;
  v_payables     numeric;
  v_dso          numeric;
  v_days         int;
  v_avg_coll     numeric;
  v_rate_30      numeric;
  v_cogs         numeric;
  v_gross_margin numeric;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_days := (p_to - p_from) + 1;

  -- Cash sales
  SELECT COALESCE(SUM(
    CASE
      WHEN EXISTS (SELECT 1 FROM public.invoice_lines il
                   WHERE il.invoice_type='cash' AND il.invoice_id=ci.id AND il.owner_id=v_owner_id)
      THEN (SELECT SUM(line_total) FROM public.invoice_lines il
            WHERE il.invoice_type='cash' AND il.invoice_id=ci.id AND il.owner_id=v_owner_id)
      ELSE ci.amount
    END
  ), 0)
  INTO v_cash_sales
  FROM public.cash_invoices ci
  WHERE ci.owner_id = v_owner_id
    AND ci.date BETWEEN p_from AND p_to;

  -- Credit sales (new invoices in period by invoice date)
  SELECT COALESCE(SUM(
    CASE
      WHEN EXISTS (SELECT 1 FROM public.invoice_lines il
                   WHERE il.invoice_type='credit' AND il.invoice_id=cr.id AND il.owner_id=v_owner_id)
      THEN (SELECT SUM(line_total) FROM public.invoice_lines il
            WHERE il.invoice_type='credit' AND il.invoice_id=cr.id AND il.owner_id=v_owner_id)
      ELSE cr.amount
    END
  ), 0)
  INTO v_credit_sales
  FROM public.credit_invoices cr
  WHERE cr.owner_id = v_owner_id
    AND cr.date BETWEEN p_from AND p_to;

  -- Income = cash sales + payments received in period
  SELECT v_cash_sales + COALESCE(SUM(p.amount), 0)
  INTO v_income
  FROM public.payments p
  WHERE p.owner_id = v_owner_id
    AND p.date BETWEEN p_from AND p_to;

  -- Supplier payments (outcome)
  SELECT COALESCE(SUM(sp.amount), 0)
  INTO v_outcome
  FROM public.supplier_payments sp
  WHERE sp.owner_id = v_owner_id
    AND sp.payment_date BETWEEN p_from AND p_to;

  -- Supplier cash purchases also count as outcome
  v_outcome := v_outcome + COALESCE((
    SELECT SUM(total_amount)
    FROM public.supplier_purchases
    WHERE owner_id = v_owner_id
      AND payment_type = 'cash'
      AND purchase_date BETWEEN p_from AND p_to
  ), 0);

  -- Expenses
  v_outcome := v_outcome + COALESCE((
    SELECT SUM(amount)
    FROM public.expenses
    WHERE owner_id = v_owner_id
      AND date BETWEEN p_from AND p_to
  ), 0);

  -- Outstanding receivables (all unpaid credit as of p_to)
  SELECT COALESCE(SUM(
    CASE
      WHEN EXISTS (SELECT 1 FROM public.invoice_lines il
                   WHERE il.invoice_type='credit' AND il.invoice_id=cr.id AND il.owner_id=v_owner_id)
      THEN GREATEST(0,
             (SELECT SUM(line_total) FROM public.invoice_lines il
              WHERE il.invoice_type='credit' AND il.invoice_id=cr.id AND il.owner_id=v_owner_id)
             - cr.paid
             - COALESCE((SELECT SUM(amount) FROM public.payments p2 WHERE p2.credit_invoice_id = cr.id), 0))
      ELSE GREATEST(0, cr.amount - cr.paid
             - COALESCE((SELECT SUM(amount) FROM public.payments p2 WHERE p2.credit_invoice_id = cr.id), 0))
    END
  ), 0)
  INTO v_receivables
  FROM public.credit_invoices cr
  WHERE cr.owner_id = v_owner_id
    AND cr.date <= p_to;

  -- Payables
  SELECT COALESCE(SUM(
    sp.opening_balance
    + COALESCE((SELECT SUM(total_amount) FROM public.supplier_purchases pu
                WHERE pu.supplier_id=sp.id AND pu.payment_type='credit'), 0)
    - COALESCE((SELECT SUM(amount) FROM public.supplier_payments pa
                WHERE pa.supplier_id=sp.id), 0)
  ), 0)
  INTO v_payables
  FROM public.suppliers sp
  WHERE sp.owner_id = v_owner_id;

  -- DSO
  v_dso := CASE WHEN v_credit_sales > 0
    THEN ROUND(v_receivables / v_credit_sales * v_days, 1)
    ELSE 0 END;

  -- Avg collection days
  SELECT COALESCE(AVG(p.date - cr.date), 0)
  INTO v_avg_coll
  FROM public.payments p
  JOIN public.credit_invoices cr ON cr.id = p.credit_invoice_id
  WHERE p.owner_id = v_owner_id
    AND p.date BETWEEN p_from AND p_to
    AND p.credit_invoice_id IS NOT NULL;

  -- Collection rate within 30d
  SELECT CASE WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(100.0 * COUNT(*) FILTER (
      WHERE COALESCE((
        SELECT MIN(pp.date) FROM public.payments pp WHERE pp.credit_invoice_id = cr.id
      ), p_to + 1) - cr.date <= 30
    ) / COUNT(*), 1)
  END
  INTO v_rate_30
  FROM public.credit_invoices cr
  WHERE cr.owner_id = v_owner_id
    AND cr.date BETWEEN p_from AND p_to;

  -- COGS = sum of avg_cost_snapshot * abs(qty) for 'out' movements in period
  SELECT COALESCE(SUM(ABS(sm.qty) * COALESCE(sm.avg_cost_snapshot, sm.unit_cost)), 0)
  INTO v_cogs
  FROM public.stock_movements sm
  WHERE sm.owner_id = v_owner_id
    AND sm.movement_type = 'out'
    AND sm.created_at::date BETWEEN p_from AND p_to
    AND sm.reference_type IN ('cash_invoice','credit_invoice');

  v_gross_margin := (v_cash_sales + v_credit_sales) - v_cogs;

  RETURN jsonb_build_object(
    'income',               v_income,
    'outcome',              v_outcome,
    'net_profit',           v_income - v_outcome,
    'cash_sales',           v_cash_sales,
    'credit_sales',         v_credit_sales,
    'receivables',          v_receivables,
    'payables',             v_payables,
    'dso',                  v_dso,
    'avg_collection_days',  v_avg_coll,
    'collection_rate_30d',  v_rate_30,
    'cogs',                 v_cogs,
    'gross_margin',         v_gross_margin
  );
END;
$$;

-- ─── 15. Update cashflow_series to also expose COGS ─────────────────────────
-- (unchanged signature, just patched for completeness if already exists)
-- The existing cashflow_series is kept as-is for the chart; COGS is in kpi_summary.

-- ─── 16. Grant execute to authenticated ───────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.save_cash_invoice(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_credit_invoice(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_cash_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_credit_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_stock(uuid, numeric, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_movement_history(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_valuation() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_summary(date, date) TO authenticated;
