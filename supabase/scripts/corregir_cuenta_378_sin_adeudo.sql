-- Cuenta 378 / JUAN CARLOS RODRIGUEZ DELGADO
-- Quitar saldo pendiente virtual; dejar cuenta sin adeudo.

UPDATE public.cuentas
SET total = 0
WHERE id = 378;

SELECT id, estatus, total, fecha_liquidada
FROM public.cuentas
WHERE id = 378;
