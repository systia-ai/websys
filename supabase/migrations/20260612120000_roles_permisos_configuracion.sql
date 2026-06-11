-- Roles ampliados (ADMIN, COORDINADOR, TECNICO, OPERADOR) y permisos personalizables por rol.

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_rol_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_rol_check
  CHECK (rol IN ('ADMIN', 'COORDINADOR', 'TECNICO', 'OPERADOR'));

CREATE TABLE IF NOT EXISTS public.role_permissions (
  rol text PRIMARY KEY CHECK (rol IN ('ADMIN', 'COORDINADOR', 'TECNICO', 'OPERADOR')),
  permisos jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS role_permissions_select_authenticated ON public.role_permissions;
CREATE POLICY role_permissions_select_authenticated
ON public.role_permissions
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS role_permissions_write_admin ON public.role_permissions;
CREATE POLICY role_permissions_write_admin
ON public.role_permissions
FOR ALL
TO authenticated
USING (public.es_admin_actual())
WITH CHECK (public.es_admin_actual());

CREATE OR REPLACE FUNCTION public.obtener_permisos_roles()
RETURNS TABLE (rol text, permisos jsonb, updated_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rp.rol, rp.permisos, rp.updated_at
  FROM public.role_permissions rp
  WHERE rp.rol <> 'ADMIN'
  ORDER BY rp.rol;
$$;

GRANT EXECUTE ON FUNCTION public.obtener_permisos_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_permisos_rol(p_rol text, p_permisos jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol text := upper(trim(coalesce(p_rol, '')));
BEGIN
  IF NOT public.es_admin_actual() THEN
    RAISE EXCEPTION 'No autorizado para configurar permisos'
      USING ERRCODE = '42501';
  END IF;

  IF v_rol NOT IN ('COORDINADOR', 'TECNICO', 'OPERADOR') THEN
    RAISE EXCEPTION 'No se pueden guardar permisos para el rol %', p_rol
      USING ERRCODE = '22023';
  END IF;

  IF p_permisos IS NULL OR jsonb_typeof(p_permisos) <> 'object' THEN
    RAISE EXCEPTION 'Permisos invalidos'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.role_permissions (rol, permisos, updated_by, updated_at)
  VALUES (v_rol, p_permisos, auth.uid(), now())
  ON CONFLICT (rol)
  DO UPDATE
    SET permisos = EXCLUDED.permisos,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.guardar_permisos_rol(text, jsonb) TO authenticated;

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

  IF v_rol NOT IN ('ADMIN', 'COORDINADOR', 'TECNICO', 'OPERADOR') THEN
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
