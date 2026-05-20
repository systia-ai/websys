-- Cuenta David Pérez López: saldo $0 y pagos registrados, estatus aún PENDIENTE.
-- Ejecutar en Supabase → SQL Editor (proyecto sistefix).

UPDATE public.cuentas
SET
  estatus = 'LIQUIDADA',
  total = 0,
  fecha_liquidada = COALESCE(fecha_liquidada, NOW()),
  updated_at = NOW()
WHERE id = 303
  AND cliente_id IN (
    SELECT id FROM public.clientes WHERE nombre ILIKE '%DAVID%PEREZ%LOPEZ%'
  );

-- Orden vinculada (opcional: marcar entregada si aún no lo está)
UPDATE public.reparaciones
SET
  estatus = 'ENTREGADA',
  updated_at = NOW()
WHERE id = 317
  AND NOT (estatus ILIKE 'ENTREGAD%');

-- Verificar
SELECT c.id, c.estatus, c.total, c.repara_id, cl.nombre
FROM public.cuentas c
JOIN public.clientes cl ON cl.id = c.cliente_id
WHERE c.id = 303;
