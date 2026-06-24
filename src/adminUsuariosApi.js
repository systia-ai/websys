import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'

async function mensajeErrorInvoke(error) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json()
      if (payload && typeof payload === 'object' && payload.error) {
        return String(payload.error)
      }
    } catch {
      /* respuesta no JSON */
    }
    return error.message || 'Error en la función del servidor.'
  }
  if (error instanceof FunctionsRelayError) {
    return error.message || 'Error de relay al invocar la función.'
  }
  if (error instanceof FunctionsFetchError) {
    return error.message || 'No se pudo conectar con el servidor (red o función no desplegada).'
  }
  return error?.message ?? 'Error al invocar la función.'
}

function humanizarErrorCrearUsuario(errorMsg) {
  const m = String(errorMsg ?? '').toLowerCase()
  if (m.includes('not desplegada') || m.includes('failed to fetch') || m.includes('404')) {
    return 'La función de creación de usuarios no está disponible. Despliegue la Edge Function crear-usuario en Supabase.'
  }
  if (m.includes('solo administradores')) {
    return 'Solo administradores pueden crear usuarios.'
  }
  if (m.includes('ya existe')) {
    return 'Ya existe un usuario con ese correo.'
  }
  return String(errorMsg ?? 'No se pudo crear el usuario.')
}

/**
 * Crea un usuario en Supabase Auth y le asigna rol en user_roles (solo ADMIN).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ email: string, password: string, rol: string }} params
 */
export async function crearUsuarioAdmin(supabase, { email, password, rol }) {
  if (!supabase) {
    return { ok: false, errorMsg: 'Supabase no está configurado.' }
  }

  const { data, error } = await supabase.functions.invoke('crear-usuario', {
    body: {
      email: String(email ?? '').trim().toLowerCase(),
      password: String(password ?? ''),
      rol: String(rol ?? 'TECNICO').trim().toUpperCase(),
    },
  })

  if (error) {
    const msg = await mensajeErrorInvoke(error)
    return { ok: false, errorMsg: humanizarErrorCrearUsuario(msg) }
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { ok: false, errorMsg: humanizarErrorCrearUsuario(String(data.error)) }
  }

  return { ok: true, data }
}

function humanizarErrorEliminarUsuario(errorMsg) {
  const m = String(errorMsg ?? '').toLowerCase()
  if (m.includes('not desplegada') || m.includes('failed to fetch') || m.includes('404')) {
    return 'La función de eliminación de usuarios no está disponible. Despliegue la Edge Function eliminar-usuario en Supabase.'
  }
  if (m.includes('solo administradores')) {
    return 'Solo administradores pueden eliminar usuarios.'
  }
  if (m.includes('último usuario admin') || m.includes('ultimo usuario admin')) {
    return 'No se puede eliminar el último usuario ADMIN.'
  }
  if (m.includes('propio usuario')) {
    return 'No puede eliminar su propio usuario.'
  }
  return String(errorMsg ?? 'No se pudo eliminar el usuario.')
}

/**
 * Elimina un usuario de Supabase Auth (solo ADMIN).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ userId: string }} params
 */
export async function eliminarUsuarioAdmin(supabase, { userId }) {
  if (!supabase) {
    return { ok: false, errorMsg: 'Supabase no está configurado.' }
  }

  const id = String(userId ?? '').trim()
  if (!id) {
    return { ok: false, errorMsg: 'Usuario no válido.' }
  }

  const { data, error } = await supabase.functions.invoke('eliminar-usuario', {
    body: { user_id: id },
  })

  if (error) {
    const msg = await mensajeErrorInvoke(error)
    return { ok: false, errorMsg: humanizarErrorEliminarUsuario(msg) }
  }

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    return { ok: false, errorMsg: humanizarErrorEliminarUsuario(String(data.error)) }
  }

  return { ok: true, data }
}
