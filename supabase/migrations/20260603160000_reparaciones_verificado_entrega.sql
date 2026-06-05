-- Marca interna: equipo revisado y listo para entregar (no es un estatus).
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS verificado_entrega boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_verificacion_entrega timestamptz;

COMMENT ON COLUMN public.reparaciones.verificado_entrega IS
  'True cuando el taller verificó que el equipo está listo para entrega al cliente.';

COMMENT ON COLUMN public.reparaciones.fecha_verificacion_entrega IS
  'Momento en que se marcó verificado_entrega.';
