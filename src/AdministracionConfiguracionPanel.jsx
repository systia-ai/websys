import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ETIQUETAS_ROL,
  GRUPOS_PERMISOS,
  PERMISOS_DEFECTO_POR_ROL,
  esRolAdmin,
  normalizarRolSistema,
  permisosEfectivosRol,
} from './permisosConfig.js'
import {
  ROLES_SISTEMA,
  cargarPermisosRolesServidor,
  guardarPermisosRolServidor,
  restablecerPermisosRolServidor,
  resumenPermisosActivos,
} from './permisosRolesApi.js'

const ROLES_EDITABLES = ROLES_SISTEMA.filter((r) => r !== 'ADMIN')

export default function AdministracionConfiguracionPanel({
  supabase,
  puedeConfigurar = false,
  onError,
  onNotice,
  onPermisosActualizados,
}) {
  const [rolEditando, setRolEditando] = useState('COORDINADOR')
  const [overridesPorRol, setOverridesPorRol] = useState(null)
  const [borrador, setBorrador] = useState(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const recargar = useCallback(async () => {
    setLoading(true)
    try {
      const data = await cargarPermisosRolesServidor(supabase)
      setOverridesPorRol(data ?? {})
    } catch (e) {
      onError?.(`No se pudieron cargar los permisos: ${e.message}`)
      setOverridesPorRol({})
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void recargar()
  }, [recargar])

  const permisosRolSeleccionado = useMemo(
    () => permisosEfectivosRol(rolEditando, overridesPorRol),
    [rolEditando, overridesPorRol],
  )

  useEffect(() => {
    setBorrador({ ...permisosRolSeleccionado })
  }, [rolEditando, permisosRolSeleccionado])

  const resumen = useMemo(() => resumenPermisosActivos(borrador ?? {}), [borrador])

  const hayCambios = useMemo(() => {
    if (!borrador) return false
    return GRUPOS_PERMISOS.some((g) =>
      g.permisos.some((p) => Boolean(borrador[p.clave]) !== Boolean(permisosRolSeleccionado[p.clave])),
    )
  }, [borrador, permisosRolSeleccionado])

  function togglePermiso(clave) {
    if (!puedeConfigurar || esRolAdmin(rolEditando)) return
    setBorrador((prev) => ({ ...prev, [clave]: !prev?.[clave] }))
  }

  async function guardarCambios() {
    if (!puedeConfigurar || !borrador) return
    setGuardando(true)
    try {
      const guardado = await guardarPermisosRolServidor(supabase, rolEditando, borrador)
      setOverridesPorRol((prev) => ({ ...(prev ?? {}), [normalizarRolSistema(rolEditando)]: guardado }))
      onPermisosActualizados?.()
      onNotice?.(`Permisos de ${ETIQUETAS_ROL[rolEditando] ?? rolEditando} guardados.`)
    } catch (e) {
      onError?.(`No se pudieron guardar los permisos: ${e.message}`)
    } finally {
      setGuardando(false)
    }
  }

  async function restablecerDefecto() {
    if (!puedeConfigurar || esRolAdmin(rolEditando)) return
    if (!confirm(`¿Restablecer los permisos por defecto de ${ETIQUETAS_ROL[rolEditando] ?? rolEditando}?`)) return
    setGuardando(true)
    try {
      const defecto = await restablecerPermisosRolServidor(supabase, rolEditando)
      setOverridesPorRol((prev) => ({ ...(prev ?? {}), [rolEditando]: defecto }))
      setBorrador({ ...defecto })
      onPermisosActualizados?.()
      onNotice?.('Permisos restablecidos al valor por defecto.')
    } catch (e) {
      onError?.(`No se pudo restablecer: ${e.message}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="card-pad administracion-config-panel">
      <header className="administracion-panel-head">
        <div>
          <h2>Configuración de permisos</h2>
          <p className="muted administracion-panel-help">
            Asigne o retire permisos por rol. <strong>ADMIN</strong> siempre tiene acceso total y no se puede
            modificar.
          </p>
        </div>
      </header>

      {!puedeConfigurar ? (
        <p className="administracion-config-solo-lectura" role="status">
          Solo lectura: su rol no puede modificar la configuración de permisos.
        </p>
      ) : null}

      <div className="administracion-config-rol-bar" role="tablist" aria-label="Rol a configurar">
        {ROLES_EDITABLES.map((rol) => (
          <button
            key={rol}
            type="button"
            role="tab"
            aria-selected={rolEditando === rol}
            className={`administracion-config-rol-tab administracion-config-rol-tab--${rol.toLowerCase()}${rolEditando === rol ? ' administracion-config-rol-tab--active' : ''}`}
            onClick={() => setRolEditando(rol)}
          >
            {ETIQUETAS_ROL[rol] ?? rol}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="muted center">Cargando permisos…</p>
      ) : (
        <>
          <p className="administracion-config-resumen muted">
            Rol: <strong>{ETIQUETAS_ROL[rolEditando] ?? rolEditando}</strong> · {resumen.activos} de{' '}
            {resumen.total} permisos activos
            {hayCambios ? ' · cambios sin guardar' : ''}
          </p>

          {GRUPOS_PERMISOS.map((grupo) => (
            <div key={grupo.id} className="administracion-config-grupo">
              <h3 className="administracion-config-grupo-titulo">{grupo.titulo}</h3>
              <ul className="administracion-config-lista">
                {grupo.permisos.map((p) => {
                  const activo = Boolean(borrador?.[p.clave])
                  return (
                    <li key={p.clave} className="administracion-config-item">
                      <label className="administracion-config-label">
                        <input
                          type="checkbox"
                          checked={activo}
                          disabled={!puedeConfigurar || guardando}
                          onChange={() => togglePermiso(p.clave)}
                        />
                        <span>{p.etiqueta}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}

          <div className="administracion-config-acciones">
            <button
              type="button"
              className="btn-primary"
              disabled={!puedeConfigurar || guardando || !hayCambios}
              onClick={() => void guardarCambios()}
            >
              {guardando ? 'Guardando…' : '💾 Guardar permisos'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!puedeConfigurar || guardando}
              onClick={() => void restablecerDefecto()}
            >
              ↺ Restablecer por defecto
            </button>
          </div>

          <details className="administracion-config-defecto">
            <summary>Ver permisos por defecto de {ETIQUETAS_ROL[rolEditando] ?? rolEditando}</summary>
            <ul className="administracion-config-defecto-lista">
              {GRUPOS_PERMISOS.flatMap((g) => g.permisos)
                .filter((p) => PERMISOS_DEFECTO_POR_ROL[rolEditando]?.[p.clave])
                .map((p) => (
                  <li key={p.clave}>{p.etiqueta}</li>
                ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}
