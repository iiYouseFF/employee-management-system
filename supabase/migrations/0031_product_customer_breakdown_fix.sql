-- Migration 0031: Stable customer grouping in product_customer_breakdown
-- 0030 grouped by customer_id + name + phone + rep_name, so one customer with
-- invoices recorded under different reps appeared as several rows with split
-- share_pct, while product_consumption_summary counted them once.
-- This migration replaces ONLY that function: customers are grouped by a
-- stable key (NULL ids share a synthetic key), and rep_name is taken from the
-- customer's most recent line. Additive and idempotent: CREATE OR REPLACE.
-- No data is rewritten. RLS is still inherited via SECURITY INVOKER.
-- Rollback notes: CREATE OR REPLACE the 0030 definition of
--   public.product_customer_breakdown(uuid, date, date) from
--   supabase/migrations/0030_product_consumption_analytics.sql.

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
      il.created_at AS line_created_at,
      COALESCE(c.id, '00000000-0000-0000-0000-000000000000'::uuid) AS customer_key,
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
  latest_rep AS (
    SELECT DISTINCT ON (customer_key)
      customer_key,
      rep_name
    FROM lines
    ORDER BY customer_key, tx_date DESC, line_created_at DESC
  ),
  grouped AS (
    SELECT
      customer_key,
      MIN(customer_id::text)::uuid AS customer_id,
      MAX(customer_name)    AS customer_name,
      MAX(customer_phone)   AS customer_phone,
      COUNT(DISTINCT invoice_id) AS order_count,
      SUM(qty)              AS total_qty,
      SUM(line_total)       AS total_revenue,
      MAX(tx_date)          AS last_purchase_date
    FROM lines
    GROUP BY customer_key
  )
  SELECT
    g.customer_id::uuid,
    COALESCE(g.customer_name, '—')::text          AS customer_name,
    g.customer_phone::text                        AS customer_phone,
    COALESCE(lr.rep_name, '')::text               AS rep_name,
    g.order_count::bigint,
    g.total_qty::numeric(14,4),
    g.total_revenue::numeric(14,2),
    COALESCE(
      ROUND((g.total_qty / NULLIF(SUM(g.total_qty) OVER (), 0)) * 100, 2),
      0
    )::numeric(5,2)                               AS share_pct,
    g.last_purchase_date::date
  FROM grouped g
  LEFT JOIN latest_rep lr ON lr.customer_key = g.customer_key
  ORDER BY g.total_qty DESC, g.customer_name ASC NULLS LAST;
$$;
