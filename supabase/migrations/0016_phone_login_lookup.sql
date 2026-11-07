-- Migration 0016: Phone-to-email lookup function for phone-based login
-- Purpose: Allows the frontend to resolve a phone number to an email address
--          so it can sign in via the standard email+password flow without
--          requiring Supabase phone auth (SMS/OTP) to be enabled.
-- Returns: jsonb { "email": "..." } or NULL if not found.
-- Rollback: DROP FUNCTION IF EXISTS public.get_email_by_phone(text);

DROP FUNCTION IF EXISTS public.get_email_by_phone(text);

CREATE FUNCTION public.get_email_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('email', email)
  FROM auth.users
  WHERE phone = p_phone
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_by_phone(text) TO anon, authenticated;
