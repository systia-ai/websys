-- Orden 513 (Ma Concepción) — Garantía Epson, cuenta liquidada en $0 pero orden en REPARADO.
-- Ejecutar en SQL Editor o: npx dotenv -e .env -- node scripts/corregir-orden-513.mjs

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
WHERE r.id = 513
  AND c.repara_id = 513
  AND UPPER(TRIM(COALESCE(c.estatus, ''))) = 'LIQUIDADA'
  AND UPPER(TRIM(COALESCE(r.estatus, ''))) NOT IN ('ENTREGADO', 'ENTREGADA');
