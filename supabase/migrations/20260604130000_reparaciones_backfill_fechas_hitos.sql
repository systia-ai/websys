-- Completar fechas de hitos faltantes según estatus, verificación y timestamps existentes.

UPDATE public.reparaciones
SET fecha_ingreso = COALESCE(
  (fecha_creacion AT TIME ZONE 'UTC')::date,
  (updated_at AT TIME ZONE 'UTC')::date
)
WHERE fecha_ingreso IS NULL;

UPDATE public.reparaciones
SET fecha_revision = COALESCE(
  fecha_ingreso,
  (fecha_creacion AT TIME ZONE 'UTC')::date,
  (updated_at AT TIME ZONE 'UTC')::date
)
WHERE fecha_revision IS NULL
  AND (
    UPPER(TRIM(estatus)) IN ('EN REVISION', 'REPARADO', 'ENTREGADO')
    OR verificado_entrega IS TRUE
  );

UPDATE public.reparaciones
SET fecha_reparado = COALESCE(
  (fecha_verificacion_entrega AT TIME ZONE 'UTC')::date,
  fecha_entrega,
  (updated_at AT TIME ZONE 'UTC')::date
)
WHERE fecha_reparado IS NULL
  AND (
    verificado_entrega IS TRUE
    OR UPPER(TRIM(estatus)) IN ('REPARADO', 'ENTREGADO')
  );

UPDATE public.reparaciones
SET fecha_entrega = COALESCE(
  (fecha_verificacion_entrega AT TIME ZONE 'UTC')::date,
  (updated_at AT TIME ZONE 'UTC')::date
)
WHERE fecha_entrega IS NULL
  AND UPPER(TRIM(estatus)) = 'ENTREGADO';
