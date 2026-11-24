-- Migration 0026: Supplier purchases create stock in a single step
-- Adds: supplier_purchase_lines (RLS manager-only), save_supplier_purchase RPC,
--       delete_supplier_purchase RPC. A purchase now records its items and the
--       linked stock movements together; total_amount is derived from the lines.
-- Note: legacy purchases without lines are left untouched. Editing one requires
--       adding lines and recalculates its total_amount.
-- Rollback notes: DROP FUNCTION IF EXISTS public.save_supplier_purchase(jsonb,jsonb);
--                 DROP FUNCTION IF EXISTS public.delete_supplier_purchase(uuid);
--                 DROP TABLE IF EXISTS public.supplier_purchase_lines;
--                 (Stock movements already created are NOT removed by the rollback.)

-- ─── 1. Purchase lines ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.supplier_purchase_lines (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
                              DEFAULT public.current_owner_id(),
  purchase_id  uuid          NOT NULL REFERENCES public.supplier_purchases(id) ON DELETE CASCADE,
  product_id   uuid          NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  qty          numeric(14,4) NOT NULL CHECK (qty > 0),
  unit_cost    numeric(14,2) NOT NULL CHECK (unit_cost >= 0),
  line_total   numeric(14,2) GENERATED ALWAYS AS (qty * unit_cost) STORED,
  expiry_date  date,
  batch_number text,
  created_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supplier_purchase_lines_purchase
  ON public.supplier_purchase_lines (owner_id, purchase_id);
CREATE INDEX IF NOT EXISTS idx_supplier_purchase_lines_product
  ON public.supplier_purchase_lines (product_id);

ALTER TABLE public.supplier_purchase_lines ENABLE ROW LEVEL SECURITY;

-- No direct DML for clients: all writes go through the security-definer RPCs.
DROP POLICY IF EXISTS "manager_read_supplier_purchase_lines" ON public.supplier_purchase_lines;
CREATE POLICY "manager_read_supplier_purchase_lines" ON public.supplier_purchase_lines
  FOR SELECT
  USING (public.is_manager() AND owner_id = public.current_owner_id());

GRANT SELECT ON public.supplier_purchase_lines TO authenticated;

-- ─── 2. Save purchase (header + lines + stock-in) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.save_supplier_purchase(
  p_purchase jsonb,
  p_lines    jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id      uuid := public.get_manager_id();
  v_purchase_id   uuid;
  v_supplier_id   uuid;
  v_purchase_date date;
  v_payment_type  text;
  v_invoice_no    text;
  v_notes         text;
  v_line          jsonb;
  v_movement      record;
  v_product_id    uuid;
  v_qty           numeric(14,4);
  v_unit_cost     numeric(14,2);
  v_available     numeric(14,4);
  v_product_name  text;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'يجب إضافة صنف واحد على الأقل لفاتورة المشتريات';
  END IF;

  v_supplier_id   := NULLIF(p_purchase->>'supplier_id', '')::uuid;
  v_purchase_date := COALESCE(NULLIF(p_purchase->>'purchase_date', '')::date, CURRENT_DATE);
  v_payment_type  := COALESCE(NULLIF(p_purchase->>'payment_type', ''), 'credit');
  v_invoice_no    := NULLIF(p_purchase->>'invoice_no', '');
  v_notes         := NULLIF(p_purchase->>'notes', '');

  IF v_supplier_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.suppliers
    WHERE id = v_supplier_id AND (owner_id = v_owner_id OR owner_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'المورد غير موجود';
  END IF;
  IF v_payment_type NOT IN ('cash', 'credit') THEN
    RAISE EXCEPTION 'نوع الدفع غير صالح';
  END IF;

  IF p_purchase->>'id' IS NOT NULL AND p_purchase->>'id' <> '' THEN
    v_purchase_id := (p_purchase->>'id')::uuid;

    UPDATE public.supplier_purchases
    SET supplier_id   = v_supplier_id,
        purchase_date = v_purchase_date,
        invoice_no    = v_invoice_no,
        payment_type  = v_payment_type,
        notes         = v_notes,
        total_amount  = 0
    WHERE id = v_purchase_id AND owner_id = v_owner_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'فاتورة المشتريات غير موجودة';
    END IF;

    -- Reverse the stock-in movements of the previous version of this invoice.
    FOR v_movement IN
      SELECT id, product_id, qty, unit_cost
      FROM public.stock_movements
      WHERE reference_type = 'supplier_purchase'
        AND reference_id = v_purchase_id
        AND owner_id = v_owner_id
        AND movement_type = 'in'
    LOOP
      v_available := public.product_on_hand(v_owner_id, v_movement.product_id);
      IF v_available < v_movement.qty THEN
        SELECT name_ar INTO v_product_name FROM public.products WHERE id = v_movement.product_id;
        RAISE EXCEPTION 'لا يمكن تعديل الفاتورة: الكمية المتاحة من "%" (%) أقل من كمية الفاتورة (%)',
          COALESCE(v_product_name, v_movement.product_id::text), v_available, v_movement.qty;
      END IF;

      INSERT INTO public.stock_movements
        (owner_id, product_id, movement_type, qty, unit_cost, avg_cost_snapshot,
         reference_type, reference_id, notes, created_by)
      VALUES
        (v_owner_id, v_movement.product_id, 'adjustment', -v_movement.qty,
         v_movement.unit_cost, v_movement.unit_cost, 'reversal', v_movement.id,
         'تصحيح تعديل فاتورة مشتريات ' || v_purchase_id::text, auth.uid());
    END LOOP;

    DELETE FROM public.supplier_purchase_lines
    WHERE purchase_id = v_purchase_id AND owner_id = v_owner_id;
  ELSE
    INSERT INTO public.supplier_purchases
      (owner_id, supplier_id, purchase_date, invoice_no, payment_type, total_amount, notes, created_by)
    VALUES
      (v_owner_id, v_supplier_id, v_purchase_date, v_invoice_no, v_payment_type, 0, v_notes, auth.uid())
    RETURNING id INTO v_purchase_id;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_product_id := NULLIF(v_line->>'product_id', '')::uuid;
    v_qty        := (v_line->>'qty')::numeric;
    v_unit_cost  := COALESCE((v_line->>'unit_cost')::numeric, 0);

    IF v_product_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = v_product_id AND (owner_id = v_owner_id OR owner_id = auth.uid())
    ) THEN
      RAISE EXCEPTION 'أحد المنتجات المختارة غير موجود';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من صفر';
    END IF;
    IF v_unit_cost < 0 THEN
      RAISE EXCEPTION 'تكلفة الوحدة لا يمكن أن تكون سالبة';
    END IF;

    INSERT INTO public.supplier_purchase_lines
      (owner_id, purchase_id, product_id, qty, unit_cost, expiry_date, batch_number)
    VALUES
      (v_owner_id, v_purchase_id, v_product_id, v_qty, v_unit_cost,
       NULLIF(v_line->>'expiry_date', '')::date, NULLIF(v_line->>'batch_number', ''));

    INSERT INTO public.stock_movements
      (owner_id, product_id, movement_type, qty, unit_cost, reference_type,
       reference_id, notes, expiry_date, batch_number, created_by)
    VALUES
      (v_owner_id, v_product_id, 'in', v_qty, v_unit_cost, 'supplier_purchase',
       v_purchase_id, 'فاتورة مشتريات ' || COALESCE(v_invoice_no, v_purchase_id::text),
       NULLIF(v_line->>'expiry_date', '')::date, NULLIF(v_line->>'batch_number', ''), auth.uid());
  END LOOP;

  UPDATE public.supplier_purchases
  SET total_amount = COALESCE((
    SELECT SUM(line_total)
    FROM public.supplier_purchase_lines
    WHERE purchase_id = v_purchase_id AND owner_id = v_owner_id
  ), 0)
  WHERE id = v_purchase_id AND owner_id = v_owner_id;

  RETURN v_purchase_id;
END;
$$;

-- ─── 3. Delete purchase (reverse linked stock-in) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_supplier_purchase(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner_id     uuid := public.get_manager_id();
  v_movement     record;
  v_available    numeric(14,4);
  v_product_name text;
BEGIN
  IF NOT public.is_manager() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR v_movement IN
    SELECT id, product_id, qty, unit_cost
    FROM public.stock_movements
    WHERE reference_type = 'supplier_purchase'
      AND reference_id = p_id
      AND owner_id = v_owner_id
      AND movement_type = 'in'
  LOOP
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

GRANT EXECUTE ON FUNCTION public.save_supplier_purchase(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier_purchase(uuid) TO authenticated;
