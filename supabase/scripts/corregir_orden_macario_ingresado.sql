-- Orden(es) de J MACARIO CLEMENTE PEREZ LAGUNA marcadas ENTREGADA por error.
-- Cuenta PENDIENTE sin pagos → estatus de taller debe ser INGRESADO.

UPDATE public.reparaciones r
SET
  estatus = 'INGRESADO',
  fecha_entrega = NULL,
  updated_at = NOW()
FROM public.clientes c
WHERE r.cliente_id = c.id
  AND (
    c.nombre ILIKE '%MACARIO%CLEMENTE%PEREZ%LAGUNA%'
    OR c.telefono LIKE '%4641251894%'
  )
  AND r.estatus ILIKE 'ENTREGAD%'
  AND EXISTS (
    SELECT 1
    FROM public.cuentas cu
    WHERE cu.repara_id = r.id
      AND COALESCE(cu.estatus, 'PENDIENTE') NOT ILIKE 'LIQUIDADA%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.cuentas cu
    JOIN public.pagosclientes p ON p.cuenta_id = cu.id
    WHERE cu.repara_id = r.id
  );

-- Ver resultado:
SELECT r.id, r.estatus, r.fecha_entrega, c.nombre, cu.estatus AS cuenta_estatus
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
LEFT JOIN public.cuentas cu ON cu.repara_id = r.id
WHERE c.nombre ILIKE '%MACARIO%'
   OR c.telefono LIKE '%4641251894%'
ORDER BY r.id DESC
LIMIT 10;
