-- Migration 0030: Single-product consumption & customer sales analytics
-- Adds three SECURITY INVOKER RPCs for one product over a date range. Row visibility
-- is inherited entirely from the existing RLS policies on invoice_lines,
-- cash_invoices, credit_invoices, customers and reps: managers see their own
-- tenant, sales reps only see invoices/customers assigned to them.
-- Additive and idempotent: CREATE OR REPLACE + REVOKE/GRANT. No data is rewritten.
-- Rollback notes:
--   DROP FUNCTION IF EXISTS public.product_consumption_summary(uuid, date, date);
--   DROP FUNCTION IF EXISTS public.product_customer_breakdown(uuid, date, date);
--   DROP FUNCTION IF EXISTS public.product_sales_history(uuid, date, date);
--   (Optionally restore EXECUTE to anon/PUBLIC if this feature is fully reverted.)

-- ─── 1. Summary KPIs for one product ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.product_consumption_summary(
  p_product_id uuid,
  p_from       date,
  p_to         date
)
RETURNS TABLE (
  total_qty       numeric(14,4),
  total_revenue   numeric(14,2),
  invoice_count   bigint,
  unique_customers bigint,
  avg_unit_price  numeric(14,2)
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH lines AS (
    SELECT
      inv.invoice_id,
      inv.customer_id,
      il.qty,
      il.line_total
    FROM public.invoice_lines il
    JOIN (
      SELECT id AS invoice_id, 'cash'::text AS invoice_type, date AS tx_date, customer_id
      FROM public.cash_invoices
      UNION ALL
      SELECT id AS invoice_id, 'credit'::text AS invoice_type, date AS tx_date, customer_id
      FROM public.credit_invoices
    ) inv
      ON il.invoice_type = inv.invoice_type
     AND il.invoice_id = inv.invoice_id
    -- Joining customers applies its RLS policy as well; a NULL customer_id is
    -- tolerated (older invoices) but is not counted as a unique customer.
    LEFT JOIN public.customers c ON c.id = inv.customer_id
    WHERE il.product_id = p_product_id
      AND inv.tx_date BETWEEN COALESCE(p_from, '1900-01-01'::date)
                          AND COALESCE(p_to, current_date)
  )
  SELECT
    COALESCE(SUM(qty), 0)::numeric(14,4)                                     AS total_qty,
    COALESCE(SUM(line_total), 0)::numeric(14,2)                              AS total_revenue,
    COUNT(DISTINCT invoice_id)::bigint                                       AS invoice_count,
    COUNT(DISTINCT customer_id)::bigint                                      AS unique_customers,
    COALESCE(
      CASE WHEN SUM(qty) > 0 THEN ROUND(SUM(line_total) / SUM(qty), 2) ELSE 0 END,
      0
    )::numeric(14,2)                                                         AS avg_unit_price
  FROM lines;
$$;

-- ─── 2. Customer breakdown for one product ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.product_customer_breakdown(
  p_product_id uuid,
  p_from       date,
  p_to         date
)
RETURNS TABLE (
  customer_id        uuid,
  customer_name      text,
  customer_phone     text,
  rep_name           text,
  order_count        bigint,
  total_qty          numeric(14,4),
  total_revenue      numeric(14,2),
  share_pct          numeric(5,2),
  last_purchase_date date
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH lines AS (
    SELECT
      inv.invoice_id,
      inv.tx_date,
      c.id           AS customer_id,
      c.name         AS customer_name,
      c.phone        AS customer_phone,
      COALESCE(r.name, c.representative_name, '') AS rep_name,
      il.qty,
      il.line_total
    FROM public.invoice_lines il
    JOIN (
      SELECT id AS invoice_id, 'cash'::text AS invoice_type, date AS tx_date,
             customer_id, rep_id
      FROM public.cash_invoices
      UNION ALL
      SELECT id AS invoice_id, 'credit'::text AS invoice_type, date AS tx_date,
             customer_id, rep_id
      FROM public.credit_invoices
    ) inv
      ON il.invoice_type = inv.invoice_type
     AND il.invoice_id = inv.invoice_id
    LEFT JOIN public.customers c ON c.id = inv.customer_id
    LEFT JOIN public.reps r ON r.id = inv.rep_id
    WHERE il.product_id = p_product_id
      AND inv.tx_date BETWEEN COALESCE(p_from, '1900-01-01'::date)
                          AND COALESCE(p_to, current_date)
  ),
  grouped AS (
    SELECT
      customer_id,
      customer_name,
      customer_phone,
      rep_name,
      COUNT(DISTINCT invoice_id) AS order_count,
      SUM(qty)                   AS total_qty,
      SUM(line_total)            AS total_revenue,
      MAX(tx_date)               AS last_purchase_date
    FROM lines
    GROUP BY customer_id, customer_name, customer_phone, rep_name
  )
  SELECT
    customer_id::uuid,
    COALESCE(customer_name, '—')::text            AS customer_name,
    customer_phone::text                          AS customer_phone,
    rep_name::text                                AS rep_name,
    order_count::bigint,
    total_qty::numeric(14,4),
    total_revenue::numeric(14,2),
    COALESCE(
      ROUND((total_qty / NULLIF(SUM(total_qty) OVER (), 0)) * 100, 2),
      0
    )::numeric(5,2)                               AS share_pct,
    last_purchase_date::date
  FROM grouped
  ORDER BY total_qty DESC, customer_name ASC NULLS LAST;
$$;

-- ─── 3. Chronological line-item history for one product ──────────────────────
CREATE OR REPLACE FUNCTION public.product_sales_history(
  p_product_id uuid,
  p_from       date,
  p_to         date
)
RETURNS TABLE (
  invoice_id    uuid,
  invoice_no    text,
  invoice_type  text,
  tx_date       date,
  customer_id   uuid,
  customer_name text,
  rep_name      text,
  qty           numeric(14,4),
  unit_price    numeric(14,2),
  line_total    numeric(14,2)
)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    inv.invoice_id::uuid,
    inv.invoice_no::text,
    inv.invoice_type::text,
    inv.tx_date::date,
    c.id::uuid                                    AS customer_id,
    COALESCE(c.name, '—')::text                   AS customer_name,
    COALESCE(r.name, c.representative_name, '')::text AS rep_name,
    il.qty::numeric(14,4),
    il.unit_price::numeric(14,2),
    il.line_total::numeric(14,2)
  FROM public.invoice_lines il
  JOIN (
    SELECT id AS invoice_id, invoice_no, 'cash'::text AS invoice_type,
           date AS tx_date, customer_id, rep_id
    FROM public.cash_invoices
    UNION ALL
    SELECT id AS invoice_id, invoice_no, 'credit'::text AS invoice_type,
           date AS tx_date, customer_id, rep_id
    FROM public.credit_invoices
  ) inv
    ON il.invoice_type = inv.invoice_type
   AND il.invoice_id = inv.invoice_id
  LEFT JOIN public.customers c ON c.id = inv.customer_id
  LEFT JOIN public.reps r ON r.id = inv.rep_id
  WHERE il.product_id = p_product_id
    AND inv.tx_date BETWEEN COALESCE(p_from, '1900-01-01'::date)
                        AND COALESCE(p_to, current_date)
  ORDER BY inv.tx_date DESC, il.created_at DESC;
$$;

-- ─── 4. Privileges: authenticated only (never anon / PUBLIC) ─────────────────
REVOKE EXECUTE ON FUNCTION public.product_consumption_summary(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_consumption_summary(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.product_customer_breakdown(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_customer_breakdown(uuid, date, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.product_sales_history(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.product_sales_history(uuid, date, date) FROM anon;

GRANT EXECUTE ON FUNCTION public.product_consumption_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_customer_breakdown(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_sales_history(uuid, date, date) TO authenticated;
