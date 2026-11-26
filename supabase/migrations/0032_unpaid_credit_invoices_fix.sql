-- 0032_unpaid_credit_invoices_fix.sql
-- Follow-up to 0031_unpaid_overdue_invoices.sql.
--   1. Report the invoice's own rep (matching credit_invoices RLS and every other
--      sales tab) instead of coalescing with the customer's assigned rep.
--   2. Keep due_date = date + 15 when the invoice date changes and no explicit
--      due_date change is supplied, so the 15-day term also holds for direct DB updates.
--
-- Additive and idempotent: CREATE OR REPLACE only; no data is rewritten.
-- SECURITY INVOKER is retained; existing RLS still scopes tenants and reps.
--
-- Rollback notes (manual):
--   create or replace function public.unpaid_credit_invoices_list() ... -- restore the
--     0031 body (coalesce(c.representative_id, v.rep_id));
--   create or replace function public.credit_invoices_set_due_date() ... -- restore the
--     0031 body (only fill NULL due_date);
--   The trigger and grants need no other changes.

BEGIN;

-- ─── 1) 15-day rule on direct date changes ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.credit_invoices_set_due_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.due_date IS NULL THEN
      NEW.due_date := NEW.date + 15;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.date IS DISTINCT FROM OLD.date
       AND NEW.due_date IS NOT DISTINCT FROM OLD.due_date THEN
      -- Date changed without an explicit due-date override: move the term with it.
      NEW.due_date := NEW.date + 15;
    ELSIF NEW.due_date IS NULL THEN
      NEW.due_date := NEW.date + 15;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 2) Rep attribution matches RLS / other tabs ────────────────────────────
CREATE OR REPLACE FUNCTION public.unpaid_credit_invoices_list()
RETURNS TABLE (
  invoice_id       uuid,
  invoice_no       text,
  invoice_date     date,
  due_date         date,
  days_diff        integer,
  is_overdue       boolean,
  customer_id      uuid,
  customer_name    text,
  customer_phone   text,
  rep_id           uuid,
  rep_name         text,
  total_amount     numeric(14,2),
  paid_amount      numeric(14,2),
  remaining_amount numeric(14,2),
  status           text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    v.id::uuid                                                        AS invoice_id,
    v.invoice_no::text                                                AS invoice_no,
    v.date::date                                                      AS invoice_date,
    coalesce(v.due_date, v.date + interval '15 days')::date           AS due_date,
    (current_date - coalesce(v.due_date, v.date + interval '15 days')::date)::integer AS days_diff,
    (coalesce(v.due_date, v.date + interval '15 days')::date < current_date) AS is_overdue,
    c.id                                                              AS customer_id,
    c.name                                                            AS customer_name,
    c.phone                                                           AS customer_phone,
    v.rep_id                                                          AS rep_id,
    r.name                                                            AS rep_name,
    v.amount::numeric(14,2)                                           AS total_amount,
    (v.paid + v.linked_payments)::numeric(14,2)                       AS paid_amount,
    v.remaining::numeric(14,2)                                        AS remaining_amount,
    case when (v.paid + v.linked_payments) > 0 then 'partial' else 'unpaid' end::text AS status
  FROM public.v_credit_invoices v
  LEFT JOIN public.customers c ON c.id = v.customer_id
  LEFT JOIN public.reps r ON r.id = v.rep_id
  WHERE v.remaining > 0
  ORDER BY 4 ASC, 3 ASC;
$$;

REVOKE ALL ON FUNCTION public.unpaid_credit_invoices_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpaid_credit_invoices_list() TO authenticated;

COMMIT;
