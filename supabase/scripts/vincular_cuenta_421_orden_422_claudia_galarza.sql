-- Cuenta 421 (Claudia Galarza) ↔ orden 422: la cuenta existía sin repara_id.

BEGIN;

UPDATE public.cuentas
SET repara_id = 422
WHERE id = 421
  AND cliente_id = 358
  AND repara_id IS NULL;

COMMIT;

SELECT c.id AS cuenta_id, c.repara_id, c.cliente_id, c.total, c.estatus, cl.nombre
FROM public.cuentas c
JOIN public.clientes cl ON cl.id = c.cliente_id
WHERE c.id = 421 OR c.repara_id = 422;
