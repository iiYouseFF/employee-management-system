-- 0037_notifications_and_low_stock_10.sql
-- Adds system notifications, live operational alerts, and a 10-unit low-stock
-- threshold across inventory/alerts/PDF surfaces.
--
-- What it changes:
--   1. app_settings.low_stock_threshold (default 10) and
--      app_settings.high_custody_threshold (default 10000); products.min_stock_alert
--      default becomes 10 for newly created products. Existing product rows are
--      NOT rewritten: 0037 treats NULL/0/1 as "use the tenant threshold" so the
--      effective threshold is always at least 10.
--   2. Recreates product_stock_summary_v3() with the same public signature so
--      alert_status and the reported min_stock_alert use the effective threshold.
--      stock_alerts_summary() keeps its existing signature and inherits the fix.
--   3. Creates public.notifications with RLS. Only security-definer triggers/RPCs
--      write to it; clients can read rows they are entitled to see.
--   4. AFTER INSERT triggers on cash_invoices, credit_invoices, payments and
--      sales_returns notify the manager when a sales rep records field activity.
--   5. save_credit_invoice(jsonb, jsonb, boolean DEFAULT false) logs a warning
--      notification when p_manager_override is true; existing 2-argument calls
--      keep working through the default.
--   6. get_operational_alerts() (SECURITY INVOKER) and mark_notifications_read()
--      (SECURITY DEFINER, visible rows only) power the notifications drawer.
--
-- Additive and idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE,
-- DROP/CREATE POLICY IF EXISTS and DROP/CREATE TRIGGER IF EXISTS are safe to rerun.
-- No applied migration is edited and no tenant data is deleted.
--
-- Rollback notes:
--   DROP TRIGGER IF EXISTS notify_rep_cash_activity ON public.cash_invoices;
--   DROP TRIGGER IF EXISTS notify_rep_credit_activity ON public.credit_invoices;
--   DROP TRIGGER IF EXISTS notify_rep_payment_activity ON public.payments;
--   DROP TRIGGER IF EXISTS notify_rep_return_activity ON public.sales_returns;
--   DROP FUNCTION IF EXISTS public.notify_manager_on_rep_activity();
--   DROP FUNCTION IF EXISTS public.get_operational_alerts();
--   DROP FUNCTION IF EXISTS public.mark_notifications_read(uuid[]);
--   DROP TABLE IF EXISTS public.notifications;
--   DROP FUNCTION IF EXISTS public.save_credit_invoice(jsonb, jsonb, boolean);
--   -- Restore the previous 2-argument save_credit_invoice from migration 0036-era source.
--   ALTER TABLE public.app_settings DROP COLUMN IF EXISTS low_stock_threshold,
--     DROP COLUMN IF EXISTS high_custody_threshold;
--   ALTER TABLE public.products ALTER COLUMN min_stock_alert SET DEFAULT 0;
--   -- Restore product_stock_summary_v3() from the previous migration source.

-- ─── 1. Tenant thresholds ─────────────────────────────────────────────────────
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS low_stock_threshold numeric(14,4) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS high_custody_threshold numeric(14,2) NOT NULL DEFAULT 10000;

-- Fix legacy rows that were seeded with the old 1-unit default. New rows get 10.
UPDATE public.app_settings SET low_stock_threshold = 10 WHERE low_stock_threshold = 1;
UPDATE public.app_settings SET high_custody_threshold = 10000 WHERE high_custody_threshold = 1;

ALTER TABLE public.products
  ALTER COLUMN min_stock_alert SET DEFAULT 10;

