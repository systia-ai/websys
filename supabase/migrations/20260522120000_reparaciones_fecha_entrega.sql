-- Fecha de entrega al cliente (calendario local YYYY-MM-DD), distinta de fecha_creacion/ingreso.
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

COMMENT ON COLUMN public.reparaciones.fecha_entrega IS
  'Día calendario en que el equipo salió del taller (zona local del usuario al guardar).';
