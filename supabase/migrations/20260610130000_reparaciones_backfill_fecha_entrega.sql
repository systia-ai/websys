-- Completar fecha_entrega en órdenes ENTREGADO/A (desde mayo 2026) desde pago o liquidación de cuenta.
WITH candidatas AS (
  SELECT r.id
  FROM public.reparaciones r
  WHERE UPPER(TRIM(r.estatus)) IN ('ENTREGADO', 'ENTREGADA')
    AND r.fecha_entrega IS NULL
    AND COALESCE(
      r.fecha_ingreso,
      (r.fecha_creacion AT TIME ZONE 'UTC')::date
    ) >= DATE '2026-05-01'
),
fecha_real AS (
  SELECT
    c.id,
    COALESCE(
      (
        SELECT MAX((p.created_at AT TIME ZONE 'UTC')::date)
        FROM public.pagosclientes p
        INNER JOIN public.cuentas cu ON cu.id = p.cuenta_id
        WHERE cu.repara_id = c.id
      ),
      (
        SELECT (cu.fecha_liquidada AT TIME ZONE 'UTC')::date
        FROM public.cuentas cu
        WHERE cu.repara_id = c.id
          AND cu.fecha_liquidada IS NOT NULL
        ORDER BY cu.id DESC
        LIMIT 1
      )
    ) AS ymd
  FROM candidatas c
)
UPDATE public.reparaciones r
SET fecha_entrega = fr.ymd
FROM fecha_real fr
WHERE r.id = fr.id
  AND fr.ymd IS NOT NULL;
