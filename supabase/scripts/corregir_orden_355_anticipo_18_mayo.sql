-- Orden 355 / FRANCISCO JAVIER GARCIA HURTADO
-- Ajustar fecha del anticipo al 18 de mayo de 2026.

UPDATE public.pagosclientes
SET created_at = '2026-05-18 12:48:17-06'::timestamptz
WHERE id = 472;

SELECT p.id, p.concepto, p.pago, p.created_at
FROM public.pagosclientes p
WHERE p.cuenta_id = 342
ORDER BY p.created_at;
