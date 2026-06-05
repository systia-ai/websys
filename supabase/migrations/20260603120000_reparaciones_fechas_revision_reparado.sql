-- Fechas de hitos: cuándo pasó a EN REVISION y a REPARADO (calendario local YYYY-MM-DD).
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_revision date,
  ADD COLUMN IF NOT EXISTS fecha_reparado date;

COMMENT ON COLUMN public.reparaciones.fecha_revision IS
  'Día calendario en que la orden pasó a estatus EN REVISION (primera vez).';

COMMENT ON COLUMN public.reparaciones.fecha_reparado IS
  'Día calendario en que la orden pasó a estatus REPARADO (primera vez).';

-- Órdenes ya en esos estatus: aproximar con updated_at (solo si aún no tienen fecha).
UPDATE public.reparaciones
SET fecha_revision = (updated_at AT TIME ZONE 'UTC')::date
WHERE UPPER(TRIM(estatus)) = 'EN REVISION'
  AND fecha_revision IS NULL
  AND updated_at IS NOT NULL;

UPDATE public.reparaciones
SET fecha_reparado = (updated_at AT TIME ZONE 'UTC')::date
WHERE UPPER(TRIM(estatus)) = 'REPARADO'
  AND fecha_reparado IS NULL
  AND updated_at IS NOT NULL;
