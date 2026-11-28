-- 0040_purchase_returns_hardening.sql
-- Hardening for supplier purchase returns (follow-up to 0039).
--
-- Fixes:
--   1) save_supplier_return()/delete_supplier_return() no longer reverse a stock
--      movement that already has a 'reversal' row. Repeated edits and
--      delete-after-edit previously reversed the same 'out' rows more than once
--      and inflated on-hand stock.
--   2) Both RPCs lock every product touched by the old and new versions before
--      changing stock, with a consistent header-then-products lock order.
--   3) v_supplier_transactions is restored to security_invoker = true and
--      supplier_statement() is restricted to managers and their own tenant.
--   4) Direct INSERT/UPDATE/DELETE on the return tables is revoked from
--      authenticated; writes go through the manager-checked RPCs.
--
-- Additive and idempotent. No applied migration or existing data is rewritten.
--
-- Rollback notes:
--   - Recreate the 0039 versions of save_supplier_return/delete_supplier_return
--     and supplier_statement from supabase/migrations/0039_purchase_returns.sql.
--   - ALTER VIEW public.v_supplier_transactions RESET (security_invoker);
--   - GRANT INSERT, UPDATE, DELETE ON public.supplier_returns,
--     public.supplier_return_lines TO authenticated; (only if default grants are wanted)
--   - Stock rows already written are not removed by this rollback.

