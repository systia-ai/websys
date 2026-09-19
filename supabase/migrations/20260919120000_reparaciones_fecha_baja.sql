-- Fecha en que la orden pasó a estatus BAJA (equipo abandonado).
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_baja date;

COMMENT ON COLUMN public.reparaciones.fecha_baja IS
  'Día calendario en que la orden pasó a estatus BAJA (equipo abandonado).';

UPDATE public.reparaciones
SET fecha_baja = (updated_at AT TIME ZONE 'UTC')::date
WHERE UPPER(TRIM(estatus)) = 'BAJA'
  AND fecha_baja IS NULL
  AND updated_at IS NOT NULL;