-- ─── 2. Effective-threshold stock summary ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.product_stock_summary_v3()
RETURNS TABLE(
  product_id uuid, name_ar text, name_en text, sku text, unit text, category text,
  price numeric, on_hand numeric, reserved_qty numeric, available_qty numeric,
  avg_cost numeric, stock_value numeric, min_stock_alert numeric,
  expiry_date date, batch_number text, days_to_expiry integer,
  alert_status text, is_active boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  WITH reserved AS (
    SELECT il.product_id, SUM(il.qty) AS res_qty
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
  ),
  settings AS (
    SELECT COALESCE(s.low_stock_threshold, 10)::numeric(14,4) AS threshold
    FROM public.app_settings s
    WHERE s.owner_id = public.get_manager_id()
  ),
  base AS (
    SELECT
      p.id,
      p.name_ar,
      p.name_en,
      p.sku,
      p.unit,
      p.category,
      p.price,
      COALESCE(SUM(sm.qty), 0)::numeric(14,4) AS on_hand,
      COALESCE(r.res_qty, 0)::numeric(14,4) AS reserved_qty,
      (COALESCE(SUM(sm.qty), 0) - COALESCE(r.res_qty, 0))::numeric(14,4) AS available_qty,
      CASE
        WHEN SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END) = 0 THEN 0::numeric(14,2)
        ELSE ROUND(
          SUM(CASE WHEN sm.qty > 0 THEN sm.qty * sm.unit_cost ELSE 0 END) /
          SUM(CASE WHEN sm.qty > 0 THEN sm.qty ELSE 0 END), 2
        )::numeric(14,2)
      END AS avg_cost,
      CASE
        WHEN p.min_stock_alert IS NULL OR p.min_stock_alert <= 1
          THEN COALESCE((SELECT threshold FROM settings), 10)::numeric(14,4)
        ELSE p.min_stock_alert::numeric(14,4)
      END AS effective_threshold,
      p.expiry_date,
      p.batch_number,
      p.is_active,
      p.sort_order
    FROM public.products p
    LEFT JOIN public.stock_movements sm
      ON sm.product_id = p.id
      AND sm.owner_id = public.get_manager_id()
    LEFT JOIN reserved r ON r.product_id = p.id
    WHERE p.owner_id = public.get_manager_id()
      AND (NOT public.is_sales_rep() OR public.rep_has_permission('view_inventory'))
    GROUP BY
      p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category, p.price,
      p.min_stock_alert, p.expiry_date, p.batch_number, p.is_active,
      p.sort_order, r.res_qty
  )
  SELECT
    b.id AS product_id,
    b.name_ar,
    b.name_en,
    b.sku,
    b.unit,
    b.category,
    b.price,
    b.on_hand,
    b.reserved_qty,
    b.available_qty,
    b.avg_cost,
    (b.on_hand * b.avg_cost)::numeric(14,2) AS stock_value,
    b.effective_threshold AS min_stock_alert,
    b.expiry_date,
    b.batch_number,
    CASE WHEN b.expiry_date IS NOT NULL THEN (b.expiry_date - CURRENT_DATE)::integer ELSE NULL END AS days_to_expiry,
    CASE
      WHEN b.available_qty <= 0 THEN 'out_of_stock'
      WHEN b.expiry_date IS NOT NULL AND b.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN b.expiry_date IS NOT NULL AND (b.expiry_date - CURRENT_DATE) <= 30 THEN 'expiring_soon'
      WHEN b.available_qty <= b.effective_threshold THEN 'low_stock'
      ELSE 'ok'
    END AS alert_status,
    b.is_active
  FROM base b
  ORDER BY b.sort_order, b.name_ar;
$function$;

REVOKE EXECUTE ON FUNCTION public.product_stock_summary_v3() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.product_stock_summary_v3() TO authenticated, service_role;