-- ─── 1. Save return: skip already-reversed movements, lock all products ───────
CREATE OR REPLACE FUNCTION public.save_supplier_return(
  p_return jsonb,
  p_lines  jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id         uuid := public.get_manager_id();
  v_return_id        uuid;
  v_supplier_id      uuid;
  v_purchase_id      uuid;
  v_return_date      date;
  v_settlement       text;
  v_notes            text;
  v_line             jsonb;
  v_product_id       uuid;
  v_qty              numeric(14,4);
  v_unit_cost        numeric(14,2);
  v_available        numeric(14,4);
  v_purchased_qty    numeric(14,4);
  v_already_returned numeric(14,4);
  v_avg_cost         numeric(14,2);
  v_product_name     text;
  v_total_amount     numeric(14,2) := 0;
  v_pids             uuid[];
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'يجب إضافة صنف واحد على الأقل لمرتجع المشتريات';
  END IF;

  v_supplier_id  := NULLIF(p_return->>'supplier_id', '')::uuid;
  v_purchase_id  := NULLIF(p_return->>'purchase_id', '')::uuid;
  v_return_date  := COALESCE(NULLIF(p_return->>'return_date', '')::date, current_date);
  v_settlement   := COALESCE(NULLIF(p_return->>'settlement_method', ''), 'reduce_payable');
  v_notes        := NULLIF(p_return->>'notes', '');
  v_return_id    := NULLIF(p_return->>'id', '')::uuid;

  IF v_supplier_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = v_supplier_id AND owner_id = v_owner_id
  ) THEN
    RAISE EXCEPTION 'المورد غير موجود';
  END IF;
  IF v_settlement NOT IN ('reduce_payable', 'cash_refund') THEN
    RAISE EXCEPTION 'طريقة معالجة المرتجع غير صالحة';
  END IF;
  IF v_purchase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.supplier_purchases
    WHERE id = v_purchase_id AND owner_id = v_owner_id AND supplier_id = v_supplier_id
  ) THEN
    RAISE EXCEPTION 'فاتورة المشتريات المحددة غير موجودة لهذا المورد';
  END IF;

  -- Lock the header first (same order as delete_supplier_return), then every
  -- product that either version of the return can change.
  IF v_return_id IS NOT NULL THEN
    PERFORM 1 FROM public.supplier_returns
    WHERE id = v_return_id AND owner_id = v_owner_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'مرتجع المشتريات غير موجود';
    END IF;
  END IF;

  SELECT array_agg(DISTINCT product_id)
  INTO v_pids
  FROM (
    SELECT (l->>'product_id')::uuid AS product_id
    FROM jsonb_array_elements(p_lines) l
    WHERE (l->>'product_id') IS NOT NULL AND (l->>'product_id') <> ''
    UNION
    SELECT srl.product_id
    FROM public.supplier_return_lines srl
    WHERE srl.return_id = v_return_id AND srl.owner_id = v_owner_id
  ) touched_products
  WHERE product_id IS NOT NULL;

  IF v_pids IS NOT NULL AND array_length(v_pids, 1) > 0 THEN
    PERFORM id FROM public.products
    WHERE id = ANY(v_pids) AND owner_id = v_owner_id
    ORDER BY id FOR UPDATE;
  END IF;

  IF v_return_id IS NOT NULL THEN
    -- Put back only the stock movements that have not already been reversed.
    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    SELECT
      sm.owner_id, sm.product_id, 'adjustment', -1 * sm.qty,
      sm.unit_cost, sm.avg_cost_snapshot,
      'reversal', sm.id,
      'تعديل مرتجع مشتريات ' || v_return_id::text,
      auth.uid()
    FROM public.stock_movements sm
    WHERE sm.reference_type = 'supplier_return'
      AND sm.reference_id = v_return_id
      AND sm.owner_id = v_owner_id
      AND sm.movement_type = 'out'
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements rev
        WHERE rev.reference_type = 'reversal'
          AND rev.reference_id = sm.id
      );

    DELETE FROM public.supplier_return_lines
    WHERE return_id = v_return_id AND owner_id = v_owner_id;

    UPDATE public.supplier_returns
    SET supplier_id       = v_supplier_id,
        purchase_id       = v_purchase_id,
        return_date       = v_return_date,
        settlement_method = v_settlement,
        notes             = v_notes,
        total_amount      = 0
    WHERE id = v_return_id AND owner_id = v_owner_id;
  ELSE
    INSERT INTO public.supplier_returns
      (owner_id, supplier_id, purchase_id, return_date, settlement_method,
       total_amount, notes, created_by)
    VALUES
      (v_owner_id, v_supplier_id, v_purchase_id, v_return_date, v_settlement,
       0, v_notes, auth.uid())
    RETURNING id INTO v_return_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_cost  := COALESCE((v_line->>'unit_cost')::numeric, 0);

    IF v_product_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND owner_id = v_owner_id
    ) THEN
      RAISE EXCEPTION 'أحد المنتجات المختارة غير موجود';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;
    IF v_unit_cost < 0 THEN
      RAISE EXCEPTION 'تكلفة الوحدة لا يمكن أن تكون سالبة';
    END IF;

    v_available := public.product_on_hand(v_owner_id, v_product_id);
    IF v_available < v_qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
      RAISE EXCEPTION 'لا يمكن إرجاع "%": الكمية المتاحة في المخزون (%) أقل من الكمية المطلوبة (%)',
        COALESCE(v_product_name, v_product_id::text), v_available, v_qty;
    END IF;

    -- If linked to a purchase, never return more than that invoice actually received.
    IF v_purchase_id IS NOT NULL THEN
      SELECT COALESCE(SUM(qty), 0) INTO v_purchased_qty
      FROM public.supplier_purchase_lines
      WHERE owner_id = v_owner_id AND purchase_id = v_purchase_id AND product_id = v_product_id;

      IF v_purchased_qty > 0 THEN
        SELECT COALESCE(SUM(srl.qty), 0) INTO v_already_returned
        FROM public.supplier_return_lines srl
        JOIN public.supplier_returns sr ON sr.id = srl.return_id
        WHERE sr.owner_id = v_owner_id
          AND sr.purchase_id = v_purchase_id
          AND srl.product_id = v_product_id
          AND sr.id <> v_return_id;

        IF v_already_returned + v_qty > v_purchased_qty THEN
          SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_product_id;
          RAISE EXCEPTION 'لا يمكن إرجاع "%": الكمية المرتجعة تتجاوز كمية فاتورة المشتريات (%)',
            COALESCE(v_product_name, v_product_id::text), v_purchased_qty;
        END IF;
      END IF;
    END IF;

    v_avg_cost := public.product_avg_cost(v_owner_id, v_product_id);

    INSERT INTO public.supplier_return_lines
      (owner_id, return_id, product_id, qty, unit_cost, avg_cost_snapshot)
    VALUES
      (v_owner_id, v_return_id, v_product_id, v_qty, v_unit_cost, v_avg_cost);

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    VALUES
      (v_owner_id, v_product_id, 'out', -v_qty, v_unit_cost, v_avg_cost,
       'supplier_return', v_return_id,
       'مرتجع مشتريات ' || COALESCE(v_notes, v_return_id::text), auth.uid());

    v_total_amount := v_total_amount + (v_qty * v_unit_cost);
  END LOOP;

  UPDATE public.supplier_returns
  SET total_amount = v_total_amount
  WHERE id = v_return_id AND owner_id = v_owner_id;

  RETURN v_return_id;
END;
$$;

