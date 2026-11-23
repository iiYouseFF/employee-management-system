-- 0024_statement_reference_links.sql
-- Statement reference improvements:
--   1) Make statement refs nullable where no real reference exists.
--   2) Expose reference IDs so UI can open invoice/payment/purchase details.
--
-- Additive/idempotent where possible. Never edit applied migrations.
--
-- Rollback notes (manual):
--   - Recreate v_customer_transactions and customer_statement from 0022.
--   - Recreate v_supplier_transactions and supplier_statement from 0013.
--   - Data is unchanged; only view/RPC shapes change.

BEGIN;

-- ─── 1) Customer statement: nullable ref + payment_id ────────────────────────
DROP FUNCTION IF EXISTS public.customer_statement(uuid, date, date);
DROP VIEW IF EXISTS public.v_customer_transactions;

CREATE VIEW public.v_customer_transactions AS
  SELECT
    ci.owner_id,
    ci.customer_id,
    ci.date AS tx_date,
    'invoice'::text AS kind,
    NULLIF(trim(ci.invoice_no), '') AS ref,
    COALESCE(ci.item, ci.notes, 'فاتورة نقدية') AS description,
    ci.amount,
    ci.created_at,
    ci.id,
    ci.id AS invoice_id,
    'cash'::text AS invoice_type,
    NULL::uuid AS payment_id
  FROM public.cash_invoices ci
  WHERE ci.customer_id IS NOT NULL
    AND ci.status = 'confirmed'
  UNION ALL
  SELECT
    cr.owner_id,
    cr.customer_id,
    cr.date AS tx_date,
    'invoice'::text AS kind,
    NULLIF(trim(cr.invoice_no), '') AS ref,
    COALESCE(cr.item, 'فاتورة آجلة') AS description,
    cr.amount,
    cr.created_at,
    cr.id,
    cr.id AS invoice_id,
    'credit'::text AS invoice_type,
    NULL::uuid AS payment_id
  FROM public.credit_invoices cr
  WHERE cr.customer_id IS NOT NULL
    AND cr.status = 'confirmed'
  UNION ALL
  SELECT
    p.owner_id,
    p.customer_id,
    p.date AS tx_date,
    'payment'::text AS kind,
    NULLIF(trim(cr.invoice_no), '') AS ref,
    CASE
      WHEN p.method IS NOT NULL THEN 'سداد - ' || p.method
      ELSE 'سداد دفعة'
    END AS description,
    p.amount,
    p.created_at,
    p.id,
    p.credit_invoice_id AS invoice_id,
    CASE WHEN p.credit_invoice_id IS NOT NULL THEN 'credit'::text ELSE NULL::text END AS invoice_type,
    p.id AS payment_id
  FROM public.payments p
  LEFT JOIN public.credit_invoices cr ON cr.id = p.credit_invoice_id
  WHERE p.customer_id IS NOT NULL
  UNION ALL
  SELECT
    sr.owner_id,
    sr.customer_id,
    sr.return_date AS tx_date,
    'return'::text AS kind,
    NULLIF(trim(COALESCE(ci.invoice_no, cr.invoice_no, '')), '') AS ref,
    'مرتجع مبيعات (إضافة لرصيد العميل)'::text AS description,
    sr.total_amount AS amount,
    sr.created_at,
    sr.id,
    sr.invoice_id,
    sr.invoice_type,
    NULL::uuid AS payment_id
  FROM public.sales_returns sr
  LEFT JOIN public.cash_invoices ci ON sr.invoice_type = 'cash' AND sr.invoice_id = ci.id
  LEFT JOIN public.credit_invoices cr ON sr.invoice_type = 'credit' AND sr.invoice_id = cr.id
  WHERE sr.customer_id IS NOT NULL
    AND sr.refund_method = 'credit_balance';

CREATE FUNCTION public.customer_statement(
  p_customer_id uuid,
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
  invoice_id uuid,
  invoice_type text,
  payment_id uuid
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
      CASE WHEN t.kind <> 'invoice' THEN t.amount ELSE 0 END AS credit,
      t.invoice_id,
      t.invoice_type,
      t.payment_id
    FROM public.v_customer_transactions t
    WHERE t.customer_id = p_customer_id
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
    NULL::uuid AS invoice_id,
    NULL::text AS invoice_type,
    NULL::uuid AS payment_id
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
      + SUM(debit - credit) OVER (ORDER BY tx_date, created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance,
    invoice_id,
    invoice_type,
    payment_id
  FROM period
  ORDER BY row_no;
$$;

GRANT EXECUTE ON FUNCTION public.customer_statement(uuid, date, date) TO authenticated;

-- ─── 2) Supplier statement: nullable ref + reference IDs ─────────────────────
DROP FUNCTION IF EXISTS public.supplier_statement(uuid, date, date);
DROP VIEW IF EXISTS public.v_supplier_transactions;

CREATE VIEW public.v_supplier_transactions AS
  SELECT
    sp.owner_id,
    sp.supplier_id,
    sp.purchase_date AS tx_date,
    'purchase'::text AS kind,
    NULLIF(trim(sp.invoice_no), '') AS ref,
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
    NULLIF(trim(pay.reference), '') AS ref,
    CASE
      WHEN pay.notes IS NOT NULL AND pay.notes <> '' THEN pay.notes
      ELSE 'سداد للمورد (' || COALESCE(pay.method, 'نقدي') || ')'
    END AS description,
    pay.amount AS amount,
    'payment'::text AS payment_type,
    pay.created_at,
    pay.id,
    pay.id AS reference_id,
    'supplier_payment'::text AS reference_type
  FROM public.supplier_payments pay;

CREATE FUNCTION public.supplier_statement(
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
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
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
      CASE WHEN t.kind = 'payment' THEN t.amount ELSE 0 END AS debit,
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

GRANT EXECUTE ON FUNCTION public.supplier_statement(uuid, date, date) TO authenticated;

COMMIT;
