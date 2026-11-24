-- Migration 0028: Revoke anon EXECUTE on supplier purchase RPCs
-- Supabase grants EXECUTE to anon explicitly on new functions, so REVOKE FROM
-- PUBLIC in 0027 was not enough. The RPCs already enforce is_manager().
-- Idempotent: REVOKE / GRANT.
-- Rollback notes: GRANT EXECUTE ON FUNCTION ... TO anon;

REVOKE EXECUTE ON FUNCTION public.save_supplier_purchase(jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_supplier_purchase(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.save_supplier_purchase(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_supplier_purchase(uuid) TO authenticated;
