-- Orden 347 / cuenta 334 / cliente 259 (JUANA MOSQUEDA GONZALEZ)
-- Anticipo $200 del 16-may-2026: estaba duplicado con fecha 25-may (pago id 455).

BEGIN;

-- Anticipo correcto en la fecha del ingreso de la cuenta (16 may 2026, ~11:00 CDMX)
INSERT INTO public.pagosclientes (cliente_id, cuenta_id, pago, concepto, forma_pago, created_at)
VALUES (
  259,
  334,
  200,
  'ANTICIPO DE SERVICIO',
  'EFECTIVO',
  '2026-05-16 11:00:00-06'::timestamptz
);

-- Duplicado del mismo anticipo con fecha incorrecta (25 may)
DELETE FROM public.pagosclientes WHERE id = 455;

COMMIT;

-- Verificación
SELECT p.id, p.cuenta_id, p.pago, p.concepto, p.created_at
FROM public.pagosclientes p
WHERE p.cuenta_id = 334
ORDER BY p.created_at;
