-- 0034_rep_granular_permissions.sql
-- Per-rep granular feature access control.
--
-- What it changes:
--   1. Adds public.reps.permissions (jsonb) with the 15 default flags; the column
--      default backfills every existing rep row (no data rewrite).
--   2. Adds rep_has_permission(text) / rep_can_write_for(uuid,uuid) helpers.
--   3. Extends rep READ policies with view_* flags (customers, cash, credit,
--      payments, returns, products, invoice lines) and adds rep WRITE policies
--      on payments for record_payment.
--   4. Adds permission guards + rep-scope checks to the SECURITY DEFINER
--      invoice/return RPCs and read guards to statement, overdue and stock RPCs.
--      Manager behavior is unchanged; export_print is enforced in the UI only.
--
-- Additive and idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP POLICY IF EXISTS + CREATE POLICY. No applied migration is edited.
--
-- Rollback (manual):
--   alter table public.reps drop constraint if exists reps_permissions_object;
--   alter table public.reps drop column if exists permissions;
--   drop function if exists public.rep_can_write_for(uuid, uuid);
--   drop function if exists public.rep_has_permission(text);
--   drop policy if exists rep_insert_payments on public.payments;
--   drop policy if exists rep_update_payments on public.payments;
--   drop policy if exists rep_delete_payments on public.payments;
--   Restore the pre-0034 definitions of the rep_read_* / role_read_products
--   policies (0014, 0033) and of the guarded RPC bodies from this file's
--   "before" state in version control. No table data is changed by this
--   migration, so no data rollback is needed.

-- ---------------------------------------------------------------------------
-- 1. Permissions column (defaults mirror src/features/reps/repPermissions.ts)
-- ---------------------------------------------------------------------------
alter table public.reps
  add column if not exists permissions jsonb not null default '{
    "view_customers": true,
    "view_cash": true,
    "view_credit": true,
    "view_overdue": true,
    "view_payments": true,
    "view_statement": true,
    "view_returns": true,
    "view_products": true,
    "view_inventory": false,
    "view_monthly": false,
    "create_cash_invoice": false,
    "create_credit_invoice": false,
    "record_payment": false,
    "create_return": false,
    "export_print": true
  }'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reps_permissions_object' and conrelid = 'public.reps'::regclass
  ) then
    alter table public.reps
      add constraint reps_permissions_object check (jsonb_typeof(permissions) = 'object');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.rep_has_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_role public.app_role := public.current_role_name();
  v_permissions jsonb;
begin
  if v_role = 'manager' then
    return true;
  end if;
  if v_role is distinct from 'sales_rep' then
    return false;
  end if;

  select r.permissions into v_permissions
  from public.reps r
  where r.user_id = auth.uid()
    and r.owner_id = public.current_owner_id()
  limit 1;

  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$function$;

revoke all on function public.rep_has_permission(text) from public, anon;
grant execute on function public.rep_has_permission(text) to authenticated;

-- Managers are unrestricted; reps may only reference themselves and their own
-- assigned customers when creating financial rows.
create or replace function public.rep_can_write_for(p_rep_id uuid, p_customer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    not public.is_sales_rep()
    or (
      (p_rep_id is null or p_rep_id = public.get_current_rep_id())
      and (
        p_customer_id is null
        or exists (
          select 1 from public.customers c
          where c.id = p_customer_id
            and c.owner_id = public.current_owner_id()
            and c.representative_id = public.get_current_rep_id()
        )
      )
    );
$function$;

revoke all on function public.rep_can_write_for(uuid, uuid) from public, anon;
grant execute on function public.rep_can_write_for(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Read policies (manager policies untouched)
-- ---------------------------------------------------------------------------
drop policy if exists rep_read_customers on public.customers;
create policy rep_read_customers on public.customers
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and representative_id = public.get_current_rep_id()
    and public.rep_has_permission('view_customers')
  );

drop policy if exists rep_read_cash on public.cash_invoices;
create policy rep_read_cash on public.cash_invoices
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and public.rep_has_permission('view_cash')
    and (
      rep_id = public.get_current_rep_id()
      or exists (
        select 1 from public.customers c
        where c.id = cash_invoices.customer_id
          and c.representative_id = public.get_current_rep_id()
      )
    )
  );

