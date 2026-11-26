-- 0035_permissions_hardening.sql
-- Hardening follow-up to 0034_rep_granular_permissions.sql.
--
-- What it changes:
--   1. Restores security_invoker on v_customer_transactions and adds explicit
--      tenant + assigned-customer scoping to customer_statement().
--   2. Adds SECURITY DEFINER scope helpers so record_payment/view_payments and
--      invoice-line visibility no longer depend on unrelated view_* flags.
--   3. Validates product/invoice references in the newly rep-reachable write RPCs.
--   4. Restores search_path = public, pg_temp and revokes anon/PUBLIC execute on
--      every 0034 function (helper, write RPCs and stock/statement read RPCs).
--
-- Additive and idempotent: CREATE OR REPLACE FUNCTION, ALTER FUNCTION,
-- ALTER VIEW, DROP POLICY IF EXISTS + CREATE POLICY, DROP/GRANT ACL changes.
-- No applied migration is edited and no table data is rewritten.
--
-- Rollback (manual):
--   - Restore the 0034 definitions of the four write RPCs, customer_statement(),
--     unpaid_credit_invoices_list() and product_stock_summary_v3() from version control.
--   - `alter view public.v_customer_transactions reset (security_invoker)`.
--   - Restore the pre-0035 rep_read_* / rep_insert_payments / rep_update_payments
--     policies from 0034, drop the three new helpers, and re-grant the original ACLs.
--   - Restore the original `search_path = public` configs with ALTER FUNCTION.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. View hardening
-- ---------------------------------------------------------------------------
ALTER VIEW public.v_customer_transactions SET (security_invoker = true);

