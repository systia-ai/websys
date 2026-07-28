-- Factura en cuentas de clientes: marca + folio identificable (sin timbrado CFDI).

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS lleva_factura boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS folio_factura text;

COMMENT ON COLUMN public.cuentas.lleva_factura IS
  'True si la cuenta requiere factura; se identifica con folio_factura.';

COMMENT ON COLUMN public.cuentas.folio_factura IS
  'Folio interno de factura (ej. FAC-0001). Único cuando no es null.';

CREATE UNIQUE INDEX IF NOT EXISTS cuentas_folio_factura_uidx
  ON public.cuentas (folio_factura)
  WHERE folio_factura IS NOT NULL AND btrim(folio_factura) <> '';

-- Contador global de folios (mismo patrón que id2 productos / id3 catálogo pagos).
ALTER TABLE public."Datos"
  ADD COLUMN IF NOT EXISTS id4 integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public."Datos".id4 IS
  'Siguiente consecutivo para folio de factura de cuentas (FAC-####).';
