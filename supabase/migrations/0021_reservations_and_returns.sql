-- Migration 0021 (Named 006_reservations_and_returns for specs): Stock Reservations (ATP) & Formal Sales Returns
-- 1. Adds status to cash_invoices and credit_invoices ('draft', 'confirmed', 'cancelled')
-- 2. Row locks products and calculates ATP = On Hand - Reserved (from draft invoices)
-- 3. Supports draft reservation and confirmed stock deduction in save_cash_invoice and save_credit_invoice
-- 4. Creates sales_returns and sales_return_lines with salable vs damaged condition handling
-- 5. Updates customer_statement and kpi_summary for sales returns

-- ─── 1. Invoices status column ('draft', 'confirmed', 'cancelled') ──────────
ALTER TABLE public.cash_invoices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('draft', 'confirmed', 'cancelled'));

ALTER TABLE public.credit_invoices
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed'
  CHECK (status IN ('draft', 'confirmed', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_cash_invoices_status ON public.cash_invoices (owner_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_invoices_status ON public.credit_invoices (owner_id, status);

-- ─── 2. Helpers: product_reserved_qty and product_atp ─────────────────────────
CREATE OR REPLACE FUNCTION public.product_reserved_qty(p_owner_id uuid, p_product_id uuid)
RETURNS numeric(14,4)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(il.qty), 0)
  FROM public.invoice_lines il
  WHERE il.owner_id = p_owner_id
    AND il.product_id = p_product_id
    AND (
      (il.invoice_type = 'cash' AND EXISTS (
        SELECT 1 FROM public.cash_invoices ci 
        WHERE ci.id = il.invoice_id AND ci.owner_id = p_owner_id AND ci.status = 'draft'
      ))
      OR
      (il.invoice_type = 'credit' AND EXISTS (
        SELECT 1 FROM public.credit_invoices cri 
        WHERE cri.id = il.invoice_id AND cri.owner_id = p_owner_id AND cri.status = 'draft'
      ))
    );
$$;

CREATE OR REPLACE FUNCTION public.product_atp(p_owner_id uuid, p_product_id uuid)
RETURNS numeric(14,4)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.product_on_hand(p_owner_id, p_product_id) - public.product_reserved_qty(p_owner_id, p_product_id);
$$;

-- ─── 3. Updated product_stock_summary_v2 with ATP & Reserved ──────────────────
CREATE OR REPLACE FUNCTION public.product_stock_summary_v2()
RETURNS TABLE (
  product_id      uuid,
  name_ar         text,
  name_en         text,
  sku             text,
  unit            text,
  category        text,
  price           numeric,
  on_hand         numeric,
  reserved_qty    numeric,
  available_qty   numeric,
  avg_cost        numeric,
  stock_value     numeric,
  min_stock_alert numeric,
  expiry_date     date,
  batch_number    text,
  days_to_expiry  integer,
  alert_status    text,
  is_active       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH reserved AS (
    SELECT 
      il.product_id,
      SUM(il.qty) AS res_qty
    FROM public.invoice_lines il
    WHERE il.owner_id = public.get_manager_id()
      AND (
        (il.invoice_type = 'cash' AND EXISTS (
          SELECT 1 FROM public.cash_invoices ci 
          WHERE ci.id = il.invoice_id AND ci.owner_id = public.get_manager_id() AND ci.status = 'draft'
        ))
        OR
        (il.invoice_type = 'credit' AND EXISTS (
          SELECT 1 FROM public.credit_invoices cri 
          WHERE cri.id = il.invoice_id AND cri.owner_id = public.get_manager_id() AND cri.status = 'draft'
        ))
      )
    GROUP BY il.product_id
  )
  SELECT
    p.id,
    p.name_ar,
    p.name_en,
    p.sku,
    p.unit,
    p.category,
    p.price,
    COALESCE(SUM(sm.qty), 0) AS on_hand,
    COALESCE(r.res_qty, 0) AS reserved_qty,
    (COALESCE(SUM(sm.qty), 0) - COALESCE(r.res_qty, 0)) AS available_qty,
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
    COALESCE(p.min_stock_alert, 0) AS min_stock_alert,
    p.expiry_date,
    p.batch_number,
    CASE 
      WHEN p.expiry_date IS NOT NULL THEN (p.expiry_date - CURRENT_DATE)
      ELSE NULL
    END AS days_to_expiry,
    CASE
      -- Out of stock / ATP depleted
      WHEN (COALESCE(SUM(sm.qty), 0) - COALESCE(r.res_qty, 0)) <= 0 THEN 'out_of_stock'
      -- Expired
      WHEN p.expiry_date IS NOT NULL AND p.expiry_date < CURRENT_DATE THEN 'expired'
      -- Expiring soon
      WHEN p.expiry_date IS NOT NULL AND (p.expiry_date - CURRENT_DATE) <= 30 THEN 'expiring_soon'
      -- Low ATP
      WHEN p.min_stock_alert > 0 AND (COALESCE(SUM(sm.qty), 0) - COALESCE(r.res_qty, 0)) <= p.min_stock_alert THEN 'low_stock'
      ELSE 'ok'
    END AS alert_status,
    p.is_active
  FROM public.products p
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = p.id
    AND sm.owner_id = public.get_manager_id()
  LEFT JOIN reserved r ON r.product_id = p.id
  WHERE p.owner_id = public.get_manager_id()
    OR p.owner_id = auth.uid()
  GROUP BY 
    p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category, 
    p.price, p.min_stock_alert, p.expiry_date, p.batch_number, p.is_active, p.sort_order, r.res_qty
  ORDER BY p.sort_order, p.name_ar;
$$;

-- ─── 4. Updated save_cash_invoice() with ATP validation & Row Locking ─────────
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
  v_status        text := COALESCE(p_invoice->>'status', 'confirmed');
  v_prev_status   text := NULL;
  v_allow_neg     boolean;
  v_line          jsonb;
  v_product_id    uuid;
  v_qty           numeric(14,4);
  v_unit_price    numeric(14,2);
  v_atp           numeric(14,4);
  v_avg_cost      numeric(14,2);
  v_product_name  text;
  v_pids          uuid[];
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT allow_negative_stock INTO v_allow_neg
  FROM public.app_settings WHERE owner_id = v_owner_id;
  v_allow_neg := COALESCE(v_allow_neg, false);

  -- Collect product IDs for row-level locking
  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND (owner_id = v_owner_id OR owner_id = auth.uid())
    ORDER BY id FOR UPDATE;
  END IF;

  -- Upsert invoice header
  IF p_invoice->>'id' IS NOT NULL AND p_invoice->>'id' != '' THEN
    v_invoice_id := (p_invoice->>'id')::uuid;

    SELECT status INTO v_prev_status
    FROM public.cash_invoices
    WHERE id = v_invoice_id AND owner_id = v_owner_id;

    UPDATE public.cash_invoices SET
      date       = (p_invoice->>'date')::date,
      invoice_no = p_invoice->>'invoice_no',
      customer_id= NULLIF(p_invoice->>'customer_id','')::uuid,
      rep_id     = NULLIF(p_invoice->>'rep_id','')::uuid,
      item       = COALESCE(p_invoice->>'item', ''),
      notes      = p_invoice->>'notes',
      status     = v_status,
      amount     = 0
    WHERE id = v_invoice_id AND owner_id = v_owner_id;

    -- If previously confirmed, reverse old physical stock deductions
    IF v_prev_status = 'confirmed' THEN
      INSERT INTO public.stock_movements
        (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
         reference_type, reference_id, notes, created_by)
      SELECT
        owner_id, product_id, 'adjustment',
        -1 * qty,
        unit_cost, unit_cost,
        'reversal', id,
        'تصحيح تعديل فاتورة نقدية ' || v_invoice_id::text,
        auth.uid()
      FROM public.stock_movements
      WHERE reference_type = 'cash_invoice'
        AND reference_id = v_invoice_id
        AND owner_id = v_owner_id
        AND movement_type = 'out';
    END IF;

    -- Delete old lines
    DELETE FROM public.invoice_lines
    WHERE invoice_type = 'cash' AND invoice_id = v_invoice_id AND owner_id = v_owner_id;

  ELSE
    INSERT INTO public.cash_invoices
      (owner_id, date, invoice_no, customer_id, rep_id, item, notes, status, amount)
    VALUES (
      v_owner_id,
      (p_invoice->>'date')::date,
      p_invoice->>'invoice_no',
      NULLIF(p_invoice->>'customer_id','')::uuid,
      NULLIF(p_invoice->>'rep_id','')::uuid,
      COALESCE(p_invoice->>'item', ''),
      p_invoice->>'notes',
      v_status,
      0
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  -- Insert new lines
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id  := (v_line->>'product_id')::uuid;
    v_qty         := (v_line->>'qty')::numeric;
    v_unit_price  := (v_line->>'unit_price')::numeric;

    -- ATP Check (Available to Promise)
    v_atp := public.product_atp(v_owner_id, v_product_id);
    IF NOT v_allow_neg AND v_status != 'cancelled' AND v_atp < v_qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'الكمية المتاحة للطلب (ATP) من "%" هي % فقط والمطلوب %',
        COALESCE(v_product_name, v_product_id::text), v_atp, v_qty;
    END IF;

    v_avg_cost := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.invoice_lines
      (owner_id, invoice_type, invoice_id, product_id, qty, unit_price)
    VALUES (v_owner_id, 'cash', v_invoice_id, v_product_id, v_qty, v_unit_price);

    -- Only confirmed invoices trigger physical negative stock_movements
    IF v_status = 'confirmed' THEN
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
    END IF;
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

-- ─── 5. Updated save_credit_invoice() with ATP validation & Row Locking ────────
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
  v_status        text := COALESCE(p_invoice->>'status', 'confirmed');
  v_prev_status   text := NULL;
  v_allow_neg     boolean;
  v_line          jsonb;
  v_product_id    uuid;
  v_qty           numeric(14,4);
  v_unit_price    numeric(14,2);
  v_atp           numeric(14,4);
  v_avg_cost      numeric(14,2);
  v_product_name  text;
  v_pids          uuid[];
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT allow_negative_stock INTO v_allow_neg
  FROM public.app_settings WHERE owner_id = v_owner_id;
  v_allow_neg := COALESCE(v_allow_neg, false);

  -- Row-level locking
  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND (owner_id = v_owner_id OR owner_id = auth.uid())
    ORDER BY id FOR UPDATE;
  END IF;

  IF p_invoice->>'id' IS NOT NULL AND p_invoice->>'id' != '' THEN
    v_invoice_id := (p_invoice->>'id')::uuid;

    SELECT status INTO v_prev_status
    FROM public.credit_invoices
    WHERE id = v_invoice_id AND owner_id = v_owner_id;

    UPDATE public.credit_invoices SET
      date       = (p_invoice->>'date')::date,
      invoice_no = p_invoice->>'invoice_no',
      customer_id= NULLIF(p_invoice->>'customer_id','')::uuid,
      rep_id     = NULLIF(p_invoice->>'rep_id','')::uuid,
      item       = COALESCE(p_invoice->>'item', ''),
      due_date   = NULLIF(p_invoice->>'due_date','')::date,
      status     = v_status,
      amount     = 0
    WHERE id = v_invoice_id AND owner_id = v_owner_id;

    IF v_prev_status = 'confirmed' THEN
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
    END IF;

    DELETE FROM public.invoice_lines
    WHERE invoice_type = 'credit' AND invoice_id = v_invoice_id AND owner_id = v_owner_id;

  ELSE
    INSERT INTO public.credit_invoices
      (owner_id, date, invoice_no, customer_id, rep_id, item, due_date, amount, paid, status)
    VALUES (
      v_owner_id,
      (p_invoice->>'date')::date,
      p_invoice->>'invoice_no',
      NULLIF(p_invoice->>'customer_id','')::uuid,
      NULLIF(p_invoice->>'rep_id','')::uuid,
      COALESCE(p_invoice->>'item', ''),
      NULLIF(p_invoice->>'due_date','')::date,
      0,
      COALESCE((p_invoice->>'paid')::numeric, 0),
      v_status
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;

    v_atp := public.product_atp(v_owner_id, v_product_id);
    IF NOT v_allow_neg AND v_status != 'cancelled' AND v_atp < v_qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'الكمية المتاحة للطلب (ATP) من "%" هي % فقط والمطلوب %',
        COALESCE(v_product_name, v_product_id::text), v_atp, v_qty;
    END IF;

    v_avg_cost := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.invoice_lines
      (owner_id, invoice_type, invoice_id, product_id, qty, unit_price)
    VALUES (v_owner_id, 'credit', v_invoice_id, v_product_id, v_qty, v_unit_price);

    IF v_status = 'confirmed' THEN
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
    END IF;
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

-- ─── 6. Sales Returns Schema & RLS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_returns (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id   uuid          NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  rep_id        uuid          REFERENCES public.reps(id) ON DELETE SET NULL,
  invoice_type  text          CHECK (invoice_type IN ('cash', 'credit', 'direct')),
  invoice_id    uuid,
  return_date   date          NOT NULL DEFAULT current_date,
  refund_method text          NOT NULL CHECK (refund_method IN ('credit_balance', 'cash_refund')),
  total_amount  numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes         text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sales_return_lines (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id         uuid          NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
  product_id        uuid          NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty               numeric(14,4) NOT NULL CHECK (qty > 0),
  unit_price        numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  avg_cost_snapshot numeric(14,4) NOT NULL DEFAULT 0,
  condition         text          NOT NULL CHECK (condition IN ('salable', 'damaged')),
  line_total        numeric(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_cust ON public.sales_returns (owner_id, customer_id, return_date);
CREATE INDEX IF NOT EXISTS idx_sales_return_lines_ret ON public.sales_return_lines (return_id);

ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_return_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "manager_all_sales_returns" ON public.sales_returns;
CREATE POLICY "manager_all_sales_returns" ON public.sales_returns
  FOR ALL
  USING (public.is_manager() AND owner_id = public.get_manager_id())
  WITH CHECK (public.is_manager() AND owner_id = public.get_manager_id());

DROP POLICY IF EXISTS "rep_read_own_sales_returns" ON public.sales_returns;
CREATE POLICY "rep_read_own_sales_returns" ON public.sales_returns
  FOR SELECT
  USING (
    NOT public.is_manager()
    AND owner_id = public.get_manager_id()
    AND rep_id = public.get_current_rep_id()
  );

DROP POLICY IF EXISTS "manager_all_sales_return_lines" ON public.sales_return_lines;
CREATE POLICY "manager_all_sales_return_lines" ON public.sales_return_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_returns sr
      WHERE sr.id = sales_return_lines.return_id
        AND sr.owner_id = public.get_manager_id()
        AND public.is_manager()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_returns sr
      WHERE sr.id = sales_return_lines.return_id
        AND sr.owner_id = public.get_manager_id()
        AND public.is_manager()
    )
  );

DROP POLICY IF EXISTS "rep_read_sales_return_lines" ON public.sales_return_lines;
CREATE POLICY "rep_read_sales_return_lines" ON public.sales_return_lines
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sales_returns sr
      WHERE sr.id = sales_return_lines.return_id
        AND sr.owner_id = public.get_manager_id()
        AND sr.rep_id = public.get_current_rep_id()
        AND NOT public.is_manager()
    )
  );

-- ─── 7. RPC: process_sales_return() ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_sales_return(
  p_return jsonb,
  p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id      uuid := public.get_manager_id();
  v_return_id     uuid;
  v_line          jsonb;
  v_product_id    uuid;
  v_qty           numeric(14,4);
  v_unit_price    numeric(14,2);
  v_condition     text;
  v_avg_cost      numeric(14,2);
  v_total_amount  numeric(14,2) := 0;
  v_pids          uuid[];
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Lock products
  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND (owner_id = v_owner_id OR owner_id = auth.uid())
    ORDER BY id FOR UPDATE;
  END IF;

  -- Insert return header
  INSERT INTO public.sales_returns (
    owner_id,
    customer_id,
    rep_id,
    invoice_type,
    invoice_id,
    return_date,
    refund_method,
    total_amount,
    notes
  ) VALUES (
    v_owner_id,
    (p_return->>'customer_id')::uuid,
    NULLIF(p_return->>'rep_id', '')::uuid,
    NULLIF(p_return->>'invoice_type', ''),
    NULLIF(p_return->>'invoice_id', '')::uuid,
    COALESCE(NULLIF(p_return->>'return_date', '')::date, current_date),
    COALESCE(p_return->>'refund_method', 'credit_balance'),
    0,
    p_return->>'notes'
  )
  RETURNING id INTO v_return_id;

  -- Insert lines and handle inventory
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id  := (v_line->>'product_id')::uuid;
    v_qty         := (v_line->>'qty')::numeric;
    v_unit_price  := (v_line->>'unit_price')::numeric;
    v_condition   := COALESCE(v_line->>'condition', 'salable');
    v_avg_cost    := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.sales_return_lines (
      return_id,
      product_id,
      qty,
      unit_price,
      avg_cost_snapshot,
      condition
    ) VALUES (
      v_return_id,
      v_product_id,
      v_qty,
      v_unit_price,
      v_avg_cost,
      v_condition
    );

    v_total_amount := v_total_amount + (v_qty * v_unit_price);

    -- Stock Movement logic
    IF v_condition = 'salable' THEN
      -- Returns back into sellable inventory (Inward stock movement)
      INSERT INTO public.stock_movements (
        owner_id,
        product_id,
        movement_type,
        qty,
        unit_cost,
        avg_cost_snapshot,
        reference_type,
        reference_id,
        notes,
        created_by
      ) VALUES (
        v_owner_id,
        v_product_id,
        'in',
        v_qty,
        v_avg_cost,
        v_avg_cost,
        'sales_return',
        v_return_id,
        'مرتجع مبيعات سليم - استرداد للمخزن',
        auth.uid()
      );
    ELSE
      -- Damaged: logged with 0 qty delta so stock is NOT increased, keeping audit trail
      INSERT INTO public.stock_movements (
        owner_id,
        product_id,
        movement_type,
        qty,
        unit_cost,
        avg_cost_snapshot,
        reference_type,
        reference_id,
        notes,
        created_by
      ) VALUES (
        v_owner_id,
        v_product_id,
        'adjustment',
        0,
        v_avg_cost,
        v_avg_cost,
        'sales_return_spoilage',
        v_return_id,
        'مرتجع مبيعات تالف / هالك - لا يضاف للمخزون الصالح',
        auth.uid()
      );
    END IF;
  END LOOP;

  -- Update total_amount on return header
  UPDATE public.sales_returns
  SET total_amount = v_total_amount
  WHERE id = v_return_id;

  RETURN v_return_id;
END;
$$;

-- ─── 8. Update v_customer_transactions & customer_statement() ────────────────
CREATE OR REPLACE VIEW public.v_customer_transactions AS
  SELECT
    ci.owner_id,
    ci.customer_id,
    ci.date AS tx_date,
    'invoice'::text AS kind,
    ci.invoice_no AS ref,
    COALESCE(ci.item, 'فاتورة آجل') AS description,
    ci.amount AS amount,
    ci.created_at,
    ci.id
  FROM public.credit_invoices ci
  WHERE ci.customer_id IS NOT NULL AND ci.status = 'confirmed'
  UNION ALL
  SELECT
    p.owner_id,
    p.customer_id,
    p.date AS tx_date,
    'payment'::text AS kind,
    COALESCE(ci.invoice_no, 'دفعة') AS ref,
    CASE WHEN p.method IS NOT NULL THEN 'سداد - ' || p.method ELSE 'سداد دفعة' END AS description,
    p.amount AS amount,
    p.created_at,
    p.id
  FROM public.payments p
  LEFT JOIN public.credit_invoices ci ON ci.id = p.credit_invoice_id
  WHERE p.customer_id IS NOT NULL
  UNION ALL
  SELECT
    sr.owner_id,
    sr.customer_id,
    sr.return_date AS tx_date,
    'return'::text AS kind,
    'مرتجع'::text AS ref,
    'مرتجع مبيعات (إضافة لرصيد العميل)'::text AS description,
    sr.total_amount AS amount,
    sr.created_at,
    sr.id
  FROM public.sales_returns sr
  WHERE sr.customer_id IS NOT NULL AND sr.refund_method = 'credit_balance';

CREATE OR REPLACE FUNCTION public.customer_statement(
  p_customer_id uuid,
  p_from date default '2000-01-01',
  p_to date default '2099-12-31'
)
RETURNS TABLE(
  row_no bigint,
  tx_date date,
  tx_type text,
  ref text,
  description text,
  debit numeric,
  credit numeric,
  balance numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH opening AS (
    SELECT COALESCE(c.opening_balance, 0)
         + COALESCE(SUM(CASE WHEN t.kind = 'invoice' THEN t.amount ELSE -t.amount END), 0) AS bal
    FROM public.customers c
    LEFT JOIN public.v_customer_transactions t
      ON t.customer_id = c.id AND t.tx_date < p_from
    WHERE c.id = p_customer_id
    GROUP BY c.id, c.opening_balance
  ),
  period AS (
    SELECT 
      t.id,
      t.tx_date,
      t.kind,
      t.ref,
      t.description,
      t.created_at,
      CASE WHEN t.kind = 'invoice' THEN t.amount ELSE 0 END AS debit,
      CASE WHEN t.kind != 'invoice' THEN t.amount ELSE 0 END AS credit
    FROM public.v_customer_transactions t
    WHERE t.customer_id = p_customer_id AND t.tx_date BETWEEN p_from AND p_to
  )
  SELECT 
    0::bigint AS row_no,
    p_from AS tx_date,
    'opening'::text AS tx_type,
    NULL::text AS ref,
    'رصيد أول المدة'::text AS description,
    NULL::numeric AS debit,
    NULL::numeric AS credit,
    COALESCE((SELECT bal FROM opening), 0) AS balance
  UNION ALL
  SELECT 
    row_number() OVER (ORDER BY tx_date, created_at, id) AS row_no,
    tx_date,
    kind AS tx_type,
    ref,
    description,
    debit,
    credit,
    COALESCE((SELECT bal FROM opening), 0) + SUM(debit - credit) OVER (ORDER BY tx_date, created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance
  FROM period
  ORDER BY row_no;
$$;

-- ─── 9. Update kpi_summary() ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.kpi_summary(
  p_from date DEFAULT (date_trunc('month', current_date)::date),
  p_to   date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id      uuid := public.get_manager_id();
  v_income        numeric;
  v_outcome       numeric;
  v_cash_sales    numeric;
  v_credit_sales  numeric;
  v_receivables   numeric;
  v_payables      numeric;
  v_dso           numeric;
  v_days          int;
  v_avg_coll      numeric;
  v_rate_30       numeric;
  v_cogs          numeric;
  v_gross_margin  numeric;
  v_returns_cash  numeric;
  v_returns_credit numeric;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_days := (p_to - p_from) + 1;

  -- Sales returns in period
  SELECT COALESCE(SUM(CASE WHEN refund_method = 'cash_refund' THEN total_amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN refund_method = 'credit_balance' THEN total_amount ELSE 0 END), 0)
  INTO v_returns_cash, v_returns_credit
  FROM public.sales_returns
  WHERE owner_id = v_owner_id
    AND return_date BETWEEN p_from AND p_to;

  -- Cash sales (confirmed only)
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
    AND ci.status = 'confirmed'
    AND ci.date BETWEEN p_from AND p_to;

  -- Credit sales (confirmed only)
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
    AND cr.status = 'confirmed'
    AND cr.date BETWEEN p_from AND p_to;

  -- Income = cash sales + customer payments - cash refunds
  SELECT (v_cash_sales + COALESCE(SUM(p.amount), 0) - v_returns_cash)
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
      AND expense_date BETWEEN p_from AND p_to
  ), 0);

  -- Receivables (unpaid confirmed credit minus credit returns)
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
    AND cr.status = 'confirmed'
    AND cr.date <= p_to;

  v_receivables := GREATEST(0, v_receivables - v_returns_credit);

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
  v_dso := CASE WHEN (v_credit_sales - v_returns_credit) > 0
    THEN ROUND(v_receivables / (v_credit_sales - v_returns_credit) * v_days, 1)
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
    AND cr.status = 'confirmed'
    AND cr.date BETWEEN p_from AND p_to;

  -- COGS = sum of avg_cost_snapshot * abs(qty) for 'out' movements minus salable returns in period
  SELECT COALESCE(SUM(ABS(sm.qty) * COALESCE(sm.avg_cost_snapshot, sm.unit_cost)), 0)
  INTO v_cogs
  FROM public.stock_movements sm
  WHERE sm.owner_id = v_owner_id
    AND sm.movement_type = 'out'
    AND sm.created_at::date BETWEEN p_from AND p_to
    AND sm.reference_type IN ('cash_invoice','credit_invoice');

  -- Deduct salable returned stock cost from COGS
  v_cogs := GREATEST(0, v_cogs - COALESCE((
    SELECT SUM(srl.qty * srl.avg_cost_snapshot)
    FROM public.sales_return_lines srl
    JOIN public.sales_returns sr ON sr.id = srl.return_id
    WHERE sr.owner_id = v_owner_id
      AND sr.return_date BETWEEN p_from AND p_to
      AND srl.condition = 'salable'
  ), 0));

  v_gross_margin := ((v_cash_sales + v_credit_sales) - (v_returns_cash + v_returns_credit)) - v_cogs;

  RETURN jsonb_build_object(
    'income',               v_income,
    'outcome',              v_outcome,
    'net_profit',           v_income - v_outcome,
    'cash_sales',           v_cash_sales,
    'credit_sales',         v_credit_sales,
    'returns_total',        v_returns_cash + v_returns_credit,
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

-- ─── 10. Grants ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.product_reserved_qty(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_atp(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_summary_v2() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_cash_invoice(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_credit_invoice(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_sales_return(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.customer_statement(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_summary(date, date) TO authenticated;
