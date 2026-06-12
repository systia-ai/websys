-- Folio de garantía Epson (solo aplica cuando tipo_reparacion = GARANTIA EPSON)
ALTER TABLE public.reparaciones
  ADD COLUMN IF NOT EXISTS folio_epson text;

COMMENT ON COLUMN public.reparaciones.folio_epson IS
  'Folio de garantía Epson; relevante solo cuando tipo_reparacion es GARANTIA EPSON.';
