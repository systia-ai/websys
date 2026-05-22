-- Órdenes con fecha de entrega un día adelantada (UTC): corregir a 21 may 2026.
-- La columna fecha_entrega puede no existir en proyectos antiguos; se crea si falta.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

UPDATE public.reparaciones
SET fecha_entrega = '2026-05-21'::date
WHERE id IN (306, 330, 339);

SELECT r.id, r.estatus, r.fecha_entrega, r.updated_at, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id IN (306, 330, 339)
ORDER BY r.id;
