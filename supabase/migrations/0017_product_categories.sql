-- Migration 0017: Product Categories table
-- Purpose: Dedicated categories table so managers can add/edit/delete categories
--          instead of typing free-text. Reps get read-only access.
-- Rollback: DROP TABLE IF EXISTS public.product_categories;

CREATE TABLE IF NOT EXISTS public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, owner_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_owner ON public.product_categories(owner_id);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- Manager: full CRUD
DROP POLICY IF EXISTS "manager_all_product_categories" ON public.product_categories;
CREATE POLICY "manager_all_product_categories" ON public.product_categories
  FOR ALL
  USING  (owner_id = public.get_manager_id() AND public.is_manager())
  WITH CHECK (owner_id = public.get_manager_id() AND public.is_manager());

-- Authenticated (reps): read-only, same tenant
DROP POLICY IF EXISTS "read_product_categories" ON public.product_categories;
CREATE POLICY "read_product_categories" ON public.product_categories
  FOR SELECT
  USING (owner_id = public.get_manager_id());
