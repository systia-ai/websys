-- Orden 315 / OSWALDO GUTIERREZ ELIZARRAZ (cuenta 301)
-- Ingreso 23 abr 2026, entrega 12 may 2026, cuenta liquidada.

ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS fecha_entrega date;

BEGIN;

UPDATE public.reparaciones
SET
  fecha_creacion = '2026-04-23 11:00:00-06'::timestamptz,
  fecha_entrega = '2026-05-12'::date,
  estatus = 'ENTREGADO',
  updated_at = '2026-05-12 16:00:00-06'::timestamptz
WHERE id = 315;

UPDATE public.cuentas
SET
  total = 0,
  estatus = 'LIQUIDADA',
  fecha_liquidada = '2026-05-12 16:00:00-06'::timestamptz,
  created_at = '2026-04-23 11:00:00-06'::timestamptz
WHERE id = 301 AND repara_id = 315;

-- Anticipo $200 ya existía (id 379); falta el restante $300 del servicio $500
INSERT INTO public.pagosclientes (cliente_id, cuenta_id, pago, concepto, forma_pago, created_at)
SELECT 270, 301, 300, 'PAGO RESTANTE', 'EFECTIVO', '2026-05-12 16:00:00-06'::timestamptz
WHERE NOT EXISTS (
  SELECT 1 FROM public.pagosclientes
  WHERE cuenta_id = 301 AND pago::numeric >= 300 AND concepto ILIKE '%RESTANTE%'
);

COMMIT;

SELECT r.id, r.estatus, r.fecha_creacion::date AS ingreso, r.fecha_entrega, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id = 315;

SELECT cu.id, cu.estatus, cu.total, cu.fecha_liquidada
FROM public.cuentas cu
WHERE cu.repara_id = 315;

SELECT id, concepto, pago, forma_pago, created_at
FROM public.pagosclientes
WHERE cuenta_id = 301;
