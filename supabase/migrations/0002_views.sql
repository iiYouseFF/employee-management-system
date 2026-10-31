-- Create views for derived data
create or replace view v_credit_invoices with (security_invoker = true) as
select 
  ci.*,
  coalesce(sum(p.amount), 0) as linked_payments,
  (ci.amount - ci.paid - coalesce(sum(p.amount), 0)) as remaining,
  case 
    when (ci.amount - ci.paid - coalesce(sum(p.amount), 0)) <= 0 then 'مسدد'
    when (ci.paid + coalesce(sum(p.amount), 0)) > 0 then 'جزئي'
    else 'غير مسدد'
  end as status
from credit_invoices ci
left join payments p on p.credit_invoice_id = ci.id
group by ci.id;

create or replace view v_customer_statement with (security_invoker = true) as
select 
  c.id as customer_id,
  c.name as customer,
  c.owner_id,
  coalesce(sum(distinct ci_cash.amount), 0) as cash_tot,
  coalesce(sum(distinct ci_credit.amount), 0) as credit_tot,
  coalesce(sum(p.amount), 0) + coalesce(sum(ci_credit.paid), 0) as pay_tot,
  coalesce(sum(distinct ci_credit.amount), 0) - (coalesce(sum(p.amount), 0) + coalesce(sum(ci_credit.paid), 0)) as remaining,
  string_agg(distinct r.name, '، ') as reps_list
from customers c
left join cash_invoices ci_cash on ci_cash.customer_id = c.id
left join credit_invoices ci_credit on ci_credit.customer_id = c.id
left join payments p on p.customer_id = c.id
left join reps r on r.id in (ci_cash.rep_id, ci_credit.rep_id, p.rep_id)
group by c.id, c.name, c.owner_id;
