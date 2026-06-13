import { useCallback, useEffect, useMemo, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import { MENSAJE_SIN_PERMISO_CREAR_USUARIO } from './permisosUtils.js'
import { ETIQUETAS_ROL, ROLES_SISTEMA } from './permisosConfig.js'
import AdministracionConfiguracionTabs from './AdministracionConfiguracionTabs.jsx'
import { crearUsuarioAdmin } from './adminUsuariosApi.js'

function formatearFecha(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AdministracionModulo({
  supabase,
  onHome,
  onError,
  onNotice,
  miRol = 'ADMIN',
  puedeCambiarRoles = false,
  puedeConfigurarPermisos = false,
  puedeConfigurarSistema = false,
  onPermisosActualizados,
}) {
  const [seccion, setSeccion] = useState('usuarios')
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [guardandoId, setGuardandoId] = useState(null)
  const [creandoUsuario, setCreandoUsuario] = useState(false)
  const [nuevoEmail, setNuevoEmail] = useState('')
  const [nuevoPassword, setNuevoPassword] = useState('')
  const [nuevoPassword2, setNuevoPassword2] = useState('')
  const [nuevoRol, setNuevoRol] = useState('TECNICO')
  const [crearUsuarioExpandido, setCrearUsuarioExpandido] = useState(false)
  const { alertaPermiso, intentarEliminar, mostrarSinPermiso } = usePermisoEliminar(puedeCambiarRoles)

  const cargarUsuarios = useCallback(async () => {
    if (!supabase) {
      setUsuarios([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('listar_usuarios_con_roles')
      if (error) throw error
      const lista = (data ?? []).map((u) => ({
        user_id: u.user_id,
        email: u.email ?? '—',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        rol: String(u.rol ?? 'TECNICO').toUpperCase(),
      }))
      setUsuarios(lista)
    } catch (e) {
      onError?.(`Error al cargar usuarios de administración: ${e.message}`)
      setUsuarios([])
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarUsuarios()
  }, [cargarUsuarios])

  const totalAdmins = useMemo(
    () => usuarios.filter((u) => String(u.rol).toUpperCase() === 'ADMIN').length,
    [usuarios],
  )

  async function guardarRolUsuario(userId, rol) {
    if (!puedeCambiarRoles) {
      mostrarSinPermiso('Su usuario no tiene permisos para cambiar roles.')
      return
    }
    setGuardandoId(userId)
    try {
      const { error } = await supabase.rpc('asignar_rol_usuario', {
        p_user_id: userId,
        p_rol: rol,
      })
      if (error) throw error
      setUsuarios((prev) =>
        prev.map((u) => (String(u.user_id) === String(userId) ? { ...u, rol: String(rol).toUpperCase() } : u)),
      )
      onNotice?.(`Rol actualizado a ${String(rol).toUpperCase()}.`)
    } catch (e) {
      onError?.(`No se pudo actualizar el rol: ${e.message}`)
    } finally {
      setGuardandoId(null)
    }
  }

  async function crearNuevoUsuario(e) {
    e.preventDefault()
    if (!puedeCambiarRoles) {
      mostrarSinPermiso(MENSAJE_SIN_PERMISO_CREAR_USUARIO)
      return
    }
    const email = nuevoEmail.trim()
    if (!email) {
      onError?.('Ingrese el correo del nuevo usuario.')
      return
    }
    if (nuevoPassword.length < 6) {
      onError?.('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (nuevoPassword !== nuevoPassword2) {
      onError?.('Las contraseñas no coinciden.')
      return
    }
    setCreandoUsuario(true)
    try {
      const result = await crearUsuarioAdmin(supabase, {
        email,
        password: nuevoPassword,
        rol: nuevoRol,
      })
      if (!result.ok) {
        onError?.(result.errorMsg)
        return
      }
      setNuevoEmail('')
      setNuevoPassword('')
      setNuevoPassword2('')
      setNuevoRol('TECNICO')
      setCrearUsuarioExpandido(false)
      onNotice?.(`Usuario ${email} creado con rol ${nuevoRol}.`)
      await cargarUsuarios()
    } finally {
      setCreandoUsuario(false)
    }
  }

  function toggleCrearUsuario() {
    if (!puedeCambiarRoles) {
      mostrarSinPermiso(MENSAJE_SIN_PERMISO_CREAR_USUARIO)
      return
    }
    setCrearUsuarioExpandido((v) => !v)
  }

  async function quitarRolUsuario(userId) {
    if (!puedeCambiarRoles) {
      mostrarSinPermiso()
      return
    }
    const fila = usuarios.find((u) => String(u.user_id) === String(userId))
    if (!fila) return
    if (String(fila.rol).toUpperCase() === 'ADMIN' && totalAdmins <= 1) {
      onError?.('No se puede quitar el rol del último usuario ADMIN.')
      return
    }
    setGuardandoId(userId)
    try {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId)
      if (error) throw error
      setUsuarios((prev) =>
        prev.map((u) => (String(u.user_id) === String(userId) ? { ...u, rol: 'TECNICO' } : u)),
      )
      onNotice?.('Rol personalizado eliminado. Usuario queda como TECNICO.')
    } catch (e) {
      onError?.(`No se pudo borrar rol: ${e.message}`)
    } finally {
      setGuardandoId(null)
    }
  }

  return (
    <div className="servicios-root inventarios-root administracion-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">
            🛡️
          </span>
          Administración
        </h1>
        {onHome ? (
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
            Inicio
          </button>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <div className="servicios-body administracion-body">
        <AlertaPermiso mensaje={alertaPermiso} />

        <nav className="administracion-secciones" aria-label="Secciones de administración">
          <button
            type="button"
            className={`administracion-seccion-btn${seccion === 'usuarios' ? ' administracion-seccion-btn--active' : ''}`}
            onClick={() => setSeccion('usuarios')}
          >
            👥 Usuarios y roles
          </button>
          <button
            type="button"
            className={`administracion-seccion-btn${seccion === 'configuracion' ? ' administracion-seccion-btn--active' : ''}`}
            onClick={() => setSeccion('configuracion')}
          >
            ⚙️ Configuración
          </button>
        </nav>

        {seccion === 'usuarios' ? (
          <>
            <section className="card-pad administracion-panel">
              <header className="administracion-panel-head">
                <h2>Control de roles</h2>
                <p className="muted">
                  Tu rol: <strong>{ETIQUETAS_ROL[miRol] ?? miRol}</strong>
                </p>
              </header>
              <p className="muted administracion-panel-help">
                Roles: <strong>ADMIN</strong> (acceso total, incluye eliminar),{' '}
                <strong>COORDINADOR</strong> (todos los módulos como admin, sin eliminar registros ni cambiar
                roles/permisos), <strong>TECNICO</strong> y <strong>OPERADOR</strong> (acceso reducido). Los permisos
                detallados se configuran en la pestaña Configuración.
              </p>
            </section>

            <section className="card-pad administracion-crear-usuario" aria-label="Crear nuevo usuario">
              <button
                type="button"
                className="administracion-crear-usuario-toggle"
                onClick={toggleCrearUsuario}
                aria-expanded={crearUsuarioExpandido && puedeCambiarRoles}
                aria-controls="administracion-crear-usuario-panel"
              >
                <span className="administracion-crear-usuario-toggle-titulo">
                  <span className="administracion-crear-usuario-icon" aria-hidden="true">
                    ➕
                  </span>
                  Crear nuevo usuario
                </span>
                <span className="administracion-crear-usuario-resumen muted">
                  {puedeCambiarRoles ? 'Solo administrador' : 'Restringido'}
                </span>
                <span className="administracion-crear-usuario-chevron" aria-hidden="true">
                  {crearUsuarioExpandido && puedeCambiarRoles ? '▲' : '▼'}
                </span>
              </button>

              {crearUsuarioExpandido && puedeCambiarRoles ? (
                <div id="administracion-crear-usuario-panel" className="administracion-crear-usuario-body">
                  {!supabase ? (
                    <p className="warn-inline">Sin Supabase no se pueden crear usuarios desde aquí.</p>
                  ) : (
                    <form className="administracion-crear-usuario-form" onSubmit={(e) => void crearNuevoUsuario(e)}>
                      <label className="administracion-crear-usuario-campo">
                        <span>Correo</span>
                        <input
                          type="email"
                          value={nuevoEmail}
                          onChange={(e) => setNuevoEmail(e.target.value)}
                          placeholder="usuario@ejemplo.com"
                          autoComplete="off"
                          disabled={creandoUsuario}
                          required
                        />
                      </label>
                      <label className="administracion-crear-usuario-campo">
                        <span>Contraseña</span>
                        <input
                          type="password"
                          value={nuevoPassword}
                          onChange={(e) => setNuevoPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          autoComplete="new-password"
                          disabled={creandoUsuario}
                          required
                          minLength={6}
                        />
                      </label>
                      <label className="administracion-crear-usuario-campo">
                        <span>Confirmar contraseña</span>
                        <input
                          type="password"
                          value={nuevoPassword2}
                          onChange={(e) => setNuevoPassword2(e.target.value)}
                          placeholder="Repita la contraseña"
                          autoComplete="new-password"
                          disabled={creandoUsuario}
                          required
                          minLength={6}
                        />
                      </label>
                      <label className="administracion-crear-usuario-campo">
                        <span>Rol inicial</span>
                        <select
                          value={nuevoRol}
                          onChange={(e) => setNuevoRol(e.target.value)}
                          disabled={creandoUsuario}
                          className={`administracion-rol-select administracion-rol-select--${String(nuevoRol).toLowerCase()}`}
                        >
                          {ROLES_SISTEMA.map((r) => (
                            <option key={r} value={r}>
                              {ETIQUETAS_ROL[r] ?? r}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="submit" className="btn-primary" disabled={creandoUsuario}>
                        {creandoUsuario ? 'Creando…' : '➕ Crear usuario'}
                      </button>
                    </form>
                  )}
                </div>
              ) : null}
            </section>

            {loading ? (
              <p className="muted center">Cargando usuarios…</p>
            ) : usuarios.length === 0 ? (
              <div className="empty-card">
                <p>No se encontraron usuarios registrados.</p>
              </div>
            ) : (
              <TablaScrollSuperior
                ariaLabel="Usuarios y roles"
                classNameWrap="cuentas-cliente-tabla-wrap administracion-tabla-wrap"
                showHint={false}
                syncDeps={[usuarios, loading, puedeCambiarRoles]}
              >
                <table className="cuentas-cliente-tabla administracion-tabla">
                  <thead>
                    <tr>
                      <th>Correo</th>
                      <th>Rol</th>
                      <th>Creado</th>
                      <th>Último acceso</th>
                      {puedeCambiarRoles ? <th>Acciones</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.user_id}>
                        <td>{u.email}</td>
                        <td>
                          <select
                            value={u.rol}
                            onChange={(e) => void guardarRolUsuario(u.user_id, e.target.value)}
                            disabled={guardandoId === u.user_id || !puedeCambiarRoles}
                            className={`administracion-rol-select administracion-rol-select--${String(u.rol).toLowerCase()}`}
                          >
                            {ROLES_SISTEMA.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{formatearFecha(u.created_at)}</td>
                        <td>{formatearFecha(u.last_sign_in_at)}</td>
                        {puedeCambiarRoles ? (
                          <td className="administracion-tabla-acciones">
                            <button
                              type="button"
                              className="administracion-btn-borrar-rol"
                              onClick={() => intentarEliminar(() => void quitarRolUsuario(u.user_id))}
                              disabled={guardandoId === u.user_id}
                              title="Quitar rol personalizado (queda TECNICO)"
                              aria-label={`Quitar rol de ${u.email}`}
                            >
                              <span className="administracion-btn-borrar-rol-icon" aria-hidden="true">
                                🗑️
                              </span>
                              <span>Quitar rol</span>
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablaScrollSuperior>
            )}
          </>
        ) : (
          <AdministracionConfiguracionTabs
            supabase={supabase}
            puedeConfigurarPermisos={puedeConfigurarPermisos}
            puedeConfigurarSistema={puedeConfigurarSistema}
            onError={onError}
            onNotice={onNotice}
            onPermisosActualizados={onPermisosActualizados}
          />
        )}
      </div>
    </div>
  )
}