drop policy if exists rep_read_credit on public.credit_invoices;
create policy rep_read_credit on public.credit_invoices
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and public.rep_has_permission('view_credit')
    and (
      rep_id = public.get_current_rep_id()
      or exists (
        select 1 from public.customers c
        where c.id = credit_invoices.customer_id
          and c.representative_id = public.get_current_rep_id()
      )
    )
  );

drop policy if exists rep_read_payments on public.payments;
create policy rep_read_payments on public.payments
  for select using (
    public.is_sales_rep()
    and owner_id = public.current_owner_id()
    and public.rep_has_permission('view_payments')
    and (
      rep_id = public.get_current_rep_id()
      or credit_invoice_id in (
        select ci.id from public.credit_invoices ci
        where ci.rep_id = public.get_current_rep_id()
      )
      or customer_id in (
        select c.id from public.customers c
        where c.representative_id = public.get_current_rep_id()
      )
    )
  );

drop policy if exists rep_read_own_sales_returns on public.sales_returns;
create policy rep_read_own_sales_returns on public.sales_returns
  for select using (
    (not public.is_manager())
    and owner_id = public.get_manager_id()
    and rep_id = public.get_current_rep_id()
    and public.rep_has_permission('view_returns')
  );

drop policy if exists rep_read_sales_return_lines on public.sales_return_lines;
create policy rep_read_sales_return_lines on public.sales_return_lines
  for select using (
    exists (
      select 1 from public.sales_returns sr
      where sr.id = sales_return_lines.return_id
        and sr.owner_id = public.get_manager_id()
        and sr.rep_id = public.get_current_rep_id()
        and not public.is_manager()
    )
    and public.rep_has_permission('view_returns')
  );

drop policy if exists rep_read_invoice_lines on public.invoice_lines;
create policy rep_read_invoice_lines on public.invoice_lines
  for select using (
    (not public.is_manager())
    and owner_id = public.get_manager_id()
    and (
      (invoice_type = 'cash' and public.rep_has_permission('view_cash'))
      or (invoice_type = 'credit' and public.rep_has_permission('view_credit'))
    )
    and (
      (
        invoice_type = 'cash'
        and invoice_id in (
          select ci.id from public.cash_invoices ci
          where ci.owner_id = public.get_manager_id()
            and (
              ci.rep_id = public.get_current_rep_id()
              or ci.customer_id in (
                select c.id from public.customers c
                where c.owner_id = public.get_manager_id()
                  and c.representative_id = public.get_current_rep_id()
              )
            )
        )
      )
      or (
        invoice_type = 'credit'
        and invoice_id in (
          select ci.id from public.credit_invoices ci
          where ci.owner_id = public.get_manager_id()
            and (
              ci.rep_id = public.get_current_rep_id()
              or ci.customer_id in (
                select c.id from public.customers c
                where c.owner_id = public.get_manager_id()
                  and c.representative_id = public.get_current_rep_id()
              )
            )
        )
      )
    )
  );

