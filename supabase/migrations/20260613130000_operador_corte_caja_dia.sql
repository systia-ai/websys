-- OPERADOR: corte de caja del día (módulo sí, rango de fechas no).

UPDATE public.role_permissions
SET
  permisos = permisos
    || '{
      "modulo.corte_caja": true,
      "accion.corte_fechas": false
    }'::jsonb,
  updated_at = now()
WHERE rol = 'OPERADOR';

INSERT INTO public.role_permissions (rol, permisos)
SELECT
  'OPERADOR',
  '{
    "modulo.clientes": true,
    "modulo.servicios": true,
    "modulo.reparaciones": true,
    "modulo.catalogo_pagos": true,
    "modulo.corte_caja": true,
    "modulo.monitor_ordenes": true,
    "accion.liquidar_cuentas": true,
    "accion.eliminar": false,
    "accion.cambiar_roles": false,
    "accion.configurar_permisos": false,
    "accion.reportes_fechas": false,
    "accion.corte_fechas": false,
    "accion.gestion_tecnicos": false
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions WHERE rol = 'OPERADOR'
);
