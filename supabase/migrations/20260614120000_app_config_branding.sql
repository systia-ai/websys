-- Configuración de marca / apariencia de la app (white-label).

CREATE TABLE IF NOT EXISTS public.app_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_config_select_public ON public.app_config;
CREATE POLICY app_config_select_public
ON public.app_config
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS app_config_write_admin ON public.app_config;
CREATE POLICY app_config_write_admin
ON public.app_config
FOR ALL
TO authenticated
USING (public.es_admin_actual())
WITH CHECK (public.es_admin_actual());

INSERT INTO public.app_config (id, config)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.obtener_app_config()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ac.config FROM public.app_config ac WHERE ac.id = 1),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.obtener_app_config() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.guardar_app_config(p_config jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_admin_actual() THEN
    RAISE EXCEPTION 'No autorizado para configurar la aplicación'
      USING ERRCODE = '42501';
  END IF;

  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN
    RAISE EXCEPTION 'Configuración inválida'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.app_config (id, config, updated_by, updated_at)
  VALUES (1, p_config, auth.uid(), now())
  ON CONFLICT (id)
  DO UPDATE
    SET config = EXCLUDED.config,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();

  RETURN (SELECT config FROM public.app_config WHERE id = 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.guardar_app_config(jsonb) TO authenticated;

-- Bucket público para logo y banner personalizados
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'branding',
  'branding',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/jpg']::text[]
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS branding_select_public ON storage.objects;
CREATE POLICY branding_select_public
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'branding');

DROP POLICY IF EXISTS branding_insert_admin ON storage.objects;
CREATE POLICY branding_insert_admin
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'branding' AND public.es_admin_actual());

DROP POLICY IF EXISTS branding_update_admin ON storage.objects;
CREATE POLICY branding_update_admin
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'branding' AND public.es_admin_actual())
WITH CHECK (bucket_id = 'branding' AND public.es_admin_actual());

DROP POLICY IF EXISTS branding_delete_admin ON storage.objects;
CREATE POLICY branding_delete_admin
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'branding' AND public.es_admin_actual());
