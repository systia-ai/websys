-- Permisos de eliminación alineados con la app (ADMIN + accion.eliminar en role_permissions).
-- RPC en cascada para eliminar cuentas/órdenes sin depender de RLS fila a fila.

CREATE OR REPLACE FUNCTION public.puede_eliminar_actual()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rol text;
  v_permisos jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.es_admin_actual() THEN
    RETURN true;
  END IF;

  SELECT ur.rol INTO v_rol
  FROM public.user_roles ur
  WHERE ur.user_id = v_uid;

  v_rol := upper(trim(coalesce(v_rol, 'TECNICO')));

  IF v_rol = 'ADMIN' THEN
    RETURN true;
  END IF;

  SELECT rp.permisos INTO v_permisos
  FROM public.role_permissions rp
  WHERE rp.rol = v_rol;

  IF v_permisos IS NOT NULL AND (v_permisos->>'accion.eliminar')::boolean IS TRUE THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.puede_eliminar_actual() TO authenticated;

CREATE OR REPLACE FUNCTION public.eliminar_cuenta_por_id(p_cuenta_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_repara_id bigint;
BEGIN
  IF NOT public.puede_eliminar_actual() THEN
    RAISE EXCEPTION 'No autorizado para eliminar cuentas'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.repara_id INTO v_repara_id
  FROM public.cuentas c
  WHERE c.id = p_cuenta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la cuenta %', p_cuenta_id
      USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.pagosclientes WHERE cuenta_id = p_cuenta_id;
  DELETE FROM public.cuentamov WHERE cuenta_id = p_cuenta_id;

  IF v_repara_id IS NOT NULL THEN
    DELETE FROM public.reparamov WHERE repara_id = v_repara_id;
  END IF;

  DELETE FROM public.cuentas WHERE id = p_cuenta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo eliminar la cuenta %', p_cuenta_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_cuenta_por_id(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.eliminar_reparacion_completa(p_repara_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cuenta_ids bigint[];
BEGIN
  IF NOT public.puede_eliminar_actual() THEN
    RAISE EXCEPTION 'No autorizado para eliminar órdenes'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.reparaciones r WHERE r.id = p_repara_id) THEN
    RAISE EXCEPTION 'No se encontró la orden %', p_repara_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT array_agg(c.id)
  INTO v_cuenta_ids
  FROM public.cuentas c
  WHERE c.repara_id = p_repara_id;

  IF v_cuenta_ids IS NOT NULL THEN
    DELETE FROM public.pagosclientes WHERE cuenta_id = ANY (v_cuenta_ids);
    DELETE FROM public.cuentamov WHERE cuenta_id = ANY (v_cuenta_ids);
  END IF;

  DELETE FROM public.reparamov WHERE repara_id = p_repara_id;
  DELETE FROM public.cuentas WHERE repara_id = p_repara_id;
  DELETE FROM public.reparaciones WHERE id = p_repara_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo eliminar la orden %', p_repara_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eliminar_reparacion_completa(bigint) TO authenticated;

-- Actualizar políticas DELETE: ADMIN o rol con accion.eliminar
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clientes', 'equipos', 'reparaciones', 'cuentas', 'pagosclientes',
    'productos', 'catalogopagos', 'cuentamov', 'reparamov', 'producmov', 'Datos'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS staff_auth_delete_admin ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY staff_auth_delete_admin ON public.%I
         FOR DELETE TO authenticated
         USING (public.puede_eliminar_actual())',
      t
    );
  END LOOP;
END $$;
