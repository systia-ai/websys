-- total = monto de cargos de la cuenta (se conserva al liquidar).
-- saldo = adeudo pendiente (total − pagos registrados).

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS saldo numeric(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.cuentas.total IS
  'Monto total de cargos de la cuenta (productos/servicios). No se pone en cero al liquidar.';

COMMENT ON COLUMN public.cuentas.saldo IS
  'Adeudo pendiente: total menos suma de pagos en pagosclientes.';

-- Recalcular total y saldo en cuentas existentes
WITH calc AS (
  SELECT
    c.id,
    GREATEST(
      COALESCE(c.total::numeric, 0),
      COALESCE((
        SELECT SUM(COALESCE(cm.cantidad, 0)::numeric * COALESCE(cm.costo, 0)::numeric)
        FROM public.cuentamov cm
        WHERE cm.cuenta_id = c.id
      ), 0),
      CASE
        WHEN UPPER(TRIM(COALESCE(c.estatus, ''))) = 'LIQUIDADA'
          AND COALESCE(c.total, 0) < 0.01
        THEN COALESCE((
          SELECT SUM(COALESCE(p.pago, 0)::numeric)
          FROM public.pagosclientes p
          WHERE p.cuenta_id = c.id
        ), 0)
        ELSE 0
      END
    ) AS total_calc,
    COALESCE((
      SELECT SUM(COALESCE(p.pago, 0)::numeric)
      FROM public.pagosclientes p
      WHERE p.cuenta_id = c.id
    ), 0) AS pagado
  FROM public.cuentas c
)
UPDATE public.cuentas c
SET
  total = calc.total_calc,
  saldo = GREATEST(0, calc.total_calc - calc.pagado)
FROM calc
WHERE c.id = calc.id;
