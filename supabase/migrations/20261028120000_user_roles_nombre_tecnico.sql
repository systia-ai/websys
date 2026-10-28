-- Nombre del técnico asociado a cada usuario del sistema.

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS nombre_tecnico text;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_nombre_tecnico_len;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_nombre_tecnico_len
  CHECK (nombre_tecnico IS NULL OR char_length(nombre_tecnico) <= 80);

-- Cambiar columnas de retorno exige recrear la función.
DROP FUNCTION IF EXISTS public.listar_usuarios_con_roles();

CREATE FUNCTION public.listar_usuarios_con_roles()
RETURNS TABLE (
  user_id uuid,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  rol text,
  nombre_tecnico text
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
    COALESCE(ur.rol, 'TECNICO')::text AS rol,
    NULLIF(btrim(ur.nombre_tecnico), '') AS nombre_tecnico
  FROM auth.users u
  LEFT JOIN public.user_roles ur
    ON ur.user_id = u.id
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.listar_usuarios_con_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_nombre_tecnico(p_user_id uuid, p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_nombre text := NULLIF(btrim(coalesce(p_nombre, '')), '');
BEGIN
  IF NOT public.es_admin_actual() THEN
    RAISE EXCEPTION 'No autorizado para cambiar el nombre del técnico'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado'
      USING ERRCODE = '22023';
  END IF;

  IF v_nombre IS NOT NULL AND char_length(v_nombre) > 80 THEN
    RAISE EXCEPTION 'El nombre del técnico no puede superar 80 caracteres'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_roles (user_id, rol, nombre_tecnico, assigned_by, assigned_at)
  VALUES (p_user_id, 'TECNICO', v_nombre, auth.uid(), now())
  ON CONFLICT (user_id)
  DO UPDATE
    SET nombre_tecnico = EXCLUDED.nombre_tecnico;
END;
$$;

GRANT EXECUTE ON FUNCTION public.guardar_nombre_tecnico(uuid, text) TO authenticated;
