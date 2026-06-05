-- Marca: se avisó al cliente (p. ej. equipo listo); no es un estatus.
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS cliente_notificado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_notificacion_cliente timestamptz;

COMMENT ON COLUMN public.reparaciones.cliente_notificado IS
  'True cuando el taller registró que se notificó al cliente.';

COMMENT ON COLUMN public.reparaciones.fecha_notificacion_cliente IS
  'Momento en que se marcó cliente_notificado.';
