-- Migration 0019: Audit Logs System
-- Tracks all INSERT, UPDATE, DELETE actions across core business tables
-- Tables tracked:
--   customers, reps, cash_invoices, credit_invoices, payments,
--   suppliers, supplier_purchases, supplier_payments,
--   products, product_categories, expenses, stock_movements, invoice_lines
--
-- Rollback notes:
--   DROP TRIGGER IF EXISTS trg_audit_... ON ... (for each table);
--   DROP FUNCTION IF EXISTS public.fn_audit_log_trigger();
--   DROP TABLE IF EXISTS public.audit_logs;

-- ---------------------------------------------------------------------------
-- 1. Create audit_logs table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  actor_name text,
  actor_role text,
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for lightning fast querying and filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_owner_created 
  ON public.audit_logs (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record 
  ON public.audit_logs (table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor 
  ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
  ON public.audit_logs (action);

-- Enable RLS: Audit logs are strictly tamper-proof.
-- Only Managers of the tenant can SELECT their own tenant's logs.
-- No user can direct-insert, update, or delete audit logs from client SDK!
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_select_audit_logs" ON public.audit_logs;
CREATE POLICY "managers_select_audit_logs" ON public.audit_logs
  FOR SELECT
  USING (
    public.is_manager() AND owner_id = public.get_manager_id()
  );

-- ---------------------------------------------------------------------------
-- 2. Generic Trigger Function for Audit Logging
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_audit_log_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_actor_id uuid;
  v_actor_email text;
  v_actor_name text;
  v_actor_role text;
  v_table text;
  v_record_id text;
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_changed text[] := '{}';
  v_desc text := '';
  k text;
BEGIN
  v_table := TG_TABLE_NAME;
  v_action := TG_OP;
  v_actor_id := auth.uid();

  -- Determine owner_id
  IF v_action = 'DELETE' THEN
    BEGIN
      v_owner_id := OLD.owner_id;
    EXCEPTION WHEN undefined_column THEN
      v_owner_id := public.current_owner_id();
    END;
  ELSE
    BEGIN
      v_owner_id := NEW.owner_id;
    EXCEPTION WHEN undefined_column THEN
      v_owner_id := public.current_owner_id();
    END;
  END IF;

  -- Fallback owner_id if not found on record
  IF v_owner_id IS NULL THEN
    v_owner_id := public.current_owner_id();
  END IF;

  -- If still null (e.g. system background job without auth context), try get_manager_id
  IF v_owner_id IS NULL THEN
    BEGIN
      v_owner_id := public.get_manager_id();
    EXCEPTION WHEN OTHERS THEN
      v_owner_id := NULL;
    END;
  END IF;

  -- Extract Actor metadata
  IF v_actor_id IS NOT NULL THEN
    SELECT email INTO v_actor_email FROM auth.users WHERE id = v_actor_id;

    -- Role
    SELECT role::text INTO v_actor_role FROM public.user_roles WHERE user_id = v_actor_id;
    IF v_actor_role IS NULL THEN
      IF public.is_manager() THEN
        v_actor_role := 'manager';
      ELSE
        v_actor_role := 'sales_rep';
      END IF;
    END IF;

    -- Name
    SELECT name INTO v_actor_name FROM public.reps WHERE user_id = v_actor_id LIMIT 1;
    IF v_actor_name IS NULL THEN
      v_actor_name := coalesce(v_actor_email, 'مدير النظام');
    END IF;
  ELSE
    v_actor_name := 'النظام التلقائي';
    v_actor_role := 'system';
  END IF;

  -- Build OLD and NEW data, record ID, and human description
  IF v_action = 'INSERT' THEN
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(NEW.id::text, '');
    
    -- Specific descriptive summaries based on table
    CASE v_table
      WHEN 'customers' THEN
        v_desc := 'إضافة عميل جديد: ' || COALESCE(NEW.name, '');
      WHEN 'cash_invoices' THEN
        v_desc := 'إنشاء فاتورة نقدية رقم ' || COALESCE(NEW.invoice_no, '') || ' بمبلغ ' || COALESCE(NEW.amount::text, '0');
      WHEN 'credit_invoices' THEN
        v_desc := 'إنشاء فاتورة آجلة رقم ' || COALESCE(NEW.invoice_no, '') || ' بمبلغ ' || COALESCE(NEW.amount::text, '0');
      WHEN 'payments' THEN
        v_desc := 'تسجيل دفعة نقدية بقيمة ' || COALESCE(NEW.amount::text, '0');
      WHEN 'suppliers' THEN
        v_desc := 'إضافة مورد جديد: ' || COALESCE(NEW.name, '');
      WHEN 'supplier_purchases' THEN
        v_desc := 'تسجيل فاتورة مشتريات من مورد بقيمة ' || COALESCE(NEW.total_amount::text, '0');
      WHEN 'supplier_payments' THEN
        v_desc := 'تسديد دفعة للمورد بقيمة ' || COALESCE(NEW.amount::text, '0');
      WHEN 'products' THEN
        v_desc := 'إضافة صنف/منتج جديد: ' || COALESCE(NEW.name_ar, '');
      WHEN 'product_categories' THEN
        v_desc := 'إضافة تصنيف منتجات: ' || COALESCE(NEW.name, '');
      WHEN 'expenses' THEN
        v_desc := 'تسجيل مصروف: ' || COALESCE(NEW.title, '') || ' بقيمة ' || COALESCE(NEW.amount::text, '0');
      WHEN 'stock_movements' THEN
        v_desc := 'حركة مخزون (' || COALESCE(NEW.movement_type, '') || ') كمية ' || COALESCE(NEW.qty::text, '0');
      WHEN 'reps' THEN
        v_desc := 'إضافة مندوب: ' || COALESCE(NEW.name, '');
      WHEN 'invoice_lines' THEN
        v_desc := 'إضافة بند فاتورة كمية ' || COALESCE(NEW.qty::text, '0');
      ELSE
        v_desc := 'إضافة سجل جديد في ' || v_table;
    END CASE;

  ELSIF v_action = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := COALESCE(NEW.id::text, OLD.id::text, '');

    -- Find changed keys
    FOR k IN SELECT jsonb_object_keys(v_new)
    LOOP
      -- Ignore volatile timestamp columns from being marked as key changes
      IF k NOT IN ('updated_at', 'created_at') AND (v_old -> k) IS DISTINCT FROM (v_new -> k) THEN
        v_changed := array_append(v_changed, k);
      END IF;
    END LOOP;

    -- If no substantial column changed (only updated_at), we can skip logging
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    CASE v_table
      WHEN 'customers' THEN
        v_desc := 'تعديل بيانات العميل: ' || COALESCE(NEW.name, OLD.name, '');
      WHEN 'cash_invoices' THEN
        v_desc := 'تعديل فاتورة نقدية رقم ' || COALESCE(NEW.invoice_no, OLD.invoice_no, '');
      WHEN 'credit_invoices' THEN
        v_desc := 'تعديل فاتورة آجلة رقم ' || COALESCE(NEW.invoice_no, OLD.invoice_no, '');
      WHEN 'payments' THEN
        v_desc := 'تعديل دفعة بمبلغ ' || COALESCE(NEW.amount::text, OLD.amount::text, '');
      WHEN 'suppliers' THEN
        v_desc := 'تعديل بيانات المورد: ' || COALESCE(NEW.name, OLD.name, '');
      WHEN 'supplier_purchases' THEN
        v_desc := 'تعديل مشتريات مورد بقيمة ' || COALESCE(NEW.total_amount::text, OLD.total_amount::text, '');
      WHEN 'supplier_payments' THEN
        v_desc := 'تعديل دفعة مورد بقيمة ' || COALESCE(NEW.amount::text, OLD.amount::text, '');
      WHEN 'products' THEN
        v_desc := 'تعديل الصنف: ' || COALESCE(NEW.name_ar, OLD.name_ar, '');
      WHEN 'product_categories' THEN
        v_desc := 'تعديل تصنيف: ' || COALESCE(NEW.name, OLD.name, '');
      WHEN 'expenses' THEN
        v_desc := 'تعديل مصروف: ' || COALESCE(NEW.title, OLD.title, '');
      WHEN 'reps' THEN
        v_desc := 'تعديل بيانات المندوب: ' || COALESCE(NEW.name, OLD.name, '');
      ELSE
        v_desc := 'تعديل سجل في ' || v_table;
    END CASE;

  ELSIF v_action = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_record_id := COALESCE(OLD.id::text, '');

    CASE v_table
      WHEN 'customers' THEN
        v_desc := 'حذف العميل: ' || COALESCE(OLD.name, '');
      WHEN 'cash_invoices' THEN
        v_desc := 'حذف فاتورة نقدية رقم ' || COALESCE(OLD.invoice_no, '') || ' بقيمة ' || COALESCE(OLD.amount::text, '0');
      WHEN 'credit_invoices' THEN
        v_desc := 'حذف فاتورة آجلة رقم ' || COALESCE(OLD.invoice_no, '') || ' بقيمة ' || COALESCE(OLD.amount::text, '0');
      WHEN 'payments' THEN
        v_desc := 'حذف دفعة بقيمة ' || COALESCE(OLD.amount::text, '0');
      WHEN 'suppliers' THEN
        v_desc := 'حذف المورد: ' || COALESCE(OLD.name, '');
      WHEN 'supplier_purchases' THEN
        v_desc := 'حذف مشتريات مورد بقيمة ' || COALESCE(OLD.total_amount::text, '0');
      WHEN 'supplier_payments' THEN
        v_desc := 'حذف دفعة مورد بقيمة ' || COALESCE(OLD.amount::text, '0');
      WHEN 'products' THEN
        v_desc := 'حذف الصنف: ' || COALESCE(OLD.name_ar, '');
      WHEN 'product_categories' THEN
        v_desc := 'حذف تصنيف: ' || COALESCE(OLD.name, '');
      WHEN 'expenses' THEN
        v_desc := 'حذف مصروف: ' || COALESCE(OLD.title, '') || ' بقيمة ' || COALESCE(OLD.amount::text, '0');
      WHEN 'stock_movements' THEN
        v_desc := 'حذف حركة مخزون كمية ' || COALESCE(OLD.qty::text, '0');
      WHEN 'reps' THEN
        v_desc := 'حذف المندوب: ' || COALESCE(OLD.name, '');
      WHEN 'invoice_lines' THEN
        v_desc := 'حذف بند فاتورة كمية ' || COALESCE(OLD.qty::text, '0');
      ELSE
        v_desc := 'حذف سجل من ' || v_table;
    END CASE;
  END IF;

  -- Insert audit entry if we have an owner_id
  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      owner_id,
      actor_id,
      actor_email,
      actor_name,
      actor_role,
      table_name,
      record_id,
      action,
      old_data,
      new_data,
      changed_fields,
      description
    ) VALUES (
      v_owner_id,
      v_actor_id,
      v_actor_email,
      v_actor_name,
      v_actor_role,
      v_table,
      v_record_id,
      v_action,
      v_old,
      v_new,
      v_changed,
      v_desc
    );
  END IF;

  IF v_action = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Attach Audit Triggers to Business Tables
-- ---------------------------------------------------------------------------

-- 3a. Customers
DROP TRIGGER IF EXISTS trg_audit_customers ON public.customers;
CREATE TRIGGER trg_audit_customers
  AFTER INSERT OR UPDATE OR DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3b. Reps
DROP TRIGGER IF EXISTS trg_audit_reps ON public.reps;
CREATE TRIGGER trg_audit_reps
  AFTER INSERT OR UPDATE OR DELETE ON public.reps
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3c. Cash Invoices
DROP TRIGGER IF EXISTS trg_audit_cash_invoices ON public.cash_invoices;
CREATE TRIGGER trg_audit_cash_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.cash_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3d. Credit Invoices
DROP TRIGGER IF EXISTS trg_audit_credit_invoices ON public.credit_invoices;
CREATE TRIGGER trg_audit_credit_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.credit_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3e. Payments
DROP TRIGGER IF EXISTS trg_audit_payments ON public.payments;
CREATE TRIGGER trg_audit_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3f. Suppliers
DROP TRIGGER IF EXISTS trg_audit_suppliers ON public.suppliers;
CREATE TRIGGER trg_audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3g. Supplier Purchases
DROP TRIGGER IF EXISTS trg_audit_supplier_purchases ON public.supplier_purchases;
CREATE TRIGGER trg_audit_supplier_purchases
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_purchases
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3h. Supplier Payments
DROP TRIGGER IF EXISTS trg_audit_supplier_payments ON public.supplier_payments;
CREATE TRIGGER trg_audit_supplier_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3i. Products
DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
CREATE TRIGGER trg_audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3j. Product Categories
DROP TRIGGER IF EXISTS trg_audit_product_categories ON public.product_categories;
CREATE TRIGGER trg_audit_product_categories
  AFTER INSERT OR UPDATE OR DELETE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3k. Expenses
DROP TRIGGER IF EXISTS trg_audit_expenses ON public.expenses;
CREATE TRIGGER trg_audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3l. Stock Movements
DROP TRIGGER IF EXISTS trg_audit_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_audit_stock_movements
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();

-- 3m. Invoice Lines
DROP TRIGGER IF EXISTS trg_audit_invoice_lines ON public.invoice_lines;
CREATE TRIGGER trg_audit_invoice_lines
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log_trigger();
