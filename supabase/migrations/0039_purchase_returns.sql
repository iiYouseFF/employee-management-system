-- 0039_purchase_returns.sql
-- Supplier purchase returns (مرتجعات المشتريات): return purchased goods to a supplier.
--
-- Adds:
--   1) supplier_returns + supplier_return_lines (RLS: manager only, tenant scoped).
--   2) save_supplier_return(jsonb,jsonb) / delete_supplier_return(uuid) RPCs that
--      keep stock movements and the header total in sync on create/edit/delete.
--   3) Purchase returns in the supplier ledger, kpi_summary() and cashflow_series().
--
-- Sign conventions: a return that reduces the supplier payable is a DEBIT on the
-- supplier statement (like a payment to the supplier); a cash refund reduces the
-- cash outcome in KPIs. All stock movements use qty < 0 for 'out'.
--
-- Additive and idempotent: CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE.
-- No applied migration or existing data is rewritten.
--
-- Rollback notes:
--   DROP FUNCTION IF EXISTS public.save_supplier_return(jsonb, jsonb);
--   DROP FUNCTION IF EXISTS public.delete_supplier_return(uuid);
--   DROP VIEW IF EXISTS public.v_supplier_transactions; -- then recreate the 2-branch version from 0013/0024
--   DROP FUNCTION IF EXISTS public.supplier_statement(uuid, date, date);
--   DROP FUNCTION IF EXISTS public.kpi_summary(date, date);
--   DROP FUNCTION IF EXISTS public.cashflow_series(date, date);
--   DROP TABLE IF EXISTS public.supplier_return_lines;
--   DROP TABLE IF EXISTS public.supplier_returns;
--   (Stock movements already written are NOT removed by the rollback.)

