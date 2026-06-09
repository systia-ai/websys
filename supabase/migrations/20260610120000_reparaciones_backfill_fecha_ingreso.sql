-- Completar fecha_ingreso desde fecha_creacion (sistema web desde mayo 2026).
UPDATE public.reparaciones
SET fecha_ingreso = (fecha_creacion AT TIME ZONE 'UTC')::date
WHERE fecha_ingreso IS NULL
  AND fecha_creacion IS NOT NULL
  AND (fecha_creacion AT TIME ZONE 'UTC')::date >= DATE '2026-05-01';
