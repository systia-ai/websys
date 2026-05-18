-- Marca órdenes registradas por error como duplicadas (mismo cliente/equipo/datos).
ALTER TABLE reparaciones
  ADD COLUMN IF NOT EXISTS es_orden_duplicada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN reparaciones.es_orden_duplicada IS 'True si la orden es un duplicado accidental; no cuenta en reportes operativos habituales.';
