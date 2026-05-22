-- Órdenes entregadas con fecha_entrega un día adelantada por guardar UTC (toISOString).
-- Ajusta fecha_entrega al día calendario de updated_at en zona México.
-- Ejecutar en Supabase SQL Editor si el monitor muestra 22 may cuando entregaste el 21.

UPDATE public.reparaciones r
SET fecha_entrega = to_char(
  (r.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City',
  'YYYY-MM-DD'
)
WHERE r.estatus ILIKE 'ENTREGAD%'
  AND r.fecha_entrega IS NOT NULL
  AND r.updated_at IS NOT NULL
  AND r.fecha_entrega::date = (
    ((r.updated_at AT TIME ZONE 'UTC') AT TIME ZONE 'America/Mexico_City')::date + 1
  );

-- Ver órdenes entregadas recientes:
SELECT id, estatus, fecha_entrega, updated_at
FROM public.reparaciones
WHERE estatus ILIKE 'ENTREGAD%'
ORDER BY updated_at DESC
LIMIT 20;
