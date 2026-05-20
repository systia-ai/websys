-- RLS para personal del taller: solo rol `authenticated` (Supabase Auth).
-- La app web usa anon key + sesión JWT tras login; sin sesión no hay políticas para anon.

-- Tablas de negocio (app Sistefix)
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagosclientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogopagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuentamov ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reparamov ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.producmov ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Datos" ENABLE ROW LEVEL SECURITY;

-- Tablas expuestas sin uso en la app: RLS sin políticas = sin acceso vía API
ALTER TABLE public.n8n_chat_histories ENABLE ROW LEVEL SECURITY;

-- Políticas antiguas (RLS estaba desactivado)
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.clientes;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.equipos;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.reparaciones;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.cuentas;
DROP POLICY IF EXISTS "Allow all operations for authenticated users" ON public.productos;

-- Una política por tabla: CRUD completo para usuarios autenticados del proyecto
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
      'CREATE POLICY staff_authenticated_all ON public.%I
         FOR ALL TO authenticated
         USING (true)
         WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
