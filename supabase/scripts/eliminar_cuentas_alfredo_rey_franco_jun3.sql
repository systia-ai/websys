-- ALFREDO REY FRANCO (cliente_id 61) — cuentas duplicadas del 3-jun-2026.
-- Cuenta 447: vacía, PENDIENTE, ligada a orden 447 (sin movimientos ni pagos).
-- Cuenta 449: duplicada sin repara_id (venta/pago duplicados el mismo día).
-- Orden 447 se conserva; solo se eliminan las cuentas erróneas.

BEGIN;

DELETE FROM public.pagosclientes WHERE cuenta_id IN (447, 449);
DELETE FROM public.cuentamov WHERE cuenta_id IN (447, 449);
DELETE FROM public.cuentas WHERE id IN (447, 449);

COMMIT;

SELECT c.id, c.repara_id, c.total, c.estatus, c.created_at::date AS dia
FROM public.cuentas c
WHERE c.cliente_id = 61
ORDER BY c.created_at DESC
LIMIT 8;
