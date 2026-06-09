-- Corregir fecha_entrega inferida el 9-jun-2026 en órdenes antiguas (backfill / updated_at).
-- Restaurar desde cuenta liquidada o último pago cuando exista; si no, dejar NULL.

WITH mal AS (
  SELECT r.id
  FROM public.reparaciones r
  WHERE UPPER(TRIM(r.estatus)) IN ('ENTREGADO', 'ENTREGADA')
    AND r.fecha_entrega = DATE '2026-06-09'
    AND COALESCE(
      r.fecha_ingreso,
      (r.fecha_creacion AT TIME ZONE 'UTC')::date
    ) < DATE '2026-06-09'
),
fecha_real AS (
  SELECT
    m.id,
    COALESCE(
      (
        SELECT (c.fecha_liquidada AT TIME ZONE 'UTC')::date
        FROM public.cuentas c
        WHERE c.repara_id = m.id
          AND c.fecha_liquidada IS NOT NULL
        ORDER BY c.id DESC
        LIMIT 1
      ),
      (
        SELECT MAX((p.created_at AT TIME ZONE 'UTC')::date)
        FROM public.pagosclientes p
        INNER JOIN public.cuentas c ON c.id = p.cuenta_id
        WHERE c.repara_id = m.id
      )
    ) AS ymd
  FROM mal m
)
UPDATE public.reparaciones r
SET fecha_entrega = fr.ymd
FROM fecha_real fr
WHERE r.id = fr.id
  AND fr.ymd IS NOT NULL
  AND fr.ymd <> DATE '2026-06-09';

UPDATE public.reparaciones r
SET fecha_entrega = NULL
WHERE UPPER(TRIM(r.estatus)) IN ('ENTREGADO', 'ENTREGADA')
  AND r.fecha_entrega = DATE '2026-06-09'
  AND COALESCE(
    r.fecha_ingreso,
    (r.fecha_creacion AT TIME ZONE 'UTC')::date
  ) < DATE '2026-06-09';

-- fecha_reparado inferida el 9-jun sin verificación ese día
UPDATE public.reparaciones r
SET fecha_reparado = (r.fecha_verificacion_entrega AT TIME ZONE 'UTC')::date
WHERE r.fecha_reparado = DATE '2026-06-09'
  AND COALESCE(
    r.fecha_ingreso,
    (r.fecha_creacion AT TIME ZONE 'UTC')::date
  ) < DATE '2026-06-09'
  AND r.fecha_verificacion_entrega IS NOT NULL
  AND (r.fecha_verificacion_entrega AT TIME ZONE 'UTC')::date <> DATE '2026-06-09';

UPDATE public.reparaciones r
SET fecha_reparado = NULL
WHERE r.fecha_reparado = DATE '2026-06-09'
  AND COALESCE(
    r.fecha_ingreso,
    (r.fecha_creacion AT TIME ZONE 'UTC')::date
  ) < DATE '2026-06-09'
  AND (
    r.fecha_verificacion_entrega IS NULL
    OR (r.fecha_verificacion_entrega AT TIME ZONE 'UTC')::date <> DATE '2026-06-09'
  );
