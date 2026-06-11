-- COORDINADOR: acceso operativo completo pero sin eliminar ni administración avanzada.
-- Fusiona con permisos ya guardados (no borra el resto de claves personalizadas).

UPDATE public.role_permissions
SET
  permisos = permisos
    || '{
      "modulo.clientes": true,
      "modulo.servicios": true,
      "modulo.reparaciones": true,
      "modulo.inventarios": true,
      "modulo.catalogo_pagos": true,
      "modulo.corte_caja": true,
      "modulo.reportes": true,
      "modulo.monitor_ordenes": true,
      "modulo.administracion": true,
      "accion.reportes_fechas": true,
      "accion.corte_fechas": true,
      "accion.liquidar_cuentas": true,
      "accion.gestion_tecnicos": true,
      "accion.eliminar": false,
      "accion.cambiar_roles": false,
      "accion.configurar_permisos": false
    }'::jsonb,
  updated_at = now()
WHERE rol = 'COORDINADOR';

INSERT INTO public.role_permissions (rol, permisos)
SELECT
  'COORDINADOR',
  '{
    "modulo.clientes": true,
    "modulo.servicios": true,
    "modulo.reparaciones": true,
    "modulo.inventarios": true,
    "modulo.catalogo_pagos": true,
    "modulo.corte_caja": true,
    "modulo.reportes": true,
    "modulo.monitor_ordenes": true,
    "modulo.administracion": true,
    "accion.reportes_fechas": true,
    "accion.corte_fechas": true,
    "accion.liquidar_cuentas": true,
    "accion.gestion_tecnicos": true,
    "accion.eliminar": false,
    "accion.cambiar_roles": false,
    "accion.configurar_permisos": false
  }'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_permissions WHERE rol = 'COORDINADOR'
);