-- ---------------------------------------------------------------------------
-- 2. Scope helpers. These deliberately carry no permission flags: their job is
--    only to enforce tenant + assigned-customer/rep ownership. The caller's
--    view_* / record_* flag is checked separately by the policy or RPC guard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rep_can_write_for(p_rep_id uuid, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    public.is_manager()
    OR (
      public.is_sales_rep()
      AND (p_rep_id IS NULL OR p_rep_id = public.get_current_rep_id())
      AND (
        p_customer_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.customers c
          WHERE c.id = p_customer_id
            AND c.owner_id = public.current_owner_id()
            AND c.representative_id = public.get_current_rep_id()
        )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.rep_can_reference_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    public.is_manager()
    OR (
      public.is_sales_rep()
      AND p_customer_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = p_customer_id
          AND c.owner_id = public.current_owner_id()
          AND c.representative_id = public.get_current_rep_id()
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.rep_can_reference_credit_invoice(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    public.is_manager()
    OR (
      public.is_sales_rep()
      AND p_invoice_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.credit_invoices ci
        WHERE ci.id = p_invoice_id
          AND ci.owner_id = public.current_owner_id()
          AND (
            ci.rep_id = public.get_current_rep_id()
            OR public.rep_can_reference_customer(ci.customer_id)
          )
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.rep_can_read_invoice(p_invoice_type text, p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    public.is_manager()
    OR (
      public.is_sales_rep()
      AND p_invoice_id IS NOT NULL
      AND (
        (
          p_invoice_type = 'cash'
          AND EXISTS (
            SELECT 1 FROM public.cash_invoices ci
            WHERE ci.id = p_invoice_id
              AND ci.owner_id = public.current_owner_id()
              AND (
                ci.rep_id = public.get_current_rep_id()
                OR public.rep_can_reference_customer(ci.customer_id)
              )
          )
        )
        OR (
          p_invoice_type = 'credit'
          AND EXISTS (
            SELECT 1 FROM public.credit_invoices ci
            WHERE ci.id = p_invoice_id
              AND ci.owner_id = public.current_owner_id()
              AND (
                ci.rep_id = public.get_current_rep_id()
                OR public.rep_can_reference_customer(ci.customer_id)
              )
          )
        )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.rep_has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rep_can_write_for(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rep_can_reference_customer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rep_can_reference_credit_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rep_can_read_invoice(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rep_has_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rep_can_write_for(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rep_can_reference_customer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rep_can_reference_credit_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rep_can_read_invoice(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Policies: keep the view_* flag that controls each screen, but source the
--    ownership subqueries from SECURITY DEFINER helpers so e.g. recording a
--    payment does not silently require view_customers/view_credit.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS rep_read_cash ON public.cash_invoices;
CREATE POLICY rep_read_cash ON public.cash_invoices
  FOR SELECT USING (
    public.is_sales_rep()
    AND owner_id = public.current_owner_id()
    AND public.rep_has_permission('view_cash')
    AND (
      rep_id = public.get_current_rep_id()
      OR public.rep_can_reference_customer(customer_id)
    )
  );

DROP POLICY IF EXISTS rep_read_credit ON public.credit_invoices;
CREATE POLICY rep_read_credit ON public.credit_invoices
  FOR SELECT USING (
    public.is_sales_rep()
    AND owner_id = public.current_owner_id()
    AND public.rep_has_permission('view_credit')
    AND (
      rep_id = public.get_current_rep_id()
      OR public.rep_can_reference_customer(customer_id)
    )
  );

DROP POLICY IF EXISTS rep_read_payments ON public.payments;
CREATE POLICY rep_read_payments ON public.payments
  FOR SELECT USING (
    public.is_sales_rep()
    AND owner_id = public.current_owner_id()
    AND public.rep_has_permission('view_payments')
    AND (
      rep_id = public.get_current_rep_id()
      OR public.rep_can_reference_credit_invoice(credit_invoice_id)
      OR public.rep_can_reference_customer(customer_id)
    )
  );

DROP POLICY IF EXISTS rep_read_invoice_lines ON public.invoice_lines;
CREATE POLICY rep_read_invoice_lines ON public.invoice_lines
  FOR SELECT USING (
    (NOT public.is_manager())
    AND owner_id = public.get_manager_id()
    AND (
      (invoice_type = 'cash' AND public.rep_has_permission('view_cash'))
      OR (invoice_type = 'credit' AND public.rep_has_permission('view_credit'))
    )
    AND public.rep_can_read_invoice(invoice_type, invoice_id)
  );

DROP POLICY IF EXISTS rep_insert_payments ON public.payments;
CREATE POLICY rep_insert_payments ON public.payments
  FOR INSERT WITH CHECK (
    public.is_sales_rep()
    AND public.rep_has_permission('record_payment')
    AND owner_id = public.current_owner_id()
    AND (rep_id IS NULL OR rep_id = public.get_current_rep_id())
    AND (customer_id IS NULL OR public.rep_can_reference_customer(customer_id))
    AND (credit_invoice_id IS NULL OR public.rep_can_reference_credit_invoice(credit_invoice_id))
  );

DROP POLICY IF EXISTS rep_update_payments ON public.payments;
CREATE POLICY rep_update_payments ON public.payments
  FOR UPDATE USING (
    public.is_sales_rep()
    AND public.rep_has_permission('record_payment')
    AND owner_id = public.current_owner_id()
    AND rep_id = public.get_current_rep_id()
  )
  WITH CHECK (
    public.is_sales_rep()
    AND public.rep_has_permission('record_payment')
    AND owner_id = public.current_owner_id()
    AND (rep_id IS NULL OR rep_id = public.get_current_rep_id())
    AND (customer_id IS NULL OR public.rep_can_reference_customer(customer_id))
    AND (credit_invoice_id IS NULL OR public.rep_can_reference_credit_invoice(credit_invoice_id))
  );

-- ---------------------------------------------------------------------------
-- 4. Write RPCs: add tenant validation for product and invoice references and
--    restore pg_temp in the search_path. Manager branches are unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_cash_invoice(p_invoice jsonb, p_lines jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = ANY(v_pids) AND p.owner_id IS DISTINCT FROM v_owner_id
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND owner_id = v_owner_id
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

CREATE OR REPLACE FUNCTION public.save_credit_invoice(p_invoice jsonb, p_lines jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  v_pids          uuid[];
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

  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = ANY(v_pids) AND p.owner_id IS DISTINCT FROM v_owner_id
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND owner_id = v_owner_id
    ORDER BY id FOR UPDATE;
  END IF;

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

CREATE OR REPLACE FUNCTION public.process_sales_return(p_return jsonb, p_lines jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

    IF NULLIF(p_return->>'invoice_id', '') IS NOT NULL
       AND NOT public.rep_can_read_invoice(
         NULLIF(p_return->>'invoice_type', ''),
         (p_return->>'invoice_id')::uuid
       ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = ANY(v_pids) AND p.owner_id IS DISTINCT FROM v_owner_id
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND owner_id = v_owner_id
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
SET search_path = public, pg_temp
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

    IF NULLIF(p_return->>'invoice_id', '') IS NOT NULL
       AND NOT public.rep_can_read_invoice(
         NULLIF(p_return->>'invoice_type', ''),
         (p_return->>'invoice_id')::uuid
       ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  SELECT array_agg(DISTINCT (l->>'product_id')::uuid)
  INTO v_pids
  FROM jsonb_array_elements(p_lines) l
  WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') != '';

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = ANY(v_pids) AND p.owner_id IS DISTINCT FROM v_owner_id
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND owner_id = v_owner_id
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

-- Bodies unchanged; restore pg_temp hardening with ALTER FUNCTION.
ALTER FUNCTION public.delete_cash_invoice(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_credit_invoice(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_sales_return(uuid) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.save_cash_invoice(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_credit_invoice(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_cash_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_credit_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_sales_return(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_sales_return(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_sales_return(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_invoice(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_credit_invoice(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_cash_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_credit_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.process_sales_return(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_sales_return(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_sales_return(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Statement / overdue read RPCs. SECURITY DEFINER is now paired with
--    explicit owner_id and assigned-customer predicates; the view's invoker
--    setting is still restored above for direct view access.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.customer_statement(
  p_customer_id uuid,
  p_from date DEFAULT '2000-01-01'::date,
  p_to date DEFAULT '2099-12-31'::date
)
RETURNS TABLE(
  row_no bigint, tx_date date, tx_type text, ref text, description text,
  debit numeric, credit numeric, balance numeric,
  invoice_id uuid, invoice_type text, payment_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH opening AS (
    SELECT COALESCE(c.opening_balance, 0)
         + COALESCE(SUM(CASE WHEN t.kind = 'invoice' THEN t.amount ELSE -t.amount END), 0) AS bal
    FROM public.customers c
    LEFT JOIN public.v_customer_transactions t
      ON t.customer_id = c.id
     AND t.owner_id = c.owner_id
     AND t.tx_date < p_from
    WHERE c.id = p_customer_id
      AND c.owner_id = public.current_owner_id()
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
      AND t.owner_id = public.current_owner_id()
      AND t.tx_date BETWEEN p_from AND p_to
  )
  SELECT * FROM (
    SELECT
      0::bigint AS row_no,
      CASE
        WHEN p_from = DATE '2000-01-01'
          THEN COALESCE(
            (SELECT c.created_at::date FROM public.customers c
             WHERE c.id = p_customer_id AND c.owner_id = public.current_owner_id()),
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
  ) AS stmt
  WHERE (
    NOT public.is_sales_rep()
    OR (
      public.rep_has_permission('view_statement')
      AND public.rep_can_reference_customer(p_customer_id)
    )
  )
  ORDER BY row_no;
$function$;

REVOKE ALL ON FUNCTION public.customer_statement(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_statement(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.unpaid_credit_invoices_list()
RETURNS TABLE(
  invoice_id uuid, invoice_no text, invoice_date date, due_date date,
  days_diff integer, is_overdue boolean, customer_id uuid,
  customer_name text, customer_phone text, rep_id uuid, rep_name text,
  total_amount numeric, paid_amount numeric, remaining_amount numeric, status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
  LEFT JOIN public.customers c
    ON c.id = v.customer_id AND c.owner_id = public.current_owner_id()
  LEFT JOIN public.reps r
    ON r.id = v.rep_id AND r.owner_id = public.current_owner_id()
  WHERE v.owner_id = public.current_owner_id()
    AND v.remaining > 0
    AND (
      NOT public.is_sales_rep()
      OR (
        public.rep_has_permission('view_overdue')
        AND (
          v.rep_id = public.get_current_rep_id()
          OR public.rep_can_reference_customer(v.customer_id)
        )
      )
    )
  ORDER BY 4 ASC, 3 ASC;
$function$;

REVOKE ALL ON FUNCTION public.unpaid_credit_invoices_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpaid_credit_invoices_list() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Stock read RPCs: pg_temp hardening and authenticated-only execution.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_stock_summary_v3()
RETURNS TABLE(
  product_id uuid, name_ar text, name_en text, sku text, unit text, category text,
  price numeric, on_hand numeric, reserved_qty numeric, available_qty numeric,
  avg_cost numeric, stock_value numeric, min_stock_alert numeric,
  expiry_date date, batch_number text, days_to_expiry integer,
  alert_status text, is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
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
  WHERE p.owner_id = public.get_manager_id()
    AND (NOT public.is_sales_rep() OR public.rep_has_permission('view_inventory'))
  GROUP BY
    p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category,
    p.price, p.min_stock_alert, p.expiry_date, p.batch_number, p.is_active, p.sort_order, r.res_qty
  ORDER BY p.sort_order, p.name_ar;
$function$;

ALTER FUNCTION public.stock_alerts_summary() SET search_path = public, pg_temp;
ALTER FUNCTION public.stock_valuation() SET search_path = public, pg_temp;
ALTER FUNCTION public.stock_movement_history(uuid, date, date) SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.product_stock_summary_v3() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_alerts_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_valuation() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_movement_history(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_stock_summary_v3() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_alerts_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_valuation() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_movement_history(uuid, date, date) TO authenticated, service_role;

COMMIT;
