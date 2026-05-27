import { useCallback, useEffect, useMemo, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { usePermisoEliminar } from './usePermisoEliminar.js'

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
  isAdmin = false,
  miRol = 'ADMIN',
}) {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [guardandoId, setGuardandoId] = useState(null)
  const { alertaPermiso, intentarEliminar, mostrarSinPermiso } = usePermisoEliminar(isAdmin)

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
        rol: String(u.rol ?? 'ADMIN').toUpperCase(),
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
    if (!isAdmin) {
      mostrarSinPermiso('Tu usuario no tiene permisos para cambiar roles.')
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

  async function quitarRolUsuario(userId) {
    if (!isAdmin) {
      mostrarSinPermiso()
      return
    }
    const fila = usuarios.find((u) => String(u.user_id) === String(userId))
    if (!fila) return
    if (String(fila.rol).toUpperCase() === 'ADMIN' && totalAdmins <= 1) {
      onError?.('No se puede borrar el último usuario ADMIN.')
      return
    }
    setGuardandoId(userId)
    try {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId)
      if (error) throw error
      setUsuarios((prev) => prev.map((u) => (String(u.user_id) === String(userId) ? { ...u, rol: 'ADMIN' } : u)))
      onNotice?.('Rol personalizado eliminado. Usuario queda como ADMIN (modo temporal).')
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

        <section className="card-pad administracion-panel">
          <header className="administracion-panel-head">
            <h2>Control de roles</h2>
            <p className="muted">
              Tu rol actual: <strong>{miRol}</strong>
            </p>
          </header>
          <p className="muted administracion-panel-help">
            ADMIN puede cambiar roles y borrar asignaciones de rol. TECNICO solo consulta.
          </p>
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
            syncDeps={[usuarios, loading, isAdmin]}
          >
            <table className="cuentas-cliente-tabla administracion-tabla">
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Creado</th>
                  <th>Último acceso</th>
                  <th>Acciones</th>
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
                        disabled={guardandoId === u.user_id}
                        className={`administracion-rol-select administracion-rol-select--${String(u.rol).toLowerCase()}`}
                      >
                        <option value="ADMIN">ADMIN</option>
                        <option value="TECNICO">TECNICO</option>
                      </select>
                    </td>
                    <td>{formatearFecha(u.created_at)}</td>
                    <td>{formatearFecha(u.last_sign_in_at)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon danger administracion-btn-borrar-rol"
                        onClick={() => intentarEliminar(() => void quitarRolUsuario(u.user_id))}
                        disabled={guardandoId === u.user_id}
                        title="Quitar rol personalizado (queda TECNICO)"
                        aria-label={`Quitar rol de ${u.email}`}
                      >
                        🗑️ Quitar rol
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScrollSuperior>
        )}
      </div>
    </div>
  )
}
