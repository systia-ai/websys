-- Orden 66 / JUAN LARA LOPEZ
-- Ingreso nov 2025; updated_at quedó en may 2026 y la hacía aparecer en filtro «reparadas» de mayo.
-- Alinear updated_at con fecha_creacion (el trigger lo sobrescribe si no se desactiva).

ALTER TABLE public.reparaciones DISABLE TRIGGER update_reparaciones_updated_at;

UPDATE public.reparaciones
SET updated_at = '2025-11-18 22:51:32.923-06'::timestamptz
WHERE id = 66;

ALTER TABLE public.reparaciones ENABLE TRIGGER update_reparaciones_updated_at;

SELECT id, estatus, fecha_creacion::date AS ingreso, updated_at::date AS actualizado
FROM public.reparaciones
WHERE id = 66;
