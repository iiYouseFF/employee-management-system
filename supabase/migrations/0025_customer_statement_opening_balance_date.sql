-- 0025_customer_statement_opening_balance_date.sql
-- Fix: the customer statement's opening-balance row showed 2000-01-01 when no
-- date filter was selected (the p_from RPC default), which is not a real date
-- for the customer. Show the customer's creation date instead when p_from is
-- the "beginning of time" sentinel. An explicitly chosen p_from is preserved.
--
-- Additive/idempotent: CREATE OR REPLACE only; no data is rewritten and no
-- applied migration is edited. Signature and return shape are unchanged.
--
-- Rollback notes (manual):
--   - Recreate public.customer_statement from 0024 (replace the opening row's
--     tx_date expression back with plain p_from).
--   - No data changes; grants and dependent views are untouched.

BEGIN;

CREATE OR REPLACE FUNCTION public.customer_statement(
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
    CASE
      WHEN p_from = DATE '2000-01-01'
        THEN COALESCE(
          (SELECT c.created_at::date FROM public.customers c WHERE c.id = p_customer_id),
          p_from
        )
      ELSE p_from
    END AS tx_date,
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

COMMIT;
