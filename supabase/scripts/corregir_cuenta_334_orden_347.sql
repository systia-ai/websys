-- Orden 347 / cuenta 334: solo anticipo $200 del 16-may; quitar pago $300 erróneo y total inflado.

BEGIN;

DELETE FROM public.pagosclientes WHERE id = 454;

UPDATE public.cuentas
SET
  total = 500,
  estatus = 'PENDIENTE',
  fecha_liquidada = NULL
WHERE id = 334;

COMMIT;

SELECT c.id, c.total, c.estatus FROM public.cuentas c WHERE c.id = 334;
SELECT p.id, p.pago, p.concepto, p.created_at::date AS dia
FROM public.pagosclientes p WHERE p.cuenta_id = 334 ORDER BY p.created_at;