-- ─── 3. Notifications table + RLS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('stock', 'overdue', 'expiry', 'custody', 'activity', 'override')),
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  message text NOT NULL,
  target_tab text,
  target_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_owner_recipient_unread_created_idx
  ON public.notifications (owner_id, recipient_user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_tenant_read ON public.notifications;
CREATE POLICY notifications_tenant_read ON public.notifications
  FOR SELECT TO authenticated
  USING (
    owner_id = public.get_manager_id()
    AND (
      recipient_user_id = auth.uid()
      OR (recipient_user_id IS NULL AND public.is_manager())
    )
  );

GRANT SELECT, UPDATE (is_read) ON public.notifications TO authenticated;

-- ─── 4. Rep activity notifications ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_manager_on_rep_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_row jsonb := to_jsonb(NEW);
  v_owner_id uuid := NULLIF(v_row->>'owner_id', '')::uuid;
  v_rep_id uuid := NULLIF(v_row->>'rep_id', '')::uuid;
  v_customer_id uuid := NULLIF(v_row->>'customer_id', '')::uuid;
  v_rep_name text := 'مندوب';
  v_customer_name text := 'عميل غير محدد';
  v_amount numeric(14,2) := COALESCE(
    NULLIF(v_row->>'amount', '')::numeric,
    NULLIF(v_row->>'total_amount', '')::numeric,
    0
  )::numeric(14,2);
  v_label text;
  v_target_tab text;
  v_message text;
BEGIN
  IF TG_OP <> 'INSERT' OR v_owner_id IS NULL OR NOT public.is_sales_rep() THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_rep_name FROM public.reps WHERE id = v_rep_id AND owner_id = v_owner_id;
  SELECT name INTO v_customer_name FROM public.customers WHERE id = v_customer_id AND owner_id = v_owner_id;
  v_rep_name := COALESCE(v_rep_name, 'مندوب');
  v_customer_name := COALESCE(v_customer_name, 'عميل غير محدد');

  CASE TG_TABLE_NAME
    WHEN 'cash_invoices' THEN
      v_label := 'فاتورة نقدي'; v_target_tab := 'cash';
    WHEN 'credit_invoices' THEN
      v_label := 'فاتورة آجل'; v_target_tab := 'credit';
    WHEN 'payments' THEN
      v_label := 'دفعة عميل'; v_target_tab := 'payments';
    WHEN 'sales_returns' THEN
      v_label := 'مرتجع مبيعات'; v_target_tab := 'returns';
    ELSE
      RETURN NEW;
  END CASE;

  v_message := format(
    'سجّل %s %s للعميل %s بقيمة %s ج.م.',
    v_rep_name, v_label, v_customer_name, v_amount::text
  );

  INSERT INTO public.notifications (
    owner_id, recipient_user_id, category, severity, title, message, target_tab, target_id
  ) VALUES (
    v_owner_id, NULL, 'activity', 'info',
    'نشاط جديد من مندوب: ' || v_label,
    v_message,
    v_target_tab,
    NULLIF(v_row->>'id', '')::uuid
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_rep_cash_activity ON public.cash_invoices;
CREATE TRIGGER notify_rep_cash_activity
  AFTER INSERT ON public.cash_invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_manager_on_rep_activity();

DROP TRIGGER IF EXISTS notify_rep_credit_activity ON public.credit_invoices;
CREATE TRIGGER notify_rep_credit_activity
  AFTER INSERT ON public.credit_invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_manager_on_rep_activity();

DROP TRIGGER IF EXISTS notify_rep_payment_activity ON public.payments;
CREATE TRIGGER notify_rep_payment_activity
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_manager_on_rep_activity();

DROP TRIGGER IF EXISTS notify_rep_return_activity ON public.sales_returns;
CREATE TRIGGER notify_rep_return_activity
  AFTER INSERT ON public.sales_returns
  FOR EACH ROW EXECUTE FUNCTION public.notify_manager_on_rep_activity();

-- ─── 5. save_credit_invoice override flag ─────────────────────────────────────
-- No dependent objects reference the 2-argument signature (verified in pg_depend).
DROP FUNCTION IF EXISTS public.save_credit_invoice(jsonb, jsonb);

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

REVOKE EXECUTE ON FUNCTION public.save_credit_invoice(jsonb, jsonb, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_credit_invoice(jsonb, jsonb, boolean) TO authenticated, service_role;

-- ─── 6. Live operational alerts (SECURITY INVOKER) ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_operational_alerts()
RETURNS TABLE(
  alert_key text, category text, severity text, title text, message text,
  target_tab text, target_id uuid, count integer
)
LANGUAGE plpgsql
STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF public.is_manager() THEN
    RETURN QUERY
    WITH stock AS (
      SELECT * FROM public.product_stock_summary_v3()
    ),
    overdue AS (
      SELECT * FROM public.unpaid_credit_invoices_list()
    ),
    custody AS (
      SELECT o.rep_id, o.rep_name, SUM(o.remaining_amount)::numeric(14,2) AS total_due
      FROM overdue o
      WHERE o.rep_id IS NOT NULL
      GROUP BY o.rep_id, o.rep_name
    ),
    settings AS (
      SELECT COALESCE(s.high_custody_threshold, 10000)::numeric(14,2) AS threshold
      FROM public.app_settings s
      WHERE s.owner_id = public.get_manager_id()
    ),
    custody_over AS (
      SELECT c.* FROM custody c
      WHERE c.total_due > COALESCE((SELECT threshold FROM settings), 10000)
    )
    SELECT 'out_of_stock'::text, 'stock'::text, 'critical'::text,
           'نفد المخزون'::text,
           format('%s صنف وصل رصيده المتاح إلى الصفر.', COUNT(*)::integer)::text,
           'inventory'::text, NULL::uuid, COUNT(*)::integer
    FROM stock WHERE alert_status = 'out_of_stock'
    HAVING COUNT(*) > 0

    UNION ALL
    SELECT 'low_stock'::text, 'stock'::text, 'warning'::text,
           'نواقص المخزون'::text,
           format('%s صنف تحت حد الأمان (10 أو أقل) — جاهز لقائمة الطلب من الموردين.', COUNT(*)::integer)::text,
           'inventory'::text, NULL::uuid, COUNT(*)::integer
    FROM stock WHERE alert_status = 'low_stock'
    HAVING COUNT(*) > 0

    UNION ALL
    SELECT 'overdue_invoices'::text, 'overdue'::text, 'critical'::text,
           'فواتير متأخرة'::text,
           format('%s فاتورة آجل تجاوزت تاريخ الاستحقاق.', COUNT(*)::integer)::text,
           'overdue_invoices'::text, NULL::uuid, COUNT(*)::integer
    FROM overdue WHERE is_overdue
    HAVING COUNT(*) > 0

    UNION ALL
    SELECT 'expired_stock'::text, 'expiry'::text, 'critical'::text,
           'أصناف منتهية الصلاحية'::text,
           format('%s صنف منتهي الصلاحية.', COUNT(*)::integer)::text,
           'inventory'::text, NULL::uuid, COUNT(*)::integer
    FROM stock WHERE alert_status = 'expired'
    HAVING COUNT(*) > 0

    UNION ALL
    SELECT 'expiring_stock'::text, 'expiry'::text, 'warning'::text,
           'أصناف قريبة الانتهاء'::text,
           format('%s صنف ينتهي خلال 30 يوماً.', COUNT(*)::integer)::text,
           'inventory'::text, NULL::uuid, COUNT(*)::integer
    FROM stock WHERE alert_status = 'expiring_soon'
    HAVING COUNT(*) > 0

    UNION ALL
    SELECT 'high_custody'::text, 'custody'::text, 'warning'::text,
           'تحصيلات مناديب مرتفعة'::text,
           format('%s مندوب تتجاوز فواتيره غير المسددة حد %s ج.م.',
             COUNT(*)::integer,
             COALESCE((SELECT threshold FROM settings), 10000)::text)::text,
           'overdue_invoices'::text, NULL::uuid, COUNT(*)::integer
    FROM custody_over
    HAVING COUNT(*) > 0;
  ELSE
    RETURN QUERY
    SELECT 'overdue_invoices'::text, 'overdue'::text, 'critical'::text,
           'فواتير متأخرة'::text,
           format('%s فاتورة آجل تجاوزت تاريخ الاستحقاق.', COUNT(*)::integer)::text,
           'overdue_invoices'::text, NULL::uuid, COUNT(*)::integer
    FROM public.unpaid_credit_invoices_list() o
    WHERE o.is_overdue
    HAVING COUNT(*) > 0;
  END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_operational_alerts() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operational_alerts() TO authenticated, service_role;

-- ─── 7. Mark notifications read (visible rows only) ───────────────────────────
CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.notifications n
  SET is_read = true
  WHERE n.owner_id = public.get_manager_id()
    AND n.is_read = false
    AND (
      n.recipient_user_id = auth.uid()
      OR (n.recipient_user_id IS NULL AND public.is_manager())
    )
    AND (p_ids IS NULL OR n.id = ANY(p_ids));

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(uuid[]) TO authenticated, service_role;
