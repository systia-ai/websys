-- Modo temporal: todos los usuarios existentes quedan como ADMIN.
-- Cuando se definan roles reales, se podran reasignar desde el modulo Administracion.

INSERT INTO public.user_roles (user_id, rol, assigned_by, assigned_at)
SELECT u.id, 'ADMIN', NULL, now()
FROM auth.users u
ON CONFLICT (user_id)
DO UPDATE
SET rol = 'ADMIN',
    assigned_by = NULL,
    assigned_at = now();

CREATE OR REPLACE FUNCTION public.listar_usuarios_con_roles()
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  rol text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id AS user_id,
    u.email::text AS email,
    u.created_at,
    u.last_sign_in_at,
    COALESCE(ur.rol, 'ADMIN')::text AS rol
  FROM auth.users u
  LEFT JOIN public.user_roles ur
    ON ur.user_id = u.id
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_roles() TO authenticated;
