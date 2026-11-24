-- Migration 0029: Make supplier purchase deletion idempotent
-- Mirrors 0027's edit safety: capture + archive the current stock-in rows before
-- reversing them, so a retried/stale delete cannot reverse stock twice.
-- Idempotent: CREATE OR REPLACE.
-- Rollback notes: re-create the 0027 delete_supplier_purchase definition;
-- already-archived movement rows are not reverted.

CREATE OR REPLACE FUNCTION public.delete_supplier_purchase(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id     uuid := public.get_manager_id();
  v_movement_ids uuid[];
  v_movement_id  uuid;
  v_movement     public.stock_movements%ROWTYPE;
  v_available    numeric(14,4);
  v_product_name text;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Only the current version's stock-in rows qualify. Rows archived by a
  -- previous edit (or a previous delete call) are intentionally excluded.
  SELECT array_agg(id)
  INTO v_movement_ids
  FROM public.stock_movements
  WHERE reference_type = 'supplier_purchase'
    AND reference_id = p_id
    AND owner_id = v_owner_id
    AND movement_type = 'in';

  IF v_movement_ids IS NULL OR array_length(v_movement_ids, 1) IS NULL THEN
    -- Nothing to reverse (already deleted, or a legacy purchase with no
    -- linked movements). Still allow the header/line cleanup below.
    DELETE FROM public.supplier_purchase_lines
    WHERE purchase_id = p_id AND owner_id = v_owner_id;

    DELETE FROM public.supplier_purchases
    WHERE id = p_id AND owner_id = v_owner_id;
    RETURN;
  END IF;

  UPDATE public.stock_movements
  SET reference_type = 'supplier_purchase_history'
  WHERE id = ANY (v_movement_ids);

  FOREACH v_movement_id IN ARRAY v_movement_ids
  LOOP
    SELECT * INTO v_movement
    FROM public.stock_movements
    WHERE id = v_movement_id;

    v_available := public.product_on_hand(v_owner_id, v_movement.product_id);
    IF v_available < v_movement.qty THEN
      SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_movement.product_id;
      RAISE EXCEPTION 'لا يمكن حذف الفاتورة: الكمية المتاحة من "%" (%) أقل من كمية الفاتورة (%)',
        COALESCE(v_product_name, v_movement.product_id::text), v_available, v_movement.qty;
    END IF;

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
       reference_type, reference_id, notes, created_by)
    VALUES
      (v_owner_id, v_movement.product_id, 'adjustment', -v_movement.qty,
       v_movement.unit_cost, v_movement.unit_cost, 'reversal', v_movement.id,
       'حذف فاتورة مشتريات ' || p_id::text, auth.uid());
  END LOOP;

  DELETE FROM public.supplier_purchase_lines
  WHERE purchase_id = p_id AND owner_id = v_owner_id;

  DELETE FROM public.supplier_purchases
  WHERE id = p_id AND owner_id = v_owner_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_supplier_purchase(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_supplier_purchase(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_supplier_purchase(uuid) TO authenticated;
