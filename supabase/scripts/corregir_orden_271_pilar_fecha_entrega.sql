-- Orden 271 / PILAR TORRES ROSALES — entrega 18 mayo 2026

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

UPDATE public.reparaciones
SET fecha_entrega = '2026-05-18'::date
WHERE id = 271;

SELECT r.id, r.estatus, r.fecha_entrega, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id = 271;
