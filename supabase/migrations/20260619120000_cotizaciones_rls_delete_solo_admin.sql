-- Cotizaciones: mismo RLS que cuentas/órdenes (DELETE solo ADMIN; lectura y cambios para staff autenticado).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['cotizaciones', 'cotizacionmov'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS staff_authenticated_all ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_auth_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_auth_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_auth_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_auth_delete_admin ON public.%I', t);

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
