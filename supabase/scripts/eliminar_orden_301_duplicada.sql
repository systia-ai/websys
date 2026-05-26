-- Orden 301 duplicada (RAQUEL MARQUEZ SOLIS, mismo equipo que orden 300).
-- Sin cuenta ni pagos vinculados.

DELETE FROM public.reparaciones
WHERE id = 301;

SELECT r.id, r.estatus, r.equipo_id, c.nombre
FROM public.reparaciones r
JOIN public.clientes c ON c.id = r.cliente_id
WHERE r.id IN (300, 301)
ORDER BY r.id;
