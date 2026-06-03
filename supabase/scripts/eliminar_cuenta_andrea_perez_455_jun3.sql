-- ANDREA PEREZ BEDOYA (cliente_id 378) — cuenta vacía creada por error.
-- Cuenta 455: $0, PENDIENTE, sin repara_id, sin pagos ni movimientos.
-- Se conserva la cuenta 452 ($500, orden 451).

BEGIN;

DELETE FROM public.pagosclientes WHERE cuenta_id = 455;
DELETE FROM public.cuentamov WHERE cuenta_id = 455;
DELETE FROM public.cuentas WHERE id = 455;

COMMIT;

SELECT c.id, c.repara_id, c.total, c.estatus, c.created_at::date AS dia
FROM public.cuentas c
WHERE c.cliente_id = 378
ORDER BY c.created_at DESC;