-- ─── 1. Tables ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_returns (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
                                  DEFAULT public.current_owner_id(),
  supplier_id       uuid          NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_id       uuid          REFERENCES public.supplier_purchases(id) ON DELETE SET NULL,
  return_date       date          NOT NULL DEFAULT current_date,
  settlement_method text          NOT NULL CHECK (settlement_method IN ('reduce_payable', 'cash_refund')),
  total_amount      numeric(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes             text,
  created_by        uuid          REFERENCES auth.users(id),
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_return_lines (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id          uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
                                  DEFAULT public.current_owner_id(),
  return_id         uuid          NOT NULL REFERENCES public.supplier_returns(id) ON DELETE CASCADE,
  product_id        uuid          NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty               numeric(14,4) NOT NULL CHECK (qty > 0),
  unit_cost         numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  avg_cost_snapshot numeric(14,4) NOT NULL DEFAULT 0,
  line_total        numeric(14,2) GENERATED ALWAYS AS (qty * unit_cost) STORED,
  created_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_returns_owner_supp
  ON public.supplier_returns (owner_id, supplier_id, return_date);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_purchase
  ON public.supplier_returns (purchase_id);
CREATE INDEX IF NOT EXISTS idx_supplier_return_lines_return
  ON public.supplier_return_lines (owner_id, return_id);

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_return_lines ENABLE ROW LEVEL SECURITY;

-- No direct client DML: all writes go through the security-definer RPCs.
DROP POLICY IF EXISTS "manager_all_supplier_returns" ON public.supplier_returns;
CREATE POLICY "manager_all_supplier_returns" ON public.supplier_returns
  FOR ALL
  USING (public.is_manager() AND owner_id = public.get_manager_id())
  WITH CHECK (public.is_manager() AND owner_id = public.get_manager_id());

DROP POLICY IF EXISTS "manager_all_supplier_return_lines" ON public.supplier_return_lines;
CREATE POLICY "manager_all_supplier_return_lines" ON public.supplier_return_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.supplier_returns sr
      WHERE sr.id = supplier_return_lines.return_id
        AND sr.owner_id = public.get_manager_id()
        AND public.is_manager()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.supplier_returns sr
      WHERE sr.id = supplier_return_lines.return_id
        AND sr.owner_id = public.get_manager_id()
        AND public.is_manager()
    )
  );

REVOKE ALL ON public.supplier_returns FROM anon;
REVOKE ALL ON public.supplier_return_lines FROM anon;
GRANT SELECT ON public.supplier_returns TO authenticated;
GRANT SELECT ON public.supplier_return_lines TO authenticated;

-- ─── 2. Save return (create/edit, with stock-out) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.save_supplier_return(
  p_return jsonb,
  p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id         uuid := public.get_manager_id();
  v_return_id        uuid;
  v_supplier_id      uuid;
  v_purchase_id      uuid;
  v_return_date      date;
  v_settlement       text;
  v_notes            text;
  v_line             jsonb;
  v_product_id       uuid;
  v_qty              numeric(14,4);
  v_unit_cost        numeric(14,2);
  v_available        numeric(14,4);
  v_purchased_qty    numeric(14,4);
  v_already_returned numeric(14,4);
  v_avg_cost         numeric(14,2);
  v_product_name     text;
  v_total_amount     numeric(14,2) := 0;
  v_pids             uuid[];
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'يجب إضافة صنف واحد على الأقل لمرتجع المشتريات';
  END IF;

  v_supplier_id  := NULLIF(p_return->>'supplier_id', '')::uuid;
  v_purchase_id  := NULLIF(p_return->>'purchase_id', '')::uuid;
  v_return_date  := COALESCE(NULLIF(p_return->>'return_date', '')::date, current_date);
  v_settlement   := COALESCE(NULLIF(p_return->>'settlement_method', ''), 'reduce_payable');
  v_notes        := NULLIF(p_return->>'notes', '');

  IF v_supplier_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = v_supplier_id AND owner_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'المورد غير موجود';
  END IF;
  IF v_settlement NOT IN ('reduce_payable', 'cash_refund') THEN
    RAISE EXCEPTION 'طريقة معالجة المرتجع غير صالحة';
  END IF;
  IF v_purchase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_purchases
    WHERE id = v_purchase_id AND owner_id = v_owner_id AND supplier_id = v_supplier_id
  ) THEN
    RAISE EXCEPTION 'فاتورة المشتريات المحددة غير موجودة لهذا المورد';
  END IF;

  -- Lock the products that will receive an outgoing movement.
  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND owner_id = v_owner_id
    ORDER BY id FOR UPDATE;
  END IF;

  IF NULLIF(p_return->>'id', '') IS NOT NULL THEN
    v_return_id := (p_return->>'id')::uuid;

    -- Lock the header so a concurrent delete/edit cannot reverse the same rows.
    PERFORM 1 FROM public.supplier_returns
    WHERE id = v_return_id AND owner_id = v_owner_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'مرتجع المشتريات غير موجود';
    END IF;

    -- Put back the stock taken out by the previous version of this return.
    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    SELECT
      owner_id, product_id, 'adjustment', -1 * qty, unit_cost, avg_cost_snapshot,
      'reversal', id,
      'تعديل مرتجع مشتريات ' || v_return_id::text,
      auth.uid()
    FROM public.stock_movements
    WHERE reference_type = 'supplier_return'
      AND reference_id = v_return_id
      AND owner_id = v_owner_id
      AND movement_type = 'out';

    DELETE FROM public.supplier_return_lines
    WHERE return_id = v_return_id AND owner_id = v_owner_id;

    UPDATE public.supplier_returns
    SET supplier_id       = v_supplier_id,
        purchase_id       = v_purchase_id,
        return_date       = v_return_date,
        settlement_method = v_settlement,
        notes             = v_notes,
        total_amount      = 0
    WHERE id = v_return_id AND owner_id = v_owner_id;
  ELSE
    INSERT INTO public.supplier_returns
      (owner_id, supplier_id, purchase_id, return_date, settlement_method,
       total_amount, notes, created_by)
    VALUES
      (v_owner_id, v_supplier_id, v_purchase_id, v_return_date, v_settlement,
       0, v_notes, auth.uid())
    RETURNING id INTO v_return_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_cost  := COALESCE((v_line->>'unit_cost')::numeric, 0);

    IF v_product_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND owner_id = v_owner_id
    ) THEN
      RAISE EXCEPTION 'أحد المنتجات المختارة غير موجود';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;
    IF v_unit_cost < 0 THEN
      RAISE EXCEPTION 'تكلفة الوحدة لا يمكن أن تكون سالبة';
    END IF;

    v_available := public.product_on_hand(v_owner_id, v_product_id);
    IF v_available < v_qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'لا يمكن إرجاع "%": الكمية المتاحة في المخزون (%) أقل من الكمية المطلوبة (%)',
        COALESCE(v_product_name, v_product_id::text), v_available, v_qty;
    END IF;

    -- If linked to a purchase, never return more than that invoice actually received.
    IF v_purchase_id IS NOT NULL THEN
      SELECT COALESCE(SUM(qty), 0) INTO v_purchased_qty
      FROM public.supplier_purchase_lines
      WHERE owner_id = v_owner_id AND purchase_id = v_purchase_id AND product_id = v_product_id;

      IF v_purchased_qty > 0 THEN
        SELECT COALESCE(SUM(srl.qty), 0) INTO v_already_returned
        FROM public.supplier_return_lines srl
        JOIN public.supplier_returns sr ON sr.id = srl.return_id
        WHERE sr.owner_id = v_owner_id
          AND sr.purchase_id = v_purchase_id
          AND srl.product_id = v_product_id
          AND sr.id <> v_return_id;

        IF v_already_returned + v_qty > v_purchased_qty THEN
          SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
          RAISE EXCEPTION 'لا يمكن إرجاع "%": الكمية المرتجعة تتجاوز كمية فاتورة المشتريات (%)',
            COALESCE(v_product_name, v_product_id::text), v_purchased_qty;
        END IF;
      END IF;
    END IF;

    v_avg_cost := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.supplier_return_lines
      (owner_id, return_id, product_id, qty, unit_cost, avg_cost_snapshot)
    VALUES
      (v_owner_id, v_return_id, v_product_id, v_qty, v_unit_cost, v_avg_cost);

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    VALUES
      (v_owner_id, v_product_id, 'out', -v_qty, v_unit_cost, v_avg_cost,
       'supplier_return', v_return_id,
       'مرتجع مشتريات ' || COALESCE(v_notes, v_return_id::text), auth.uid());

    v_total_amount := v_total_amount + (v_qty * v_unit_cost);
  END LOOP;

  UPDATE public.supplier_returns
  SET total_amount = v_total_amount
  WHERE id = v_return_id AND owner_id = v_owner_id;

  RETURN v_return_id;
