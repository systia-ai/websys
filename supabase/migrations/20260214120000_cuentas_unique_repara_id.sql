-- Evita dos cuentas distintas apuntando a la misma orden de reparación (repara_id).
-- Si falla: en Table Editor borre duplicados (misma repara_id) y vuelva a aplicar la migración.
CREATE UNIQUE INDEX IF NOT EXISTS cuentas_unique_repara_id_not_null
  ON public.cuentas (repara_id)
  WHERE repara_id IS NOT NULL;
