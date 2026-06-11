import {
  APP_CONFIG_DEFECTO,
  guardarAppConfigLocal,
  leerAppConfigLocal,
  normalizarAppConfig,
} from './appConfig.js'

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/jpg']

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}

function validarImagen(file) {
  if (!file) throw new Error('No se seleccionó archivo')
  if (!TIPOS_IMAGEN.includes(file.type)) {
    throw new Error('Solo se permiten imágenes JPG o PNG')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('La imagen no debe superar 2 MB')
  }
}

/** Carga configuración de marca (Supabase o localStorage). */
export async function cargarAppConfigServidor(supabase) {
  if (!supabase) {
    return leerAppConfigLocal() ?? { ...APP_CONFIG_DEFECTO }
  }
  try {
    const { data, error } = await supabase.rpc('obtener_app_config')
    if (error) throw error
    return normalizarAppConfig(data ?? {})
  } catch {
    const local = leerAppConfigLocal()
    return local ?? { ...APP_CONFIG_DEFECTO }
  }
}

export async function guardarAppConfigServidor(supabase, config) {
  const payload = normalizarAppConfig(config)
  if (!supabase) {
    guardarAppConfigLocal(payload)
    return payload
  }
  const { data, error } = await supabase.rpc('guardar_app_config', { p_config: payload })
  if (error) throw error
  const guardado = normalizarAppConfig(data ?? payload)
  guardarAppConfigLocal(guardado)
  return guardado
}

/**
 * Sube logo, banner o logo de login.
 * @param {'logo'|'banner'|'login_logo'} tipo
 */
export async function subirImagenBranding(supabase, file, tipo) {
  validarImagen(file)
  const ext = file.type === 'image/png' ? 'png' : 'jpg'
  const nombre = `${tipo}.${ext}`

  if (!supabase) {
    return fileToDataUrl(file)
  }

  const { error } = await supabase.storage.from('branding').upload(nombre, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  })
  if (error) throw error

  const { data } = supabase.storage.from('branding').getPublicUrl(nombre)
  return `${data.publicUrl}?v=${Date.now()}`
}

/**
 * Quita una imagen personalizada del storage (si aplica) y devuelve null para la URL.
 * @param {'logo'|'banner'|'login_logo'} tipo
 */
export async function eliminarImagenBranding(supabase, tipo) {
  if (supabase) {
    const posibles = [`${tipo}.jpg`, `${tipo}.jpeg`, `${tipo}.png`]
    await supabase.storage.from('branding').remove(posibles)
  }
  return null
}

export async function restablecerAppConfigServidor(supabase) {
  return guardarAppConfigServidor(supabase, { ...APP_CONFIG_DEFECTO })
}
