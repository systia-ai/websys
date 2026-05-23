-- Revisión: cuentas liquidadas sin pagos en pagosclientes (no aparecen en corte de caja).
-- Ejecutar en SQL Editor de Supabase.

SELECT
  c.id AS cuenta_id,
  c.cliente_id,
  c.total,
  c.estatus,
  c.fecha_liquidada::date AS fecha_liquidacion,
  COALESCE(SUM(p.pago), 0)::numeric(12, 2) AS suma_pagos
FROM public.cuentas c
LEFT JOIN public.pagosclientes p ON p.cuenta_id = c.id
WHERE c.estatus = 'LIQUIDADA'
  AND c.fecha_liquidada >= (CURRENT_DATE - INTERVAL '90 days')
GROUP BY c.id, c.cliente_id, c.total, c.estatus, c.fecha_liquidada
HAVING COALESCE(SUM(p.pago), 0) < 0.01
ORDER BY c.fecha_liquidada DESC;

-- Totales por día (corte) vs cantidad de movimientos
SELECT
  (p.created_at AT TIME ZONE 'America/Mexico_City')::date AS dia,
  COUNT(*)::int AS pagos,
  SUM(p.pago)::numeric(12, 2) AS ingresos
FROM public.pagosclientes p
WHERE p.created_at >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY 1
ORDER BY 1 DESC;
