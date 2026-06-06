
-- Pepper migration flag on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_peppered boolean NOT NULL DEFAULT false;

-- Blocked IPs table
CREATE TABLE IF NOT EXISTS public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL UNIQUE,
  reason text,
  blocked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_ips TO authenticated;
GRANT ALL ON public.blocked_ips TO service_role;

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_ips_super_admin_select" ON public.blocked_ips
  FOR SELECT TO authenticated
  USING (public.staff_has_role(ARRAY['Super Admin']));

CREATE POLICY "blocked_ips_super_admin_insert" ON public.blocked_ips
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_has_role(ARRAY['Super Admin']));

CREATE POLICY "blocked_ips_super_admin_delete" ON public.blocked_ips
  FOR DELETE TO authenticated
  USING (public.staff_has_role(ARRAY['Super Admin']));

-- Let Super Admins read auth_attempts (drop the deny-all policy first)
DROP POLICY IF EXISTS "auth_attempts_no_client" ON public.auth_attempts;

CREATE POLICY "auth_attempts_super_admin_select" ON public.auth_attempts
  FOR SELECT TO authenticated
  USING (public.staff_has_role(ARRAY['Super Admin']));
