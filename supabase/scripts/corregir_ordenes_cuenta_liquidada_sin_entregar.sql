-- Órdenes con cuenta LIQUIDADA pero estatus distinto de ENTREGADO/ENTREGADA.
-- Ejecutar en SQL Editor o vía script Node con SUPABASE_DB_URL.

UPDATE public.reparaciones r
SET
  estatus = 'ENTREGADO',
  verificado_entrega = true,
  fecha_verificacion_entrega = COALESCE(
    r.fecha_verificacion_entrega,
    c.fecha_liquidada,
    NOW()
  ),
  fecha_entrega = COALESCE(
    r.fecha_entrega,
    (c.fecha_liquidada AT TIME ZONE 'America/Mexico_City')::date,
    CURRENT_DATE
  ),
  updated_at = NOW()
FROM public.cuentas c
WHERE c.repara_id = r.id
  AND UPPER(TRIM(COALESCE(c.estatus, ''))) = 'LIQUIDADA'
  AND UPPER(TRIM(COALESCE(r.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA');
