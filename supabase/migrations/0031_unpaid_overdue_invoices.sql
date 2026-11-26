-- 0031_unpaid_overdue_invoices.sql
-- Adds the 15-day credit payment-term standard and an RLS-scoped RPC that
-- lists unpaid / overdue credit invoices with customer and assigned-rep data.
--
-- Additive and idempotent. Never edit applied migrations.
--
-- Rollback notes (manual):
--   drop function if exists public.unpaid_credit_invoices_list();
--   drop trigger if exists credit_invoices_set_due_date on public.credit_invoices;
--   drop function if exists public.credit_invoices_set_due_date();
--   alter table public.credit_invoices alter column due_date set default (current_date + 30);
--   (backfilled due_date values cannot be restored to NULL after rollback)

BEGIN;

-- ─── 1) 15-day due-date standard ─────────────────────────────────────────────
-- A SQL column default cannot reference another column, so direct inserts use
-- current_date + 15 and the trigger below enforces date + 15 for every row.
UPDATE public.credit_invoices
SET due_date = (date + 15)
WHERE due_date IS NULL;

ALTER TABLE public.credit_invoices
  ALTER COLUMN due_date SET DEFAULT (current_date + 15);

CREATE OR REPLACE FUNCTION public.credit_invoices_set_due_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_date := NEW.date + 15;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_invoices_set_due_date ON public.credit_invoices;
CREATE TRIGGER credit_invoices_set_due_date
  BEFORE INSERT OR UPDATE OF date, due_date ON public.credit_invoices
  FOR EACH ROW EXECUTE FUNCTION public.credit_invoices_set_due_date();

-- ─── 2) Unpaid / overdue credit invoices RPC ────────────────────────────────
-- SECURITY INVOKER: existing RLS on v_credit_invoices (security_invoker view),
-- customers, payments and reps enforces tenant isolation and rep scoping.
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
    coalesce(c.representative_id, v.rep_id)                           AS rep_id,
    r.name                                                            AS rep_name,
    v.amount::numeric(14,2)                                           AS total_amount,
    (v.paid + v.linked_payments)::numeric(14,2)                       AS paid_amount,
    v.remaining::numeric(14,2)                                        AS remaining_amount,
    case when (v.paid + v.linked_payments) > 0 then 'partial' else 'unpaid' end::text AS status
  FROM public.v_credit_invoices v
  LEFT JOIN public.customers c ON c.id = v.customer_id
  LEFT JOIN public.reps r ON r.id = coalesce(c.representative_id, v.rep_id)
  WHERE v.remaining > 0
  ORDER BY 4 ASC, 3 ASC;
$$;

REVOKE ALL ON FUNCTION public.unpaid_credit_invoices_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpaid_credit_invoices_list() TO authenticated;

COMMIT;
