-- 0023_sales_return_edit_delete.sql
-- Add edit/delete support for sales returns.
--
-- Adds:
--   1) delete_sales_return(p_id uuid): reverses stock movements and deletes return.
--   2) save_sales_return(p_return jsonb, p_lines jsonb): create/update with stock reversal+reapply.
--
-- Notes:
-- - Additive/idempotent (CREATE OR REPLACE). Never edit applied migrations.
-- - Uses search_path = public, pg_temp for SECURITY DEFINER hardening.
-- - Damaged return movements (sales_return_spoilage, qty 0) have no stock delta; delete/update
--   removes/replaces them without changing on-hand stock.
--
-- Rollback notes:
-- - DROP FUNCTION IF EXISTS public.delete_sales_return(uuid);
-- - DROP FUNCTION IF EXISTS public.save_sales_return(jsonb, jsonb);
-- - Revoke grants if needed. Data changes from delete/update are not automatically reversible.

-- ─── 1. Delete sales return (reverse stock) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_sales_return(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Reverse salable stock movements (in -> adjustment -qty)
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

  -- Audit reversal for damaged lines (no stock delta)
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
  WHERE id = p_id AND owner_id = v_owner_id;
END;
$$;

-- ─── 2. Save sales return (create/update with stock reversal+reapply) ────────
CREATE OR REPLACE FUNCTION public.save_sales_return(
  p_return jsonb,
  p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Lock products referenced by incoming lines
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

    -- Reverse previous salable movements
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

    -- Audit reversal for previous damaged movements
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
      owner_id,
      customer_id,
      rep_id,
      invoice_type,
      invoice_id,
      return_date,
      refund_method,
      total_amount,
      notes
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

  -- Insert lines and stock movements
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := (v_line->>'product_id')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;
    v_condition  := COALESCE(v_line->>'condition', 'salable');
    v_avg_cost   := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.sales_return_lines (
      return_id,
      product_id,
      qty,
      unit_price,
      avg_cost_snapshot,
      condition
    ) VALUES (
      v_return_id,
      v_product_id,
      v_qty,
      v_unit_price,
      v_avg_cost,
      v_condition
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
$$;

GRANT EXECUTE ON FUNCTION public.delete_sales_return(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_sales_return(jsonb, jsonb) TO authenticated;
