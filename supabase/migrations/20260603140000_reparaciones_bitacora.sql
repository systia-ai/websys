-- Bitácora interna del taller (notas de seguimiento; distinta de descripcion_solucion).
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS bitacora text;

COMMENT ON COLUMN public.reparaciones.bitacora IS
  'Notas internas de seguimiento de la orden (bitácora del taller).';
