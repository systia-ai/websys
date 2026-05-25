-- Orden 319 / ENRIQUE REZA BARRIOS
-- Ingreso 13 mayo 2026, entrega 19 mayo 2026

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

UPDATE public.reparaciones
SET
  fecha_creacion = '2026-05-13 11:00:00-06'::timestamptz,
  fecha_entrega = '2026-05-19'::date
WHERE id = 319;

SELECT r.id, r.estatus, r.fecha_creacion::date AS ingreso, r.fecha_entrega, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id = 319;
