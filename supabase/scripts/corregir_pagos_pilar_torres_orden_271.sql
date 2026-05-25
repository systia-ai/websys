-- Orden 271 / PILAR TORRES ROSALES (cliente 236, cuenta principal 258)
-- Ajuste de fechas y formas de pago según taller.

BEGIN;

-- Anticipo de pieza: 9 mayo 2026, efectivo
UPDATE public.pagosclientes
SET
  created_at = '2026-05-09 11:00:00-06'::timestamptz,
  forma_pago = 'EFECTIVO',
  concepto = 'ANTICIPO DE PIEZA'
WHERE id = 417 AND cuenta_id = 258;

-- Pago restante: 18 mayo 2026, transferencia
UPDATE public.pagosclientes
SET
  created_at = '2026-05-18 12:00:00-06'::timestamptz,
  forma_pago = 'TRANSFERENCIA',
  concepto = 'PAGO RESTANTE'
WHERE id = 416 AND cuenta_id = 258;

-- Pago adeudo total ($500): estaba en cuenta 271 (otro cliente); mover a cuenta 258
UPDATE public.pagosclientes
SET
  cuenta_id = 258,
  cliente_id = 236,
  created_at = '2026-05-18 13:00:00-06'::timestamptz,
  forma_pago = 'EFECTIVO',
  concepto = 'Pago adeudo total'
WHERE id = 393;

COMMIT;

SELECT p.id, p.cuenta_id, p.pago, p.concepto, p.forma_pago, p.created_at
FROM public.pagosclientes p
WHERE p.cuenta_id = 258 OR p.id = 393
ORDER BY p.created_at;
