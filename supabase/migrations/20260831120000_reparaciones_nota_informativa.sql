-- Nota informativa de la orden (distinta de descripcion_solucion y de bitacora).
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS nota_informativa text;

COMMENT ON COLUMN public.reparaciones.nota_informativa IS
  'Nota informativa visible en la orden de servicio; se guarda junto a la descripción de la solución.';
