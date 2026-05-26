-- Catálogo de pagos: serie automática S-0001, S-0002, …

ALTER TABLE public."Datos"
  ADD COLUMN IF NOT EXISTS id3 integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public."Datos".id3 IS
  'Último consecutivo de serie del catálogo de pagos (prefijo S).';

ALTER TABLE public.catalogopagos
  ADD COLUMN IF NOT EXISTS serie text;

COMMENT ON COLUMN public.catalogopagos.serie IS
  'Código de concepto en catálogo (ej. S-0001).';