END;
$$;

-- ─── 3. Delete return (reverse stock-out) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_supplier_return(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM 1 FROM public.supplier_returns
  WHERE id = p_id AND owner_id = v_owner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مرتجع المشتريات غير موجود';
  END IF;

  -- 'out' rows are negative, so -1 * qty adds the goods back to stock.
  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    owner_id, product_id, 'adjustment', -1 * qty, unit_cost, avg_cost_snapshot,
    'reversal', id,
    'حذف مرتجع مشتريات ' || p_id::text,
    auth.uid()
  FROM public.stock_movements
  WHERE reference_type = 'supplier_return'
    AND reference_id = p_id
    AND owner_id = v_owner_id
    AND movement_type = 'out';

  DELETE FROM public.supplier_return_lines
  WHERE return_id = p_id AND owner_id = v_owner_id;

  DELETE FROM public.supplier_returns
  WHERE id = p_id AND owner_id = v_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_return(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_supplier_return(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_return(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier_return(uuid) TO authenticated;

-- ─── 4. Supplier ledger: returns that reduce the payable are debits ───────────
CREATE OR REPLACE VIEW public.v_supplier_transactions AS
  SELECT
    sp.owner_id,
    sp.supplier_id,
    sp.purchase_date AS tx_date,
    'purchase'::text AS kind,
    NULLIF(TRIM(BOTH FROM sp.invoice_no), '') AS ref,
    COALESCE(sp.notes, 'مشتريات آجل') AS description,
    sp.total_amount AS amount,
    sp.payment_type,
    sp.created_at,
    sp.id,
    sp.id AS reference_id,
    'supplier_purchase'::text AS reference_type
  FROM public.supplier_purchases sp
  WHERE sp.payment_type = 'credit'
  UNION ALL
  SELECT
    pay.owner_id,
    pay.supplier_id,
    pay.payment_date AS tx_date,
    'payment'::text AS kind,
    NULLIF(TRIM(BOTH FROM pay.reference), '') AS ref,
    CASE
      WHEN pay.notes IS NOT NULL AND pay.notes <> '' THEN pay.notes
      ELSE 'سداد للمورد (' || COALESCE(pay.method, 'نقدي') || ')'
    END AS description,
    pay.amount,
    'payment'::text AS payment_type,
    pay.created_at,
    pay.id,
    pay.id AS reference_id,
    'supplier_payment'::text AS reference_type
  FROM public.supplier_payments pay
  UNION ALL
  SELECT
    sr.owner_id,
    sr.supplier_id,
    sr.return_date AS tx_date,
    'return'::text AS kind,
    NULLIF(TRIM(BOTH FROM COALESCE(sp.invoice_no, '')), '') AS ref,
    COALESCE(sr.notes, 'مرتجع مشتريات') AS description,
    sr.total_amount AS amount,
    'return'::text AS payment_type,
    sr.created_at,
    sr.id,
    sr.id AS reference_id,
    'supplier_return'::text AS reference_type
  FROM public.supplier_returns sr
  LEFT JOIN public.supplier_purchases sp ON sp.id = sr.purchase_id
  WHERE sr.settlement_method = 'reduce_payable';

-- Same output shape as the live function (including reference_id/reference_type).
CREATE OR REPLACE FUNCTION public.supplier_statement(
  p_supplier_id uuid,
  p_from date DEFAULT '2000-01-01',
  p_to date DEFAULT '2099-12-31'
)
RETURNS TABLE(
  row_no bigint,
  tx_date date,
  tx_type text,
  ref text,
  description text,
  debit numeric,
  credit numeric,
  balance numeric,
  reference_id uuid,
  reference_type text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  WITH opening AS (
    SELECT COALESCE(s.opening_balance, 0)
         + COALESCE(SUM(CASE WHEN t.kind = 'purchase' THEN t.amount ELSE -t.amount END), 0) AS bal
    FROM public.suppliers s
    LEFT JOIN public.v_supplier_transactions t
      ON t.supplier_id = s.id AND t.tx_date < p_from
    WHERE s.id = p_supplier_id
    GROUP BY s.id, s.opening_balance
  ),
  period AS (
    SELECT
      t.id,
      t.tx_date,
      t.kind,
      t.ref,
      t.description,
      t.created_at,
      CASE WHEN t.kind IN ('payment', 'return') THEN t.amount ELSE 0 END AS debit,
      CASE WHEN t.kind = 'purchase' THEN t.amount ELSE 0 END AS credit,
      t.reference_id,
      t.reference_type
    FROM public.v_supplier_transactions t
    WHERE t.supplier_id = p_supplier_id
      AND t.tx_date BETWEEN p_from AND p_to
  )
  SELECT
    0::bigint AS row_no,
    p_from AS tx_date,
    'opening'::text AS tx_type,
    NULL::text AS ref,
    'رصيد أول المدة'::text AS description,
    NULL::numeric AS debit,
    NULL::numeric AS credit,
    COALESCE((SELECT bal FROM opening), 0) AS balance,
    NULL::uuid AS reference_id,
    NULL::text AS reference_type
  UNION ALL
  SELECT
    row_number() OVER (ORDER BY tx_date, created_at, id) AS row_no,
    tx_date,
    kind AS tx_type,
    ref,
    description,
    debit,
    credit,
    COALESCE((SELECT bal FROM opening), 0)
      + SUM(credit - debit) OVER (ORDER BY tx_date, created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance,
    reference_id,
    reference_type
  FROM period
  ORDER BY row_no;
$$;

REVOKE ALL ON FUNCTION public.supplier_statement(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_statement(uuid, date, date) TO authenticated;

-- ─── 5. KPI: cash refunds lower cash outcome, credit returns lower payables ───
CREATE OR REPLACE FUNCTION public.kpi_summary(
  p_from date DEFAULT date_trunc('month', CURRENT_DATE)::date,
  p_to date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id           uuid := public.get_manager_id();
  v_income             numeric;
  v_outcome            numeric;
  v_cash_sales         numeric;
  v_credit_sales       numeric;
  v_receivables        numeric;
  v_payables           numeric;
  v_dso                numeric;
  v_days               int;
  v_avg_coll           numeric;
  v_rate_30            numeric;
  v_cogs               numeric;
  v_gross_margin       numeric;
  v_returns_cash       numeric;
  v_returns_credit     numeric;
  v_purchase_ret_cash  numeric;
  v_purchase_ret_credit numeric;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  v_days := (p_to - p_from) + 1;

  SELECT COALESCE(SUM(CASE WHEN refund_method = 'cash_refund' THEN total_amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN refund_method = 'credit_balance' THEN total_amount ELSE 0 END), 0)
  INTO v_returns_cash, v_returns_credit
  FROM public.sales_returns
  WHERE owner_id = v_owner_id AND return_date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(CASE WHEN settlement_method = 'cash_refund' THEN total_amount ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN settlement_method = 'reduce_payable' THEN total_amount ELSE 0 END), 0)
  INTO v_purchase_ret_cash, v_purchase_ret_credit
  FROM public.supplier_returns
  WHERE owner_id = v_owner_id AND return_date BETWEEN p_from AND p_to;

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
  WHERE ci.owner_id = v_owner_id AND ci.status = 'confirmed' AND ci.date BETWEEN p_from AND p_to;

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
  WHERE cr.owner_id = v_owner_id AND cr.status = 'confirmed' AND cr.date BETWEEN p_from AND p_to;

  SELECT (v_cash_sales + COALESCE(SUM(p.amount), 0) - v_returns_cash)
  INTO v_income
  FROM public.payments p
  WHERE p.owner_id = v_owner_id AND p.date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(sp.amount), 0)
  INTO v_outcome
  FROM public.supplier_payments sp
  WHERE sp.owner_id = v_owner_id AND sp.payment_date BETWEEN p_from AND p_to;

  v_outcome := v_outcome + COALESCE((
    SELECT SUM(total_amount)
    FROM public.supplier_purchases
    WHERE owner_id = v_owner_id
      AND payment_type = 'cash'
      AND purchase_date BETWEEN p_from AND p_to
  ), 0);

  -- The expenses column is `date` (not `expense_date`).
  v_outcome := v_outcome + COALESCE((
    SELECT SUM(amount)
    FROM public.expenses
    WHERE owner_id = v_owner_id AND date BETWEEN p_from AND p_to
  ), 0);

  -- Cash refunded by suppliers is a cash inflow: net it off cash outflows.
  v_outcome := v_outcome - v_purchase_ret_cash;

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
  WHERE cr.owner_id = v_owner_id AND cr.status = 'confirmed' AND cr.date <= p_to;

  v_receivables := GREATEST(0, v_receivables - v_returns_credit);

  SELECT COALESCE(SUM(
    sp.opening_balance
    + COALESCE((SELECT SUM(total_amount) FROM public.supplier_purchases pu
                WHERE pu.supplier_id=sp.id AND pu.payment_type='credit'), 0)
    - COALESCE((SELECT SUM(amount) FROM public.supplier_payments pa
                WHERE pa.supplier_id=sp.id), 0)
    - COALESCE((SELECT SUM(total_amount) FROM public.supplier_returns sr
                WHERE sr.supplier_id=sp.id AND sr.settlement_method='reduce_payable'), 0)
  ), 0)
  INTO v_payables
  FROM public.suppliers sp
  WHERE sp.owner_id = v_owner_id;

  v_dso := CASE WHEN (v_credit_sales - v_returns_credit) > 0
    THEN ROUND(v_receivables / (v_credit_sales - v_returns_credit) * v_days, 1)
    ELSE 0 END;

  SELECT COALESCE(AVG(p.date - cr.date), 0)
  INTO v_avg_coll
  FROM public.payments p
  JOIN public.credit_invoices cr ON cr.id = p.credit_invoice_id
  WHERE p.owner_id = v_owner_id AND p.date BETWEEN p_from AND p_to AND p.credit_invoice_id IS NOT NULL;

  SELECT CASE WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(100.0 * COUNT(*) FILTER (
      WHERE COALESCE((
        SELECT MIN(pp.date) FROM public.payments pp WHERE pp.credit_invoice_id = cr.id
      ), p_to + 1) - cr.date <= 30
    ) / COUNT(*), 1)
  END
  INTO v_rate_30
  FROM public.credit_invoices cr
  WHERE cr.owner_id = v_owner_id AND cr.status = 'confirmed' AND cr.date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(ABS(sm.qty) * COALESCE(sm.avg_cost_snapshot, sm.unit_cost)), 0)
  INTO v_cogs
  FROM public.stock_movements sm
  WHERE sm.owner_id = v_owner_id
    AND sm.movement_type = 'out'
    AND sm.created_at::date BETWEEN p_from AND p_to
    AND sm.reference_type IN ('cash_invoice','credit_invoice');

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
    'purchase_returns_total', v_purchase_ret_cash + v_purchase_ret_credit,
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

REVOKE ALL ON FUNCTION public.kpi_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpi_summary(date, date) TO authenticated;

-- ─── 6. Cashflow: supplier cash refunds reduce the outcome series ─────────────
CREATE OR REPLACE FUNCTION public.cashflow_series(
  p_from date DEFAULT (CURRENT_DATE - '30 days'::interval)::date,
  p_to date DEFAULT CURRENT_DATE
)
RETURNS TABLE(tx_date date, income numeric, outcome numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
begin
  if not public.is_manager() then
    raise exception 'forbidden: managers only';
  end if;

  return query
  with days as (
    select generate_series(p_from::timestamp, p_to::timestamp, '1 day')::date as d
  ),
  incomes as (
    select date as d, sum(amount) as inc
    from (
      select date, amount from public.cash_invoices where owner_id = public.current_owner_id()
      union all
      select date, amount from public.payments where owner_id = public.current_owner_id()
    ) combined_inc
    where date between p_from and p_to
    group by date
  ),
  outcomes as (
    select d, sum(amount) as out_amt
    from (
      select payment_date as d, amount from public.supplier_payments where owner_id = public.current_owner_id()
      union all
      select purchase_date as d, total_amount as amount from public.supplier_purchases
        where owner_id = public.current_owner_id() and payment_type = 'cash'
      union all
      select date as d, amount from public.expenses where owner_id = public.current_owner_id()
      union all
      select return_date as d, -total_amount as amount from public.supplier_returns
        where owner_id = public.current_owner_id() and settlement_method = 'cash_refund'
    ) combined_out
    where d between p_from and p_to
    group by d
  )
  select
    days.d as tx_date,
    coalesce(incomes.inc, 0)::numeric as income,
    coalesce(outcomes.out_amt, 0)::numeric as outcome
  from days
  left join incomes on incomes.d = days.d
  left join outcomes on outcomes.d = days.d
  order by days.d;
end
$$;

REVOKE ALL ON FUNCTION public.cashflow_series(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cashflow_series(date, date) TO authenticated;
