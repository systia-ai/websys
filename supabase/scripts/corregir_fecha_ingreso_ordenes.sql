-- fecha_ingreso debe coincidir con la fecha de creación de la orden (alta en sistema).
-- Corrige órdenes donde se guardó mal al cambiar estatus (p. ej. 540, 543).
-- Ejecutar: npx dotenv -e .env -- node scripts/corregir-fecha-ingreso-ordenes.mjs

UPDATE public.reparaciones
SET fecha_ingreso = (fecha_creacion AT TIME ZONE 'UTC')::date
WHERE fecha_creacion IS NOT NULL
  AND (fecha_creacion AT TIME ZONE 'UTC')::date >= '2026-05-01'
  AND (
    fecha_ingreso IS NULL
    OR fecha_ingreso IS DISTINCT FROM (fecha_creacion AT TIME ZONE 'UTC')::date
  );
