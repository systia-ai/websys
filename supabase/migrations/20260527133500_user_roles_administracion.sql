-- Administracion de roles de usuarios (ADMIN / TECNICO)
-- Incluye listado de usuarios registrados en Auth para el modulo web.

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  rol text NOT NULL CHECK (rol IN ('ADMIN', 'TECNICO')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.es_admin_actual()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hay_admin boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.rol = 'ADMIN'
  )
  INTO v_hay_admin;

  -- Bootstrap: si aun no hay ADMIN asignado, cualquier autenticado puede administrar.
  IF NOT v_hay_admin THEN
    RETURN true;
  END IF;

  RETURN EXISTS(
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = v_uid
      AND ur.rol = 'ADMIN'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.es_admin_actual() TO authenticated;

DROP POLICY IF EXISTS user_roles_select_authenticated ON public.user_roles;
CREATE POLICY user_roles_select_authenticated
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS user_roles_insert_admin ON public.user_roles;
CREATE POLICY user_roles_insert_admin
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.es_admin_actual());

DROP POLICY IF EXISTS user_roles_update_admin ON public.user_roles;
CREATE POLICY user_roles_update_admin
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.es_admin_actual())
WITH CHECK (public.es_admin_actual());

DROP POLICY IF EXISTS user_roles_delete_admin ON public.user_roles;
CREATE POLICY user_roles_delete_admin
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.es_admin_actual());

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
    COALESCE(ur.rol, 'TECNICO')::text AS rol
  FROM auth.users u
  LEFT JOIN public.user_roles ur
    ON ur.user_id = u.id
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.asignar_rol_usuario(p_user_id uuid, p_rol text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text := upper(trim(coalesce(p_rol, '')));
BEGIN
  IF NOT public.es_admin_actual() THEN
    RAISE EXCEPTION 'No autorizado para cambiar roles'
      USING ERRCODE = '42501';
  END IF;

  IF v_rol NOT IN ('ADMIN', 'TECNICO') THEN
    RAISE EXCEPTION 'Rol invalido: %', p_rol
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_roles (user_id, rol, assigned_by, assigned_at)
  VALUES (p_user_id, v_rol, auth.uid(), now())
  ON CONFLICT (user_id)
  DO UPDATE
    SET rol = EXCLUDED.rol,
        assigned_by = EXCLUDED.assigned_by,
        assigned_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.asignar_rol_usuario(uuid, text) TO authenticated;
