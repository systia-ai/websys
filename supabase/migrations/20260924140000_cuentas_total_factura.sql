-- Total capturado en cuentas marcadas para factura (puede diferir del total de la cuenta).

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS total_factura numeric;

COMMENT ON COLUMN public.cuentas.total_factura IS
  'Importe de la factura capturado en la cuenta; por defecto el total de la cuenta, editable.';
