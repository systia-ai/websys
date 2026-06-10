-- Fecha en que la orden pasó a estatus SIN REPARACION (calendario local YYYY-MM-DD).
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_sin_reparacion date;

COMMENT ON COLUMN public.reparaciones.fecha_sin_reparacion IS
  'Día calendario en que la orden pasó a estatus SIN REPARACION (primera vez).';

UPDATE public.reparaciones
SET fecha_sin_reparacion = (updated_at AT TIME ZONE 'UTC')::date
WHERE UPPER(TRIM(estatus)) = 'SIN REPARACION'
  AND fecha_sin_reparacion IS NULL
  AND updated_at IS NOT NULL;
