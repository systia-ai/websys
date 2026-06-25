-- Número de cotización por cliente (1, 2, 3…); reutiliza huecos al eliminar.

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS numero integer;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY id) AS rn
  FROM public.cotizaciones
)
UPDATE public.cotizaciones c
SET numero = r.rn
FROM ranked r
WHERE c.id = r.id
  AND c.numero IS NULL;

UPDATE public.cotizaciones
SET numero = 1
WHERE numero IS NULL;

ALTER TABLE public.cotizaciones
  ALTER COLUMN numero SET NOT NULL;

ALTER TABLE public.cotizaciones
  ALTER COLUMN numero SET DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS cotizaciones_cliente_numero_uidx
  ON public.cotizaciones (cliente_id, numero);
