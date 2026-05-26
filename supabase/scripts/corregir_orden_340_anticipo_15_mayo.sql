-- Orden 340 — anticipo al 15 de mayo de 2026

UPDATE public.pagosclientes
SET created_at = '2026-05-15 12:00:00-06'::timestamptz
WHERE id = 474;

SELECT p.id, p.concepto, p.pago, p.created_at
FROM public.pagosclientes p
WHERE p.id = 474;
