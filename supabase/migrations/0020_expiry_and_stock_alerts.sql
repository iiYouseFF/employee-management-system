-- Migration 0020: Expiry Dates and Stock Alerts
-- Adds:
--   1. min_stock_alert, expiry_date, batch_number columns to products
--   2. expiry_date, batch_number to stock_movements
--   3. Updates product_stock_summary() RPC to return min_stock_alert, expiry_date, batch_number, alert_status
--   4. Adds stock_alerts_summary() RPC for quick access to critical alerts (expired, expiring soon, low stock, out of stock)
--   5. Updates receive_stock() RPC to optionally accept p_expiry_date and p_batch_number
--
-- Rollback notes:
--   ALTER TABLE public.products DROP COLUMN IF EXISTS min_stock_alert, DROP COLUMN IF EXISTS expiry_date, DROP COLUMN IF EXISTS batch_number;
--   ALTER TABLE public.stock_movements DROP COLUMN IF EXISTS expiry_date, DROP COLUMN IF EXISTS batch_number;
--   Revert product_stock_summary(), stock_alerts_summary(), receive_stock().

-- ─── 1. Alter products table ──────────────────────────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_stock_alert numeric(14,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS batch_number text;

CREATE INDEX IF NOT EXISTS idx_products_expiry_date 
  ON public.products (owner_id, expiry_date);

-- ─── 2. Alter stock_movements table ──────────────────────────────────────────
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS expiry_date date,
  ADD COLUMN IF NOT EXISTS batch_number text;

CREATE INDEX IF NOT EXISTS idx_stock_movements_expiry
  ON public.stock_movements (owner_id, expiry_date);

-- ─── 3. Updated RPC: receive_stock with expiry and batch ──────────────────────
CREATE OR REPLACE FUNCTION public.receive_stock(
  p_product_id  uuid,
  p_qty         numeric,
  p_unit_cost   numeric,
  p_notes       text DEFAULT NULL,
  p_reference   text DEFAULT NULL,
  p_expiry_date date DEFAULT NULL,
  p_batch_number text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
  v_id       uuid;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_qty <= 0 THEN RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر'; END IF;
  IF p_unit_cost < 0 THEN RAISE EXCEPTION 'تكلفة الوحدة لا يمكن أن تكون سالبة'; END IF;

  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost,
     reference_type, notes, expiry_date, batch_number, created_by)
  VALUES (
    v_owner_id, p_product_id, 'in', p_qty, p_unit_cost,
    'manual', COALESCE(p_notes, p_reference), p_expiry_date, p_batch_number, auth.uid()
  )
  RETURNING id INTO v_id;

  -- If an expiry date or batch number is supplied and newer/present, sync to products master
  IF p_expiry_date IS NOT NULL OR p_batch_number IS NOT NULL THEN
    UPDATE public.products
    SET 
      expiry_date  = COALESCE(p_expiry_date, expiry_date),
      batch_number = COALESCE(p_batch_number, batch_number),
      updated_at   = now()
    WHERE id = p_product_id AND (owner_id = v_owner_id OR owner_id = auth.uid());
  END IF;

  RETURN v_id;
END;
$$;

-- ─── 4. Updated RPC: product_stock_summary with alerts & expiry ───────────────
DROP FUNCTION IF EXISTS public.product_stock_summary();

CREATE OR REPLACE FUNCTION public.product_stock_summary()
RETURNS TABLE (
  product_id      uuid,
  name_ar         text,
  name_en         text,
  sku             text,
  unit            text,
  category        text,
  price           numeric,
  on_hand         numeric,
  avg_cost        numeric,
  stock_value     numeric,
  min_stock_alert numeric,
  expiry_date     date,
  batch_number    text,
  days_to_expiry  integer,
  alert_status    text,   -- 'out_of_stock' | 'low_stock' | 'expired' | 'expiring_soon' | 'ok'
  is_active       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p.id,
    p.name_ar,
    p.name_en,
    p.sku,
    p.unit,
    p.category,
    p.price,
    COALESCE(SUM(sm.qty), 0) AS on_hand,
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
      -- Out of stock takes precedence
      WHEN COALESCE(SUM(sm.qty), 0) <= 0 THEN 'out_of_stock'
      -- Expired (date has passed and we have stock)
      WHEN p.expiry_date IS NOT NULL AND p.expiry_date < CURRENT_DATE THEN 'expired'
      -- Expiring soon (within next 30 days)
      WHEN p.expiry_date IS NOT NULL AND (p.expiry_date - CURRENT_DATE) <= 30 THEN 'expiring_soon'
      -- Low stock (on hand <= min_stock_alert where min_stock_alert > 0)
      WHEN p.min_stock_alert > 0 AND COALESCE(SUM(sm.qty), 0) <= p.min_stock_alert THEN 'low_stock'
      ELSE 'ok'
    END AS alert_status,
    p.is_active
  FROM public.products p
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = p.id
    AND sm.owner_id = public.get_manager_id()
  WHERE p.owner_id = public.get_manager_id()
    OR p.owner_id = auth.uid()
  GROUP BY 
    p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category, 
    p.price, p.min_stock_alert, p.expiry_date, p.batch_number, p.is_active, p.sort_order
  ORDER BY p.sort_order, p.name_ar;
$$;

-- ─── 5. RPC: stock_alerts_summary (quick counter for dashboards & tabs) ───────
CREATE OR REPLACE FUNCTION public.stock_alerts_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH summary AS (
    SELECT * FROM public.product_stock_summary()
  )
  SELECT jsonb_build_object(
    'out_of_stock_count',   COUNT(*) FILTER (WHERE alert_status = 'out_of_stock'),
    'low_stock_count',       COUNT(*) FILTER (WHERE alert_status = 'low_stock'),
    'expired_count',         COUNT(*) FILTER (WHERE alert_status = 'expired'),
    'expiring_soon_count',   COUNT(*) FILTER (WHERE alert_status = 'expiring_soon'),
    'total_alerts_count',    COUNT(*) FILTER (WHERE alert_status != 'ok')
  )
  FROM summary;
$$;

-- ─── 6. Grant execute permissions ────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.receive_stock(uuid, numeric, numeric, text, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_stock_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_alerts_summary() TO authenticated;
