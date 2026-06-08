-- Solo ADMIN puede DELETE en tablas de negocio; TECNICO conserva SELECT/INSERT/UPDATE.
-- Requiere public.es_admin_actual() (migración user_roles_administracion).

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
    EXECUTE format('DROP POLICY IF EXISTS staff_authenticated_all ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY staff_auth_select ON public.%I
         FOR SELECT TO authenticated
         USING (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY staff_auth_insert ON public.%I
         FOR INSERT TO authenticated
         WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY staff_auth_update ON public.%I
         FOR UPDATE TO authenticated
         USING (true)
         WITH CHECK (true)',
      t
    );
    EXECUTE format(
      'CREATE POLICY staff_auth_delete_admin ON public.%I
         FOR DELETE TO authenticated
         USING (public.es_admin_actual())',
      t
    );
  END LOOP;
END $$;
