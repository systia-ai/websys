-- Preferencias de apariencia por usuario (modo oscuro y colores).
-- La marca global (textos, logo, banner) sigue en app_config (solo ADMIN).

CREATE TABLE IF NOT EXISTS public.user_app_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_app_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_app_preferences_select_own ON public.user_app_preferences;
CREATE POLICY user_app_preferences_select_own
ON public.user_app_preferences
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_app_preferences_insert_own ON public.user_app_preferences;
CREATE POLICY user_app_preferences_insert_own
ON public.user_app_preferences
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_app_preferences_update_own ON public.user_app_preferences;
CREATE POLICY user_app_preferences_update_own
ON public.user_app_preferences
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_app_preferences_delete_own ON public.user_app_preferences;
CREATE POLICY user_app_preferences_delete_own
ON public.user_app_preferences
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.obtener_mis_preferencias_app()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT uap.preferencias FROM public.user_app_preferences uap WHERE uap.user_id = auth.uid()),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.obtener_mis_preferencias_app() TO authenticated;

CREATE OR REPLACE FUNCTION public.guardar_mis_preferencias_app(p_preferencias jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debe iniciar sesión'
      USING ERRCODE = '42501';
  END IF;

  IF p_preferencias IS NULL OR jsonb_typeof(p_preferencias) <> 'object' THEN
    RAISE EXCEPTION 'Preferencias inválidas'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_app_preferences (user_id, preferencias, updated_at)
  VALUES (v_uid, p_preferencias, now())
  ON CONFLICT (user_id)
  DO UPDATE
    SET preferencias = EXCLUDED.preferencias,
        updated_at = now();

  RETURN (SELECT preferencias FROM public.user_app_preferences WHERE user_id = v_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.guardar_mis_preferencias_app(jsonb) TO authenticated;
