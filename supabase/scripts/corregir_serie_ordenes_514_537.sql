-- Corregir número de serie del equipo en órdenes 514 y 537.
-- Aplicado en BD remota (jun 2026):
--   Orden 514, equipo_id 517: ATF09N459364 → X8G5124559
--   Orden 537, equipo_id 537: ATF07D28K447 → X8G50229803
-- Ejecutar: npx dotenv -e .env -- node scripts/corregir-serie-ordenes.mjs

-- Estado actual
SELECT r.id AS orden_id, r.equipo_id, e.serie AS serie_actual, e.tipo_equipo, e.descripcion
FROM public.reparaciones r
LEFT JOIN public.equipos e ON e.id = r.equipo_id
WHERE r.id IN (514, 537)
ORDER BY r.id;

-- Verificar que las series destino no estén en otro equipo distinto
SELECT e.id, e.serie, e.cliente_id
FROM public.equipos e
WHERE upper(trim(e.serie)) IN ('X8G5124559', 'X8G50229803');

BEGIN;

UPDATE public.equipos e
SET serie = 'X8G5124559'
FROM public.reparaciones r
WHERE r.id = 514
  AND r.equipo_id = e.id;

UPDATE public.equipos e
SET serie = 'X8G50229803'
FROM public.reparaciones r
WHERE r.id = 537
  AND r.equipo_id = e.id;

COMMIT;

-- Verificación final
SELECT r.id AS orden_id, r.equipo_id, e.serie AS serie_corregida, e.tipo_equipo, e.descripcion
FROM public.reparaciones r
LEFT JOIN public.equipos e ON e.id = r.equipo_id
WHERE r.id IN (514, 537)
ORDER BY r.id;
