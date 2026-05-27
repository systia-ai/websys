import { useCallback, useEffect, useRef, useState } from 'react'
import { MENSAJE_SIN_PERMISO_ELIMINAR } from './permisosUtils.js'

/**
 * Bloquea acciones de eliminación para usuarios sin permiso (p. ej. TECNICO).
 * @param {boolean} puedeEliminar
 */
export function usePermisoEliminar(puedeEliminar = true) {
  const [alertaPermiso, setAlertaPermiso] = useState('')
  const timerRef = useRef(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const mostrarSinPermiso = useCallback((mensaje = MENSAJE_SIN_PERMISO_ELIMINAR) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setAlertaPermiso(mensaje)
    timerRef.current = setTimeout(() => setAlertaPermiso(''), 4500)
  }, [])

  /** Ejecuta `accion` solo si el usuario puede eliminar; si no, muestra alerta. */
  const intentarEliminar = useCallback(
    (accion) => {
      if (!puedeEliminar) {
        mostrarSinPermiso()
        return false
      }
      if (typeof accion === 'function') accion()
      return true
    },
    [puedeEliminar, mostrarSinPermiso],
  )

  return { alertaPermiso, intentarEliminar, mostrarSinPermiso, puedeEliminar }
}
