-- Migration 0041: Per-invoice-line unit override
-- Adds:
--   1. invoice_lines.unit — the unit chosen on the invoice line (nullable).
--      Existing rows keep deriving their unit from products.unit in the UI.
--   2. save_cash_invoice() and save_credit_invoice() now read `unit` from each
--      line JSON object and persist it on invoice_lines.
--
-- No data is rewritten and no constraint is added: existing products may hold
-- legacy free-text units, so the fixed dropdown is enforced in the UI only.
--
-- Rollback notes:
--   ALTER TABLE public.invoice_lines DROP COLUMN IF EXISTS unit;
--   Restore public.save_cash_invoice(jsonb, jsonb) from 0035_permissions_hardening.sql
--   and public.save_credit_invoice(jsonb, jsonb, boolean) from
--   0037_notifications_and_low_stock_10.sql (remove the unit INSERT column/value).

-- ─── 1. Schema ────────────────────────────────────────────────────────────────
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS unit text;

-- ─── 2. save_cash_invoice ─────────────────────────────────────────────────────
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
      (owner_id, invoice_type, invoice_id, product_id, qty, unit_price, unit)
    VALUES (
      v_owner_id, 'cash', v_invoice_id, v_product_id, v_qty, v_unit_price,
      NULLIF(btrim(v_line->>'unit'), '')
    );

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

REVOKE ALL ON FUNCTION public.save_cash_invoice(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_cash_invoice(jsonb, jsonb) TO authenticated, service_role;

-- ─── 3. save_credit_invoice ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_credit_invoice(
  p_invoice jsonb,
  p_lines jsonb,
  p_manager_override boolean DEFAULT false
)
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
  v_amount        numeric(14,2);
  v_actor         text;
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
      (owner_id, invoice_type, invoice_id, product_id, qty, unit_price, unit)
    VALUES (
      v_owner_id, 'credit', v_invoice_id, v_product_id, v_qty, v_unit_price,
      NULLIF(btrim(v_line->>'unit'), '')
    );

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
  WHERE id = v_invoice_id
  RETURNING amount INTO v_amount;

  IF p_manager_override THEN
    SELECT COALESCE(email, 'مستخدم') INTO v_actor
    FROM auth.users WHERE id = auth.uid();
    v_actor := COALESCE(v_actor, 'مستخدم');

    INSERT INTO public.notifications (
      owner_id, recipient_user_id, category, severity, title, message, target_tab, target_id
    ) VALUES (
      v_owner_id, NULL, 'override', 'warning',
      'تجاوز حد الائتمان',
      format('تم حفظ فاتورة آجل %s بقيمة %s ج.م مع تجاوز حد الائتمان بواسطة %s.',
        COALESCE(p_invoice->>'invoice_no', '-'), COALESCE(v_amount, 0)::text, v_actor),
      'credit', v_invoice_id
    );
  END IF;

  RETURN v_invoice_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_credit_invoice(jsonb, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_credit_invoice(jsonb, jsonb, boolean) TO authenticated, service_role;
