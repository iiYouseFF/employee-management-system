-- 0022_customer_phone_payment_methods_and_statement_invoice_link.sql
-- Covers:
--   1) Customer phone mandatory (req #3)
--   2) Payment method split: wallet -> Vodafone Cash / InstaPay with legacy compatibility (req #6)
--   3) Customer statement invoice link (invoice_id, invoice_type) (req #7)
--
-- Additive/idempotent where possible. Never edit applied migrations.
--
-- Rollback notes (manual):
--   - Customer phone: ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_not_blank_chk;
--     ALTER TABLE public.customers ALTER COLUMN phone DROP NOT NULL;
--     (original null/empty phones cannot be restored after backfill)
--   - Payment checks: restore previous CHECK constraints for payments/supplier_payments.
--   - Statement: recreate previous v_customer_transactions and customer_statement from 0021.

BEGIN;

-- ─── 1) Customer phone mandatory ────────────────────────────────────────────
-- Backfill legacy null/blank phones with an explicit placeholder so NOT NULL/CHECK
-- can be enforced safely without inventing a real phone number.
UPDATE public.customers
SET phone = 'غير مسجل'
WHERE phone IS NULL OR length(trim(phone)) = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customers_phone_not_blank_chk'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_phone_not_blank_chk
      CHECK (length(trim(phone)) > 0);
  END IF;
END $$;

ALTER TABLE public.customers
  ALTER COLUMN phone SET NOT NULL;

-- ─── 2) Payment methods: split wallet into Vodafone Cash / InstaPay ─────────
-- Keep legacy 'محفظة إلكترونية' accepted for backward compatibility with old rows.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%method%'
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('نقدي', 'تحويل بنكي', 'شيك', 'محفظة إلكترونية', 'فودافون كاش', 'انستاباي', 'آجل'));

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.supplier_payments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%method%'
  LOOP
    EXECUTE format('ALTER TABLE public.supplier_payments DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.supplier_payments
  ADD CONSTRAINT supplier_payments_method_check
  CHECK (method IN ('نقدي', 'تحويل بنكي', 'شيك', 'محفظة إلكترونية', 'فودافون كاش', 'انستاباي'));

-- ─── 3) Customer statement invoice linkage ──────────────────────────────────
-- Recreate view/RPC with appended invoice_id and invoice_type columns.
-- Existing column order/names are preserved; new columns are appended at end.

DROP FUNCTION IF EXISTS public.customer_statement(uuid, date, date);
DROP VIEW IF EXISTS public.v_customer_transactions;

CREATE VIEW public.v_customer_transactions AS
  SELECT
    ci.owner_id,
    ci.customer_id,
    ci.date AS tx_date,
    'invoice'::text AS kind,
    ci.invoice_no AS ref,
    COALESCE(ci.item, ci.notes, 'فاتورة نقدية') AS description,
    ci.amount,
    ci.created_at,
    ci.id,
    ci.id AS invoice_id,
    'cash'::text AS invoice_type
  FROM public.cash_invoices ci
  WHERE ci.customer_id IS NOT NULL
    AND ci.status = 'confirmed'
  UNION ALL
  SELECT
    cr.owner_id,
    cr.customer_id,
    cr.date AS tx_date,
    'invoice'::text AS kind,
    cr.invoice_no AS ref,
    COALESCE(cr.item, 'فاتورة آجلة') AS description,
    cr.amount,
    cr.created_at,
    cr.id,
    cr.id AS invoice_id,
    'credit'::text AS invoice_type
  FROM public.credit_invoices cr
  WHERE cr.customer_id IS NOT NULL
    AND cr.status = 'confirmed'
  UNION ALL
  SELECT
    p.owner_id,
    p.customer_id,
    p.date AS tx_date,
    'payment'::text AS kind,
    COALESCE(cr.invoice_no, 'سداد') AS ref,
    CASE
      WHEN p.method IS NOT NULL THEN 'سداد - ' || p.method
      ELSE 'سداد دفعة'
    END AS description,
    p.amount,
    p.created_at,
    p.id,
    p.credit_invoice_id AS invoice_id,
    CASE WHEN p.credit_invoice_id IS NOT NULL THEN 'credit'::text ELSE NULL::text END AS invoice_type
  FROM public.payments p
  LEFT JOIN public.credit_invoices cr ON cr.id = p.credit_invoice_id
  WHERE p.customer_id IS NOT NULL
  UNION ALL
  SELECT
    sr.owner_id,
    sr.customer_id,
    sr.return_date AS tx_date,
    'return'::text AS kind,
    COALESCE(ci.invoice_no, cr.invoice_no, 'مرتجع') AS ref,
    'مرتجع مبيعات (إضافة لرصيد العميل)'::text AS description,
    sr.total_amount AS amount,
    sr.created_at,
    sr.id,
    sr.invoice_id,
    sr.invoice_type
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
  invoice_type text
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
      t.invoice_type
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
    NULL::text AS invoice_type
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
    invoice_type
  FROM period
  ORDER BY row_no;
$$;

GRANT EXECUTE ON FUNCTION public.customer_statement(uuid, date, date) TO authenticated;

COMMIT;