drop policy if exists role_read_products on public.products;
create policy role_read_products on public.products
  for select using (
    (public.is_manager() and owner_id = public.current_owner_id())
    or (
      public.is_sales_rep()
      and owner_id = public.current_owner_id()
      and is_active
      and (
        public.rep_has_permission('view_products')
        or public.rep_has_permission('create_cash_invoice')
        or public.rep_has_permission('create_credit_invoice')
        or public.rep_has_permission('create_return')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Write policies: payments are written directly by the client, so RLS is
--    the enforcement point for record_payment.
-- ---------------------------------------------------------------------------
drop policy if exists rep_insert_payments on public.payments;
create policy rep_insert_payments on public.payments
  for insert with check (
    public.is_sales_rep()
    and public.rep_has_permission('record_payment')
    and owner_id = public.current_owner_id()
    and (rep_id is null or rep_id = public.get_current_rep_id())
    and (
      customer_id is null
      or exists (
        select 1 from public.customers c
        where c.id = payments.customer_id
          and c.owner_id = public.current_owner_id()
          and c.representative_id = public.get_current_rep_id()
      )
    )
    and (
      credit_invoice_id is null
      or exists (
        select 1 from public.credit_invoices ci
        where ci.id = payments.credit_invoice_id
          and ci.owner_id = public.current_owner_id()
          and (
            ci.rep_id = public.get_current_rep_id()
            or ci.customer_id in (
              select c.id from public.customers c
              where c.representative_id = public.get_current_rep_id()
            )
          )
      )
    )
  );

drop policy if exists rep_update_payments on public.payments;
create policy rep_update_payments on public.payments
  for update using (
    public.is_sales_rep()
    and public.rep_has_permission('record_payment')
    and owner_id = public.current_owner_id()
    and rep_id = public.get_current_rep_id()
  )
  with check (
    public.is_sales_rep()
    and public.rep_has_permission('record_payment')
    and owner_id = public.current_owner_id()
    and (rep_id is null or rep_id = public.get_current_rep_id())
    and (
      customer_id is null
      or exists (
        select 1 from public.customers c
        where c.id = payments.customer_id
          and c.owner_id = public.current_owner_id()
          and c.representative_id = public.get_current_rep_id()
      )
    )
  );

drop policy if exists rep_delete_payments on public.payments;
create policy rep_delete_payments on public.payments
  for delete using (
    public.is_sales_rep()
    and public.rep_has_permission('record_payment')
    and owner_id = public.current_owner_id()
    and rep_id = public.get_current_rep_id()
  );

-- ---------------------------------------------------------------------------
-- 5. RPC guards. Bodies are copied verbatim from the live definitions; only
--    the permission/scope checks and one additional WHERE predicate are added.
-- ---------------------------------------------------------------------------

-- 5.1 cash invoices -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_cash_invoice(p_invoice jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT (public.is_manager() OR public.rep_has_permission('create_cash_invoice')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_sales_rep() THEN
    IF NOT public.rep_can_write_for(
      NULLIF(p_invoice->>'rep_id', '')::uuid,
      NULLIF(p_invoice->>'customer_id', '')::uuid
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    p_invoice := jsonb_set(p_invoice, '{rep_id}', to_jsonb(public.get_current_rep_id()::text));
  END IF;

  SELECT allow_negative_stock INTO v_allow_neg
  FROM public.app_settings WHERE owner_id = v_owner_id;
  v_allow_neg := COALESCE(v_allow_neg, false);

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

    IF public.is_sales_rep() AND NOT EXISTS (
      SELECT 1 FROM public.cash_invoices ci
      WHERE ci.id = v_invoice_id AND ci.owner_id = v_owner_id
        AND ci.rep_id = public.get_current_rep_id()
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

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

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id  := (v_line->>'product_id')::uuid;
    v_qty         := (v_line->>'qty')::numeric;
    v_unit_price  := (v_line->>'unit_price')::numeric;

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

  UPDATE public.cash_invoices
  SET amount = COALESCE((
    SELECT SUM(line_total)
    FROM public.invoice_lines
    WHERE invoice_type = 'cash' AND invoice_id = v_invoice_id
  ), 0)
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$function$;

-- 5.2 credit invoices -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_credit_invoice(p_invoice jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id      uuid := public.get_manager_id();
  v_invoice_id    uuid;
  v_allow_neg     boolean;
  v_line          jsonb;
  v_product_id    uuid;
  v_qty           numeric(14,4);
  v_unit_price    numeric(14,2);
  v_on_hand       numeric(14,4);
  v_avg_cost      numeric(14,2);
  v_product_name  text;
BEGIN
  IF NOT (public.is_manager() OR public.rep_has_permission('create_credit_invoice')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_sales_rep() THEN
    IF NOT public.rep_can_write_for(
      NULLIF(p_invoice->>'rep_id', '')::uuid,
      NULLIF(p_invoice->>'customer_id', '')::uuid
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    p_invoice := jsonb_set(p_invoice, '{rep_id}', to_jsonb(public.get_current_rep_id()::text));
  END IF;

  SELECT allow_negative_stock INTO v_allow_neg
  FROM public.app_settings WHERE owner_id = v_owner_id;
  v_allow_neg := COALESCE(v_allow_neg, false);

  IF p_invoice->>'id' IS NOT NULL AND p_invoice->>'id' != '' THEN
    v_invoice_id := (p_invoice->>'id')::uuid;

    IF public.is_sales_rep() AND NOT EXISTS (
      SELECT 1 FROM public.credit_invoices ci
      WHERE ci.id = v_invoice_id AND ci.owner_id = v_owner_id
        AND ci.rep_id = public.get_current_rep_id()
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    UPDATE public.credit_invoices SET
      date       = (p_invoice->>'date')::date,
      invoice_no = p_invoice->>'invoice_no',
      customer_id= NULLIF(p_invoice->>'customer_id','')::uuid,
      rep_id     = NULLIF(p_invoice->>'rep_id','')::uuid,
      item       = COALESCE(p_invoice->>'item', ''),
      due_date   = NULLIF(p_invoice->>'due_date','')::date,
      amount     = 0
    WHERE id = v_invoice_id AND owner_id = v_owner_id;

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

    DELETE FROM public.invoice_lines
    WHERE invoice_type = 'credit' AND invoice_id = v_invoice_id AND owner_id = v_owner_id;

  ELSE
    INSERT INTO public.credit_invoices
      (owner_id, date, invoice_no, customer_id, rep_id, item, due_date, amount, paid)
    VALUES (
      v_owner_id,
      (p_invoice->>'date')::date,
      p_invoice->>'invoice_no',
      NULLIF(p_invoice->>'customer_id','')::uuid,
      NULLIF(p_invoice->>'rep_id','')::uuid,
      COALESCE(p_invoice->>'item', ''),
      NULLIF(p_invoice->>'due_date','')::date,
      0,
      COALESCE((p_invoice->>'paid')::numeric, 0)
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;

    v_on_hand := public.product_on_hand(v_owner_id, v_product_id);
    IF NOT v_allow_neg AND v_on_hand < v_qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'الكمية المتاحة من "%" هي % فقط ولا تكفي لإتمام الفاتورة',
        COALESCE(v_product_name, v_product_id::text), v_on_hand;
    END IF;

    v_avg_cost := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.invoice_lines
      (owner_id, invoice_type, invoice_id, product_id, qty, unit_price)
    VALUES (v_owner_id, 'credit', v_invoice_id, v_product_id, v_qty, v_unit_price);

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
$function$;

-- 5.3 delete invoice RPCs --------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_cash_invoice(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT (public.is_manager() OR public.rep_has_permission('create_cash_invoice')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_sales_rep() AND NOT EXISTS (
    SELECT 1 FROM public.cash_invoices ci
    WHERE ci.id = p_id AND ci.owner_id = v_owner_id
      AND ci.rep_id = public.get_current_rep_id()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    owner_id, product_id, 'adjustment', -1 * qty, unit_cost, unit_cost,
    'reversal', id,
    'حذف فاتورة نقدية ' || p_id::text,
    auth.uid()
  FROM public.stock_movements
  WHERE reference_type = 'cash_invoice'
    AND reference_id = p_id
    AND owner_id = v_owner_id
    AND movement_type = 'out';

  DELETE FROM public.invoice_lines
  WHERE invoice_type = 'cash' AND invoice_id = p_id AND owner_id = v_owner_id;

  DELETE FROM public.cash_invoices
  WHERE id = p_id AND owner_id = v_owner_id
    AND (not public.is_sales_rep() OR rep_id = public.get_current_rep_id());
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_credit_invoice(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT (public.is_manager() OR public.rep_has_permission('create_credit_invoice')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_sales_rep() AND NOT EXISTS (
    SELECT 1 FROM public.credit_invoices ci
    WHERE ci.id = p_id AND ci.owner_id = v_owner_id
      AND ci.rep_id = public.get_current_rep_id()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    owner_id, product_id, 'adjustment', -1 * qty, unit_cost, unit_cost,
    'reversal', id,
    'حذف فاتورة آجلة ' || p_id::text,
    auth.uid()
  FROM public.stock_movements
  WHERE reference_type = 'credit_invoice'
    AND reference_id = p_id
    AND owner_id = v_owner_id
    AND movement_type = 'out';

  DELETE FROM public.invoice_lines
  WHERE invoice_type = 'credit' AND invoice_id = p_id AND owner_id = v_owner_id;

  DELETE FROM public.credit_invoices
  WHERE id = p_id AND owner_id = v_owner_id
    AND (not public.is_sales_rep() OR rep_id = public.get_current_rep_id());
END;
$function$;

-- 5.4 sales returns -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sales_return(p_return jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT (public.is_manager() OR public.rep_has_permission('create_return')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_sales_rep() THEN
    IF NOT public.rep_can_write_for(
      NULLIF(p_return->>'rep_id', '')::uuid,
      NULLIF(p_return->>'customer_id', '')::uuid
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    p_return := jsonb_set(p_return, '{rep_id}', to_jsonb(public.get_current_rep_id()::text));
  END IF;

  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND (owner_id = v_owner_id OR owner_id = auth.uid())
    ORDER BY id FOR UPDATE;
  END IF;

  INSERT INTO public.sales_returns (
    owner_id, customer_id, rep_id, invoice_type, invoice_id,
    return_date, refund_method, total_amount, notes
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

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id  := (v_line->>'product_id')::uuid;
    v_qty         := (v_line->>'qty')::numeric;
    v_unit_price  := (v_line->>'unit_price')::numeric;
    v_condition   := COALESCE(v_line->>'condition', 'salable');
    v_avg_cost    := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.sales_return_lines (
      return_id, product_id, qty, unit_price, avg_cost_snapshot, condition
    ) VALUES (
      v_return_id, v_product_id, v_qty, v_unit_price, v_avg_cost, v_condition
    );

    v_total_amount := v_total_amount + (v_qty * v_unit_price);

    IF v_condition = 'salable' THEN
      INSERT INTO public.stock_movements (
        owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_owner_id, v_product_id, 'in', v_qty, v_avg_cost, v_avg_cost,
        'sales_return', v_return_id,
        'مرتجع مبيعات سليم - استرداد للمخزن',
        auth.uid()
      );
    ELSE
      INSERT INTO public.stock_movements (
        owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_owner_id, v_product_id, 'adjustment', 0, v_avg_cost, v_avg_cost,
        'sales_return_spoilage', v_return_id,
        'مرتجع مبيعات تالف / هالك - لا يضاف للمخزون الصالح',
        auth.uid()
      );
    END IF;
  END LOOP;

  UPDATE public.sales_returns
  SET total_amount = v_total_amount
  WHERE id = v_return_id;

  RETURN v_return_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_sales_return(p_return jsonb, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  IF NOT (public.is_manager() OR public.rep_has_permission('create_return')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_sales_rep() THEN
    IF NOT public.rep_can_write_for(
      NULLIF(p_return->>'rep_id', '')::uuid,
      NULLIF(p_return->>'customer_id', '')::uuid
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    p_return := jsonb_set(p_return, '{rep_id}', to_jsonb(public.get_current_rep_id()::text));
  END IF;

  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND (owner_id = v_owner_id OR owner_id = auth.uid())
    ORDER BY id FOR UPDATE;
  END IF;

  IF p_return->>'id' IS NOT NULL AND p_return->>'id' != '' THEN
    v_return_id := (p_return->>'id')::uuid;

    IF public.is_sales_rep() AND NOT EXISTS (
      SELECT 1 FROM public.sales_returns sr
      WHERE sr.id = v_return_id AND sr.owner_id = v_owner_id
        AND sr.rep_id = public.get_current_rep_id()
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    SELECT
      owner_id, product_id, 'adjustment', -1 * qty, unit_cost, avg_cost_snapshot,
      'reversal', id,
      'تعديل مرتجع مبيعات ' || v_return_id::text,
      auth.uid()
    FROM public.stock_movements
    WHERE reference_type = 'sales_return'
      AND reference_id = v_return_id
      AND owner_id = v_owner_id
      AND movement_type = 'in';

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    SELECT
      owner_id, product_id, 'adjustment', 0, unit_cost, avg_cost_snapshot,
      'reversal', id,
      'تعديل مرتجع مبيعات تالف ' || v_return_id::text,
      auth.uid()
    FROM public.stock_movements
    WHERE reference_type = 'sales_return_spoilage'
      AND reference_id = v_return_id
      AND owner_id = v_owner_id;

    DELETE FROM public.sales_return_lines
    WHERE return_id = v_return_id
      AND EXISTS (
        SELECT 1 FROM public.sales_returns sr
        WHERE sr.id = v_return_id AND sr.owner_id = v_owner_id
      );

    UPDATE public.sales_returns
    SET
      customer_id   = (p_return->>'customer_id')::uuid,
      rep_id        = NULLIF(p_return->>'rep_id', '')::uuid,
      invoice_type  = NULLIF(p_return->>'invoice_type', ''),
      invoice_id    = NULLIF(p_return->>'invoice_id', '')::uuid,
      return_date   = COALESCE(NULLIF(p_return->>'return_date', '')::date, current_date),
      refund_method = COALESCE(p_return->>'refund_method', 'credit_balance'),
      notes         = p_return->>'notes',
      total_amount  = 0
    WHERE id = v_return_id AND owner_id = v_owner_id;
  ELSE
    INSERT INTO public.sales_returns (
      owner_id, customer_id, rep_id, invoice_type, invoice_id,
      return_date, refund_method, total_amount, notes
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
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;
    v_condition  := COALESCE(v_line->>'condition', 'salable');
    v_avg_cost   := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.sales_return_lines (
      return_id, product_id, qty, unit_price, avg_cost_snapshot, condition
    ) VALUES (
      v_return_id, v_product_id, v_qty, v_unit_price, v_avg_cost, v_condition
    );

    v_total_amount := v_total_amount + (v_qty * v_unit_price);

    IF v_condition = 'salable' THEN
      INSERT INTO public.stock_movements (
        owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_owner_id, v_product_id, 'in', v_qty, v_avg_cost, v_avg_cost,
        'sales_return', v_return_id,
        'مرتجع مبيعات سليم - استرداد للمخزن',
        auth.uid()
      );
    ELSE
      INSERT INTO public.stock_movements (
        owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        v_owner_id, v_product_id, 'adjustment', 0, v_avg_cost, v_avg_cost,
        'sales_return_spoilage', v_return_id,
        'مرتجع مبيعات تالف / هالك - لا يضاف للمخزون الصالح',
        auth.uid()
      );
    END IF;
  END LOOP;

  UPDATE public.sales_returns
  SET total_amount = v_total_amount
  WHERE id = v_return_id;

  RETURN v_return_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_sales_return(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT (public.is_manager() OR public.rep_has_permission('create_return')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_sales_rep() AND NOT EXISTS (
    SELECT 1 FROM public.sales_returns sr
    WHERE sr.id = p_id AND sr.owner_id = v_owner_id
      AND sr.rep_id = public.get_current_rep_id()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    owner_id, product_id, 'adjustment', -1 * qty, unit_cost, avg_cost_snapshot,
    'reversal', id,
    'حذف مرتجع مبيعات ' || p_id::text,
    auth.uid()
  FROM public.stock_movements
  WHERE reference_type = 'sales_return'
    AND reference_id = p_id
    AND owner_id = v_owner_id
    AND movement_type = 'in';

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    owner_id, product_id, 'adjustment', 0, unit_cost, avg_cost_snapshot,
    'reversal', id,
    'حذف مرتجع مبيعات تالف ' || p_id::text,
    auth.uid()
  FROM public.stock_movements
  WHERE reference_type = 'sales_return_spoilage'
    AND reference_id = p_id
    AND owner_id = v_owner_id;

  DELETE FROM public.sales_return_lines
  WHERE return_id = p_id
    AND EXISTS (
      SELECT 1 FROM public.sales_returns sr
      WHERE sr.id = p_id AND sr.owner_id = v_owner_id
    );

  DELETE FROM public.sales_returns
  WHERE id = p_id AND owner_id = v_owner_id
    AND (not public.is_sales_rep() OR rep_id = public.get_current_rep_id());
END;
$function$;

-- 5.5 statement / overdue read RPCs (SECURITY INVOKER: RLS still applies) ---
CREATE OR REPLACE FUNCTION public.customer_statement(p_customer_id uuid, p_from date DEFAULT '2000-01-01'::date, p_to date DEFAULT '2099-12-31'::date)
 RETURNS TABLE(row_no bigint, tx_date date, tx_type text, ref text, description text, debit numeric, credit numeric, balance numeric, invoice_id uuid, invoice_type text, payment_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH opening AS (
    SELECT COALESCE(c.opening_balance, 0)
         + COALESCE(SUM(CASE WHEN t.kind = 'invoice' THEN t.amount ELSE -t.amount END), 0) AS bal
    FROM public.customers c
    LEFT JOIN public.v_customer_transactions t
      ON t.customer_id = c.id AND t.tx_date < p_from
    WHERE c.id = p_customer_id
      AND (not public.is_sales_rep() or public.rep_has_permission('view_statement'))
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
      AND (not public.is_sales_rep() or public.rep_has_permission('view_statement'))
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
$function$;

CREATE OR REPLACE FUNCTION public.unpaid_credit_invoices_list()
 RETURNS TABLE(invoice_id uuid, invoice_no text, invoice_date date, due_date date, days_diff integer, is_overdue boolean, customer_id uuid, customer_name text, customer_phone text, rep_id uuid, rep_name text, total_amount numeric, paid_amount numeric, remaining_amount numeric, status text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    v.id::uuid,
    v.invoice_no::text,
    v.date::date,
    coalesce(v.due_date, v.date + interval '15 days')::date,
    (current_date - coalesce(v.due_date, v.date + interval '15 days')::date)::integer,
    (coalesce(v.due_date, v.date + interval '15 days')::date < current_date),
    c.id,
    c.name,
    c.phone,
    v.rep_id,
    r.name,
    v.amount::numeric(14,2),
    (v.paid + v.linked_payments)::numeric(14,2),
    v.remaining::numeric(14,2),
    case when (v.paid + v.linked_payments) > 0 then 'partial' else 'unpaid' end::text
  FROM public.v_credit_invoices v
  LEFT JOIN public.customers c ON c.id = v.customer_id
  LEFT JOIN public.reps r ON r.id = v.rep_id
  WHERE v.remaining > 0
    AND (not public.is_sales_rep() or public.rep_has_permission('view_overdue'))
  ORDER BY 4 ASC, 3 ASC;
$function$;

-- 5.6 inventory stock read RPCs -------------------------------------------
CREATE OR REPLACE FUNCTION public.product_stock_summary_v3()
 RETURNS TABLE(product_id uuid, name_ar text, name_en text, sku text, unit text, category text, price numeric, on_hand numeric, reserved_qty numeric, available_qty numeric, avg_cost numeric, stock_value numeric, min_stock_alert numeric, expiry_date date, batch_number text, days_to_expiry integer, alert_status text, is_active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      WHEN (COALESCE(SUM(sm.qty), 0) - COALESCE(r.res_qty, 0)) <= 0 THEN 'out_of_stock'
      WHEN p.expiry_date IS NOT NULL AND p.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN p.expiry_date IS NOT NULL AND (p.expiry_date - CURRENT_DATE) <= 30 THEN 'expiring_soon'
      WHEN p.min_stock_alert > 0 AND (COALESCE(SUM(sm.qty), 0) - COALESCE(r.res_qty, 0)) <= p.min_stock_alert THEN 'low_stock'
      ELSE 'ok'
    END AS alert_status,
    p.is_active
  FROM public.products p
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = p.id
    AND sm.owner_id = public.get_manager_id()
  LEFT JOIN reserved r ON r.product_id = p.id
  WHERE (p.owner_id = public.get_manager_id() OR p.owner_id = auth.uid())
    AND (not public.is_sales_rep() or public.rep_has_permission('view_inventory'))
  GROUP BY
    p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category,
    p.price, p.min_stock_alert, p.expiry_date, p.batch_number, p.is_active, p.sort_order, r.res_qty
  ORDER BY p.sort_order, p.name_ar;
$function$;

CREATE OR REPLACE FUNCTION public.stock_alerts_summary()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH summary AS (
    SELECT * FROM public.product_stock_summary_v3()
  )
  SELECT jsonb_build_object(
    'out_of_stock_count',   COUNT(*) FILTER (WHERE alert_status = 'out_of_stock'),
    'low_stock_count',       COUNT(*) FILTER (WHERE alert_status = 'low_stock'),
    'expired_count',         COUNT(*) FILTER (WHERE alert_status = 'expired'),
    'expiring_soon_count',   COUNT(*) FILTER (WHERE alert_status = 'expiring_soon'),
    'total_alerts_count',    COUNT(*) FILTER (WHERE alert_status != 'ok')
  )
  FROM summary
  WHERE (not public.is_sales_rep() or public.rep_has_permission('view_inventory'));
$function$;

CREATE OR REPLACE FUNCTION public.stock_valuation()
 RETURNS TABLE(product_id uuid, name_ar text, unit text, category text, on_hand numeric, avg_cost numeric, stock_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    product_id, name_ar, unit, category, on_hand, avg_cost, stock_value
  FROM public.product_stock_summary()
  WHERE on_hand != 0
    AND (not public.is_sales_rep() or public.rep_has_permission('view_inventory'))
  ORDER BY category NULLS LAST, name_ar;
$function$;

CREATE OR REPLACE FUNCTION public.stock_movement_history(p_product_id uuid DEFAULT NULL::uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(id uuid, product_id uuid, product_name text, movement_type text, qty numeric, unit_cost numeric, avg_cost_snapshot numeric, reference_type text, reference_id uuid, notes text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    sm.id,
    sm.product_id,
    p.name_ar AS product_name,
    sm.movement_type,
    sm.qty,
    sm.unit_cost,
    sm.avg_cost_snapshot,
    sm.reference_type,
    sm.reference_id,
    sm.notes,
    sm.created_at
  FROM public.stock_movements sm
  JOIN public.products p ON p.id = sm.product_id
  WHERE sm.owner_id = public.get_manager_id()
    AND (not public.is_sales_rep() or public.rep_has_permission('view_inventory'))
    AND (p_product_id IS NULL OR sm.product_id = p_product_id)
    AND (p_from IS NULL OR sm.created_at::date >= p_from)
    AND (p_to   IS NULL OR sm.created_at::date <= p_to)
  ORDER BY sm.created_at DESC;
$function$;
