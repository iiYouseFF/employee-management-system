-- 0036_legacy_stock_rpc_guard.sql
-- Follow-up to 0034/0035: the legacy stock read RPCs created by 0018 and
-- amended by 0020/0021 were SECURITY DEFINER, granted to anon/PUBLIC/
-- authenticated, and had no rep permission guard. A sales rep with
-- view_inventory = false could call them directly and read tenant-wide
-- on_hand / avg_cost / stock_value.
--
-- What it changes:
--   1. Recreates product_stock_summary() and product_stock_summary_v2() with
--      the signatures/result columns currently live on the remote project
--      (verified via pg_get_function_result), adding
--      `NOT is_sales_rep() OR rep_has_permission('view_inventory')` and
--      `search_path = public, pg_temp`.
--   2. Revokes anon/PUBLIC EXECUTE; grants only authenticated + service_role.
--
-- NOTE: the live legacy signatures are older than the local 0020/0021 text;
-- CREATE OR REPLACE cannot change a function's OUT row type, so this migration
-- deliberately preserves the live shapes rather than the local file text.
--
-- Additive and idempotent: CREATE OR REPLACE FUNCTION + ACL changes only.
-- No applied migration is edited, no table data is rewritten, and signatures
-- and result columns stay identical for existing callers (including
-- stock_valuation(), which calls product_stock_summary() internally).
--
-- Rollback (manual):
--   - Restore the pre-0036 bodies of both functions from pg_get_functiondef.
--   - `ALTER FUNCTION ... SET search_path = public` on both.
--   - Re-grant EXECUTE to anon/PUBLIC/authenticated as before.

BEGIN;

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
  is_active       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
    p.is_active
  FROM public.products p
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = p.id
    AND sm.owner_id = public.get_manager_id()
  WHERE (p.owner_id = public.get_manager_id() OR p.owner_id = auth.uid())
    AND (NOT public.is_sales_rep() OR public.rep_has_permission('view_inventory'))
  GROUP BY p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category, p.price, p.is_active
  ORDER BY p.sort_order, p.name_ar;
$function$;

CREATE OR REPLACE FUNCTION public.product_stock_summary_v2()
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
  alert_status    text,
  is_active       boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
      WHEN COALESCE(SUM(sm.qty), 0) <= 0 THEN 'out_of_stock'
      WHEN p.expiry_date IS NOT NULL AND p.expiry_date < CURRENT_DATE THEN 'expired'
      WHEN p.expiry_date IS NOT NULL AND (p.expiry_date - CURRENT_DATE) <= 30 THEN 'expiring_soon'
      WHEN p.min_stock_alert > 0 AND COALESCE(SUM(sm.qty), 0) <= p.min_stock_alert THEN 'low_stock'
      ELSE 'ok'
    END AS alert_status,
    p.is_active
  FROM public.products p
  LEFT JOIN public.stock_movements sm
    ON sm.product_id = p.id
    AND sm.owner_id = public.get_manager_id()
  WHERE (p.owner_id = public.get_manager_id() OR p.owner_id = auth.uid())
    AND (NOT public.is_sales_rep() OR public.rep_has_permission('view_inventory'))
  GROUP BY
    p.id, p.name_ar, p.name_en, p.sku, p.unit, p.category,
    p.price, p.min_stock_alert, p.expiry_date, p.batch_number, p.is_active, p.sort_order
  ORDER BY p.sort_order, p.name_ar;
$function$;

REVOKE ALL ON FUNCTION public.product_stock_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.product_stock_summary_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.product_stock_summary() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_stock_summary_v2() TO authenticated, service_role;

COMMIT;
