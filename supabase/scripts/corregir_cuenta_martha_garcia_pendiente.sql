-- Martha García: cuenta marcada LIQUIDADA por error con adeudo $1,300 y sin pagos.
-- Debe quedar PENDIENTE para usar «Liquidar todo» en Ventas.

UPDATE public.cuentas
SET
  estatus = 'PENDIENTE',
  total = 1300.00,
  fecha_liquidada = NULL
WHERE id = 322
  AND cliente_id = (
    SELECT id FROM public.clientes WHERE nombre ILIKE 'MARTHA GARCIA' LIMIT 1
  );

SELECT cu.id, c.nombre, cu.repara_id, cu.estatus, cu.total, cu.fecha_liquidada
FROM public.cuentas cu
JOIN public.clientes c ON c.id = cu.cliente_id
WHERE cu.id = 322;