-- ─── 2. Delete return: skip already-reversed movements, lock all products ────
CREATE OR REPLACE FUNCTION public.delete_supplier_return(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid := public.get_manager_id();
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM 1 FROM public.supplier_returns
  WHERE id = p_id AND owner_id = v_owner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'مرتجع المشتريات غير موجود';
  END IF;

  PERFORM id FROM public.products
  WHERE id IN (
    SELECT srl.product_id FROM public.supplier_return_lines srl
    WHERE srl.return_id = p_id AND srl.owner_id = v_owner_id
  )
  AND owner_id = v_owner_id
  ORDER BY id FOR UPDATE;

  -- 'out' rows are negative, so -1 * qty adds the goods back to stock.
  INSERT INTO public.stock_movements
    (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
     reference_type, reference_id, notes, created_by)
  SELECT
    sm.owner_id, sm.product_id, 'adjustment', -1 * sm.qty,
    sm.unit_cost, sm.avg_cost_snapshot,
    'reversal', sm.id,
    'حذف مرتجع مشتريات ' || p_id::text,
    auth.uid()
  FROM public.stock_movements sm
  WHERE sm.reference_type = 'supplier_return'
    AND sm.reference_id = p_id
    AND sm.owner_id = v_owner_id
    AND sm.movement_type = 'out'
    AND NOT EXISTS (
      SELECT 1 FROM public.stock_movements rev
      WHERE rev.reference_type = 'reversal'
        AND rev.reference_id = sm.id
    );

  DELETE FROM public.supplier_return_lines
  WHERE return_id = p_id AND owner_id = v_owner_id;

  DELETE FROM public.supplier_returns
  WHERE id = p_id AND owner_id = v_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_supplier_return(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_supplier_return(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_return(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier_return(uuid) TO authenticated;

-- ─── 3. Restore view isolation and harden the supplier statement ─────────────
ALTER VIEW public.v_supplier_transactions SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.supplier_statement(
  p_supplier_id uuid,
  p_from date DEFAULT '2000-01-01',
  p_to date DEFAULT '2099-12-31'
)
RETURNS TABLE(
  row_no bigint,
  tx_date date,
  tx_type text,
  ref text,
  description text,
  debit numeric,
  credit numeric,
  balance numeric,
  reference_id uuid,
  reference_type text
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp
AS $$
  WITH opening AS (
    SELECT COALESCE(s.opening_balance, 0)
         + COALESCE(SUM(CASE WHEN t.kind = 'purchase' THEN t.amount ELSE -t.amount END), 0) AS bal
    FROM public.suppliers s
    LEFT JOIN public.v_supplier_transactions t
      ON t.supplier_id = s.id AND t.tx_date < p_from
    WHERE s.id = p_supplier_id
      AND s.owner_id = public.get_manager_id()
      AND public.is_manager()
    GROUP BY s.id, s.opening_balance
  ),
  period AS (
    SELECT
      t.id,
      t.tx_date,
      t.kind,
      t.ref,
      t.description,
      t.created_at,
      CASE WHEN t.kind IN ('payment', 'return') THEN t.amount ELSE 0 END AS debit,
      CASE WHEN t.kind = 'purchase' THEN t.amount ELSE 0 END AS credit,
      t.reference_id,
      t.reference_type
    FROM public.v_supplier_transactions t
    JOIN public.suppliers s ON s.id = t.supplier_id
    WHERE t.supplier_id = p_supplier_id
      AND s.owner_id = public.get_manager_id()
      AND public.is_manager()
      AND t.tx_date BETWEEN p_from AND p_to
  )
  SELECT
    0::bigint AS row_no,
    p_from AS tx_date,
    'opening'::text AS tx_type,
    NULL::text AS ref,
    'رصيد أول المدة'::text AS description,
    NULL::numeric AS debit,
    NULL::numeric AS credit,
    COALESCE((SELECT bal FROM opening), 0) AS balance,
    NULL::uuid AS reference_id,
    NULL::text AS reference_type
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
      + SUM(credit - debit) OVER (ORDER BY tx_date, created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS balance,
    reference_id,
    reference_type
  FROM period
  ORDER BY row_no;
$$;

REVOKE ALL ON FUNCTION public.supplier_statement(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supplier_statement(uuid, date, date) TO authenticated;

-- ─── 4. Defense in depth: no direct client writes to return tables ───────────
REVOKE ALL ON public.supplier_returns FROM anon;
REVOKE ALL ON public.supplier_return_lines FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.supplier_returns FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.supplier_return_lines FROM authenticated;
GRANT SELECT ON public.supplier_returns TO authenticated;
GRANT SELECT ON public.supplier_return_lines TO authenticated;
