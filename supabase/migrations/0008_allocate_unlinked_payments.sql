-- 0008: allocate unlinked payments to credit invoices (cust CreditTab reconciliation)
--
-- Credit invoice "remaining" only reflected payments explicitly linked through
-- payments.credit_invoice_id, but most payments are recorded without a link.
-- This view allocates each customer's unlinked payments FIFO across their open
-- credit invoices (oldest first) and exposes:
--   linked_payments = direct links + FIFO allocation
--   remaining       = amount - paid - linked_payments
--   status          = مسدد / جزئي / غير مسدد
--
-- v_customer_statement already sums all payments (pay_tot), so with this view
-- sum(v_credit_invoices.remaining) matches v_customer_statement.remaining for
-- every customer, except when overpayment makes the statement negative while
-- an individual invoice floors at zero.

create or replace view public.v_credit_invoices
with (security_invoker = true) as
with base as (
  select
    ci.id,
    ci.owner_id,
    ci.date,
    ci.invoice_no,
    ci.customer_id,
    ci.rep_id,
    ci.item,
    ci.amount,
    ci.due_date,
    ci.paid,
    ci.created_at,
    greatest(ci.amount - ci.paid, 0) as open_amount
  from public.credit_invoices ci
),
cum as (
  select
    b.*,
    coalesce(
      sum(b.open_amount) over (
        partition by b.customer_id
        order by b.date, b.created_at, b.id
        rows between unbounded preceding and current row
      ),
      0
    ) as cum_after,
    coalesce(
      sum(b.open_amount) over (
        partition by b.customer_id
        order by b.date, b.created_at, b.id
        rows between unbounded preceding and 1 preceding
      ),
      0
    ) as cum_before
  from base b
),
direct as (
  select p.credit_invoice_id, sum(p.amount) as amount
  from public.payments p
  where p.credit_invoice_id is not null
  group by p.credit_invoice_id
),
pooled as (
  select p.customer_id, sum(p.amount) as amount
  from public.payments p
  where p.credit_invoice_id is null and p.customer_id is not null
  group by p.customer_id
)
select
  c.id,
  c.owner_id,
  c.date,
  c.invoice_no,
  c.customer_id,
  c.rep_id,
  c.item,
  c.amount,
  c.due_date,
  c.paid,
  c.created_at,
  coalesce(d.amount, 0)
    + case
        when c.customer_id is null then 0
        else greatest(0, least(c.cum_after, coalesce(p.amount, 0)) - c.cum_before)
      end as linked_payments,
  c.amount - c.paid
    - (
        coalesce(d.amount, 0)
        + case
            when c.customer_id is null then 0
            else greatest(0, least(c.cum_after, coalesce(p.amount, 0)) - c.cum_before)
          end
      ) as remaining,
  case
    when c.amount - c.paid
      - (
          coalesce(d.amount, 0)
          + case
              when c.customer_id is null then 0
              else greatest(0, least(c.cum_after, coalesce(p.amount, 0)) - c.cum_before)
            end
        ) <= 0 then 'مسدد'
    when c.paid
      + coalesce(d.amount, 0)
      + case
          when c.customer_id is null then 0
          else greatest(0, least(c.cum_after, coalesce(p.amount, 0)) - c.cum_before)
        end > 0 then 'جزئي'
    else 'غير مسدد'
  end as status
from cum c
left join direct d on d.credit_invoice_id = c.id
left join pooled p on p.customer_id = c.customer_id;

grant select on public.v_credit_invoices to anon, authenticated, service_role;
