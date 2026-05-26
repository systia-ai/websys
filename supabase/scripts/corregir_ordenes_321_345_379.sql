-- Orden 321: entrega 15-may-2026 (estaba 26-may).
-- Orden 345: duplicada de 344 (FRANCISCO DE JESUS ZAVALA RAYA); sin cuenta.
-- Orden 379: entrega 23-may-2026 (estaba 26-may).

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS es_orden_duplicada boolean NOT NULL DEFAULT false;

ALTER TABLE public.reparaciones DISABLE TRIGGER update_reparaciones_updated_at;

-- 321 — fecha de entrega 15 may
UPDATE public.reparaciones
SET
  fecha_entrega = '2026-05-15'::date,
  estatus = 'ENTREGADO',
  updated_at = '2026-05-15 16:00:00-06'::timestamptz
WHERE id = 321;

-- 345 — marcar duplicada (la buena es 344 con cuenta 332)
UPDATE public.reparaciones
SET
  es_orden_duplicada = true,
  estatus = 'INGRESADO',
  fecha_entrega = NULL,
  updated_at = '2026-05-15 12:00:00-06'::timestamptz
WHERE id = 345;

-- 379 — entregada 23 may
UPDATE public.reparaciones
SET
  fecha_entrega = '2026-05-23'::date,
  estatus = 'ENTREGADA',
  updated_at = '2026-05-23 16:00:00-06'::timestamptz
WHERE id = 379;

ALTER TABLE public.reparaciones ENABLE TRIGGER update_reparaciones_updated_at;

UPDATE public.cuentas
SET fecha_liquidada = '2026-05-23 16:00:00-06'::timestamptz
WHERE repara_id = 379 AND estatus = 'LIQUIDADA';

SELECT r.id, r.estatus, r.es_orden_duplicada,
       r.fecha_creacion::date AS ingreso,
       r.fecha_entrega, r.updated_at::date AS actualizado, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id IN (321, 344, 345, 379)
ORDER BY r.id;

SELECT cu.id, cu.repara_id, cu.estatus, cu.fecha_liquidada::date
FROM public.cuentas cu
WHERE cu.repara_id IN (321, 344, 345, 379);
