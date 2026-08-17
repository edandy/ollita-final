-- Beneficiaries get kitchen accounts with cargo socia. Read-only cargos must not pass can_write_comedor.

CREATE OR REPLACE FUNCTION public.can_write_comedor(_comedor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_comedor uc
    WHERE uc.user_id = auth.uid()
      AND uc.comedor_id = _comedor_id
      AND uc.cargo NOT IN ('socia', 'fiscal', 'vocal', 'secretaria')
  )
  OR EXISTS (
    SELECT 1
    FROM public.supervisor_assignments sa
    JOIN public.supervisors s ON s.user_id = sa.user_id
    WHERE sa.user_id = auth.uid()
      AND sa.comedor_id = _comedor_id
      AND s.access_level = 'full'
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id FROM auth.users WHERE email = lower(trim(_email)) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;
