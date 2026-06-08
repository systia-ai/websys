-- Fecha de ingreso al taller (primer día en estatus INGRESADO).
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_ingreso date;

COMMENT ON COLUMN public.reparaciones.fecha_ingreso IS
  'Día calendario en que el equipo ingresó al taller (estatus INGRESADO).';

-- Órdenes existentes: usar fecha_creacion (columna de la app).
UPDATE public.reparaciones
SET fecha_ingreso = (fecha_creacion AT TIME ZONE 'UTC')::date
WHERE fecha_ingreso IS NULL
  AND fecha_creacion IS NOT NULL;
