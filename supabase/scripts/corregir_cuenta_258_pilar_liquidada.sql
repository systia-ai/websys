-- Cuenta 258 / PILAR TORRES ROSALES (orden repara 271)
-- Pago adeudo total (id 393): $500 → $900 (+$400 faltantes). Liquidar cuenta.

BEGIN;

UPDATE public.pagosclientes
SET pago = 900
WHERE id = 393 AND cuenta_id = 258;

UPDATE public.cuentas
SET
  total = 0,
  estatus = 'LIQUIDADA',
  fecha_liquidada = '2026-05-18 13:00:00-06'::timestamptz
WHERE id = 258;

COMMIT;

SELECT p.id, p.concepto, p.pago, p.forma_pago
FROM public.pagosclientes p
WHERE p.cuenta_id = 258
ORDER BY p.created_at;

SELECT id, total, estatus, fecha_liquidada
FROM public.cuentas
WHERE id = 258;
