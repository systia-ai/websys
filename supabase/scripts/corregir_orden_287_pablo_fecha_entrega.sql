-- Orden 287 / PABLO NAPOLES CENTENO — entrega 19 mayo 2026

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

UPDATE public.reparaciones
SET fecha_entrega = '2026-05-19'::date
WHERE id = 287;

SELECT r.id, r.estatus, r.fecha_entrega, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id = 287;
