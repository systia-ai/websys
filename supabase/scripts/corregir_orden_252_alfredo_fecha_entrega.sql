-- Orden 252 / ALFREDO CAMPOS CASTRO — entrega 19 mayo 2026

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

UPDATE public.reparaciones
SET
  fecha_entrega = '2026-05-19'::date,
  estatus = 'ENTREGADO'
WHERE id = 252;

SELECT r.id, r.estatus, r.fecha_entrega, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id = 252;
