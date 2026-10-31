-- Correct per-customer aggregates and expose phone for statement search
drop view if exists v_customer_statement;

create view v_customer_statement with (security_invoker = true) as
select
  c.id as customer_id,
  c.name as customer,
  c.phone,
  c.owner_id,
  coalesce(cash.cash_tot, 0) as cash_tot,
  coalesce(credit.credit_tot, 0) as credit_tot,
  coalesce(pay.pay_tot, 0) + coalesce(credit.paid_tot, 0) as pay_tot,
  coalesce(credit.credit_tot, 0) - (coalesce(pay.pay_tot, 0) + coalesce(credit.paid_tot, 0)) as remaining,
  rp.reps as reps_list
from customers c
left join (
  select customer_id, sum(amount) as cash_tot
  from cash_invoices
  where customer_id is not null
  group by customer_id
) cash on cash.customer_id = c.id
left join (
  select customer_id, sum(amount) as credit_tot, sum(paid) as paid_tot
  from credit_invoices
  where customer_id is not null
  group by customer_id
) credit on credit.customer_id = c.id
left join (
  select customer_id, sum(amount) as pay_tot
  from payments
  where customer_id is not null
  group by customer_id
) pay on pay.customer_id = c.id
left join (
  select customer_id, string_agg(distinct name, '، ') as reps
  from (
    select ci.customer_id, r.name
    from cash_invoices ci
    join reps r on r.id = ci.rep_id
    where ci.customer_id is not null
    union all
    select ci.customer_id, r.name
    from credit_invoices ci
    join reps r on r.id = ci.rep_id
    where ci.customer_id is not null
    union all
    select p.customer_id, r.name
    from payments p
    join reps r on r.id = p.rep_id
    where p.customer_id is not null
  ) all_reps
  group by customer_id
) rp on rp.customer_id = c.id;
