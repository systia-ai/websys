-- Inventario: serie por tipo de producto (Consumible/Refacción/Servicio)
-- y columna auxiliar `id2` en tabla Datos.

ALTER TABLE public."Datos"
  ADD COLUMN IF NOT EXISTS id2 integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public."Datos".id2 IS
  'Último consecutivo usado al generar serie de producto desde Inventarios.';

ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS tipo_producto text NOT NULL DEFAULT 'CONSUMIBLE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'productos_tipo_producto_chk'
  ) THEN
    ALTER TABLE public.productos
      ADD CONSTRAINT productos_tipo_producto_chk
      CHECK (tipo_producto IN ('CONSUMIBLE', 'REFACCION', 'SERVICIO'));
  END IF;
END $$;

COMMENT ON COLUMN public.productos.tipo_producto IS
  'Tipo de producto para generar serie por prefijo: C, R o S.';
