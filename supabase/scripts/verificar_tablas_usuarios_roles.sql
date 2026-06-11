-- Verificación: usuarios, roles y permisos (ejecutar en SQL Editor o con Supabase CLI).

-- 1) Tablas esperadas
SELECT
  t.table_name,
  CASE WHEN t.table_name IS NOT NULL THEN 'OK' ELSE 'FALTA' END AS estado
FROM (
  VALUES
    ('user_roles'),
    ('role_permissions')
) AS esperado(nombre)
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public'
 AND t.table_name = esperado.nombre
ORDER BY esperado.nombre;

-- 2) Columnas de user_roles
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'user_roles'
ORDER BY ordinal_position;

-- 3) Restricción de roles permitidos
SELECT conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid = 'public.user_roles'::regclass
  AND contype = 'c';

-- 4) Funciones RPC usadas por la app
SELECT p.proname AS funcion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'es_admin_actual',
    'listar_usuarios_con_roles',
    'asignar_rol_usuario',
    'obtener_permisos_roles',
    'guardar_permisos_rol'
  )
ORDER BY p.proname;

-- 5) Usuarios registrados y rol asignado
SELECT
  u.id AS user_id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  COALESCE(ur.rol, '(sin fila → TECNICO por defecto)') AS rol
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
ORDER BY u.created_at DESC;

-- 6) Permisos guardados por rol
SELECT rol, permisos, updated_at
FROM public.role_permissions
ORDER BY rol;
