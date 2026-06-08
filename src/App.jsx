import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { normalizeClienteRow } from './clienteUtils.js'
import ServiciosEquipos from './ServiciosEquipos.jsx'
import ClientesModulo from './ClientesModulo.jsx'
import OrdenServicioModulo from './OrdenServicioModulo.jsx'
import VentasCuentaScreen from './VentasCuentaScreen.jsx'
import InventariosModulo from './InventariosModulo.jsx'
import CatalogoPagosModulo from './CatalogoPagosModulo.jsx'
import CorteCajaModulo from './CorteCajaModulo.jsx'
import ReportesModulo from './ReportesModulo.jsx'
import MonitorOrdenesModulo from './MonitorOrdenesModulo.jsx'
import AdministracionModulo from './AdministracionModulo.jsx'
import HomeModuleIcon from './HomeModuleIcon.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import AlertaPermiso from './AlertaPermiso.jsx'
import { esRolAdmin, rolDesdeFilaUserRoles } from './permisosUtils.js'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import { limpiarFiltrosMonitorSesion } from './monitorOrdenesFiltrosSesion.js'

const modules = [
  { key: 'clientes', title: 'Clientes', table: 'clientes', fields: ['nombre', 'telefono', 'domicilio', 'correo'] },
  { key: 'servicios', title: 'Servicios (Equipos)', table: 'equipos', fields: ['serie', 'tipo_equipo', 'descripcion', 'tipo_reparacion', 'cliente_id'] },
  { key: 'reparaciones', title: 'Orden de servicio', table: 'reparaciones', fields: ['equipo_id', 'cliente_id', 'tecnico', 'estatus', 'descripcion_equipo', 'problemas_reportados', 'niveles_tinta', 'descripcion_solucion', 'bitacora', 'verificado_entrega', 'fecha_verificacion_entrega', 'pago', 'costo_reparacion', 'tipo_reparacion'] },
]

/** Tarjetas del inicio: módulos CRUD + pantallas dedicadas. */
const homeMenuItems = [
  ...modules,
  { key: 'inventarios', title: 'Inventarios', table: 'productos' },
  { key: 'catalogo_pagos', title: 'Catalogo de Pagos', table: 'catalogopagos' },
  { key: 'corte_caja', title: 'Corte de Caja', table: 'pagosclientes' },
  { key: 'reportes', title: 'Reportes', table: 'reparaciones' },
  { key: 'monitor_ordenes', title: 'MONITOR de ORDENES', table: 'reparaciones' },
  { key: 'administracion', title: 'Administración', table: 'user_roles' },
]

function App() {
  const { supabase, user, signOut, requiresAuth } = useAuth()
  const [activeModule, setActiveModule] = useState('home')
  /** Cliente elegido en el módulo Clientes para preasignar en Servicios (equipos), como `savedStateHandle` en Android. */
  const [clienteVinculoServicios, setClienteVinculoServicios] = useState(null)
  const [repSession, setRepSession] = useState(null)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [notice, setNotice] = useState('')
  /** Desde ClientesModulo → pantalla Cuentas (VentasScreen.kt). */
  const [ventasContext, setVentasContext] = useState(null)
  /** Al volver de Ventas → Clientes, reabrir el modal Servicio / Cuentas del mismo cliente. */
  const [clientesRetornoVentas, setClientesRetornoVentas] = useState(null)
  /** Al volver de Orden de servicio → Clientes, reabrir la lista de órdenes del mismo cliente. */
  const [clientesRetornoOrdenes, setClientesRetornoOrdenes] = useState(null)
  /** Al volver de Orden de servicio → Equipos, reabrir modal Reparaciones del equipo. */
  const [serviciosRetornoReparaciones, setServiciosRetornoReparaciones] = useState(null)
  /** Al volver de Ventas → Monitor, reabrir modal Orden / Cuenta de la misma orden. */
  const [monitorRetornoVentas, setMonitorRetornoVentas] = useState(null)
  const [rolUsuario, setRolUsuario] = useState('ADMIN')
  const [rolesReady, setRolesReady] = useState(false)

  const limpiarRetornoVentasClientes = useCallback(() => {
    setClientesRetornoVentas(null)
  }, [])

  const limpiarRetornoOrdenesClientes = useCallback(() => {
    setClientesRetornoOrdenes(null)
  }, [])

  const limpiarRetornoServiciosReparaciones = useCallback(() => {
    setServiciosRetornoReparaciones(null)
  }, [])

  const limpiarRetornoVentasMonitor = useCallback(() => {
    setMonitorRetornoVentas(null)
  }, [])
  const activeModuleRef = useRef(activeModule)
  /** Historial de pantallas para «atrás» / salir (no siempre inicio). */
  const navStackRef = useRef(['home'])

  useEffect(() => {
    activeModuleRef.current = activeModule
  }, [activeModule])

  useEffect(() => {
    let cancelado = false
    async function cargarRolUsuario() {
      if (!supabase || !user?.id) {
        if (!cancelado) {
          setRolUsuario('ADMIN')
          setRolesReady(true)
        }
        return
      }
      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('rol')
          .eq('user_id', user.id)
          .maybeSingle()
        if (error) throw error
        if (!cancelado) setRolUsuario(rolDesdeFilaUserRoles(data))
      } catch (e) {
        const msg = String(e?.message ?? '')
        if (/relation .*user_roles.* does not exist/i.test(msg)) {
          if (!cancelado) setRolUsuario('ADMIN')
        } else {
          if (!cancelado) setRolUsuario('TECNICO')
          setError(`No se pudo verificar rol de usuario: ${msg}`)
          setTimeout(() => setError(''), 6000)
        }
      } finally {
        if (!cancelado) setRolesReady(true)
      }
    }
    setRolesReady(false)
    void cargarRolUsuario()
    return () => {
      cancelado = true
    }
  }, [supabase, user?.id])

  const esAdmin = esRolAdmin(rolUsuario)
  const puedeEliminar = esAdmin
  const { alertaPermiso: alertaPermisoApp, intentarEliminar: intentarEliminarApp } =
    usePermisoEliminar(puedeEliminar)

  function navigateTo(nextKey) {
    if (nextKey === 'home') {
      navStackRef.current = ['home']
      setRepSession(null)
      setVentasContext(null)
      setClienteVinculoServicios(null)
      setClientesRetornoVentas(null)
      setClientesRetornoOrdenes(null)
      setServiciosRetornoReparaciones(null)
      setMonitorRetornoVentas(null)
      limpiarFiltrosMonitorSesion()
      setActiveModule('home')
      setNotice('')
      return
    }
    const cur = activeModuleRef.current
    if (cur === nextKey) {
      setActiveModule(nextKey)
      return
    }
    const stack = navStackRef.current
    const existingIdx = stack.lastIndexOf(nextKey)
    if (existingIdx >= 0) {
      navStackRef.current = stack.slice(0, existingIdx + 1)
      setActiveModule(nextKey)
      return
    }
    navStackRef.current = [...stack, nextKey]
    setActiveModule(nextKey)
  }

  function goBack() {
    const leaving = activeModuleRef.current
    const stack = navStackRef.current
    if (stack.length <= 1) {
      navigateTo('home')
      return
    }
    if (stack[stack.length - 1] === leaving) {
      navStackRef.current = stack.slice(0, -1)
    } else {
      const idx = stack.lastIndexOf(leaving)
      navStackRef.current = idx >= 0 ? stack.slice(0, idx) : stack.slice(0, -1)
    }
    const nextStack = navStackRef.current
    const target = nextStack[nextStack.length - 1] ?? 'home'
    if (leaving === 'reparaciones') setRepSession(null)
    if (leaving === 'monitor_ordenes') limpiarFiltrosMonitorSesion()
    if (leaving === 'ventas') {
      const vctx = ventasContext
      setVentasContext(null)
      if (vctx?.returnTo === 'reparaciones' && vctx?.repSessionRestore != null) {
        setRepSession({ ...vctx.repSessionRestore, _recargarOrden: Date.now() })
      }
      if (vctx?.returnTo === 'clientes' && vctx?.cliente) {
        setClientesRetornoVentas({
          openAccionesModal: true,
          cliente: normalizeClienteRow(vctx.cliente),
          reopenCuentasPanel: true,
        })
      }
      if (vctx?.returnTo === 'monitor_ordenes' && vctx?.monitorReparacionId != null) {
        setMonitorRetornoVentas({
          openSelectorAccion: true,
          reparacionId: vctx.monitorReparacionId,
        })
      }
    }
    if (leaving === 'servicios') setClienteVinculoServicios(null)
    setActiveModule(target)
    setNotice('')
  }

  function openReparacionesFromServicios(payload) {
    const raw = payload ?? {}
    let session = raw
    if (raw && typeof raw === 'object' && raw.returnToClientesOrdenes != null) {
      const { returnToClientesOrdenes, ...rest } = raw
      setClientesRetornoVentas({
        openAccionesModal: true,
        cliente: normalizeClienteRow(returnToClientesOrdenes),
      })
      session = rest
    }
    if (raw && typeof raw === 'object' && raw.returnToServiciosEquipo != null) {
      const { returnToServiciosEquipo, ...rest } = session
      setServiciosRetornoReparaciones({
        openModalReparaciones: true,
        equipo: returnToServiciosEquipo,
      })
      session = rest
    }
    setRepSession({ ...session, _fromSearch: false })
    setError('')
    navigateTo('reparaciones')
  }

  const current = modules.find((m) => m.key === activeModule)
  const filteredRows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    if (
      !current ||
      activeModule === 'servicios' ||
      activeModule === 'reparaciones' ||
      activeModule === 'clientes' ||
      activeModule === 'administracion'
    )
      return
    if (activeModule === 'ventas' && ventasContext) return
    loadRows()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recarga al cambiar de módulo (tablas genéricas)
  }, [activeModule, ventasContext])

  async function loadRows() {
    if (!current) return
    setLoading(true)
    setError('')
    try {
      if (supabase) {
        const { data, error: queryError } = await supabase.from(current.table).select('*').order('id', { ascending: false })
        if (queryError) throw queryError
        setRows(data ?? [])
      } else {
        const key = `sistefix_local_${current.table}`
        setRows(JSON.parse(localStorage.getItem(key) ?? '[]'))
      }
    } catch (err) {
      setError(`Error al cargar ${current.title}: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  async function onSave(e) {
    e.preventDefault()
    if (!current) return
    try {
      if (supabase) {
        if (editingId) {
          const { error: updateError } = await supabase.from(current.table).update(formData).eq('id', editingId)
          if (updateError) throw updateError
          setNotice('Registro actualizado')
        } else {
          const { error: insertError } = await supabase.from(current.table).insert(formData)
          if (insertError) throw insertError
          setNotice('Registro creado')
        }
      } else {
        const key = `sistefix_local_${current.table}`
        const existing = JSON.parse(localStorage.getItem(key) ?? '[]')
        if (editingId) {
          const updated = existing.map((item) => (item.id === editingId ? { ...item, ...formData } : item))
          localStorage.setItem(key, JSON.stringify(updated))
        } else {
          const next = [{ id: Date.now(), ...formData }, ...existing]
          localStorage.setItem(key, JSON.stringify(next))
        }
      }
      setFormData({})
      setEditingId(null)
      await loadRows()
    } catch (err) {
      setError(`Error al guardar: ${err.message}`)
    }
  }

  async function onDelete(id) {
    if (!current) return
    if (!puedeEliminar) {
      intentarEliminarApp()
      return
    }
    if (!confirm('Deseas eliminar este registro?')) return
    try {
      if (supabase) {
        const { error: deleteError } = await supabase.from(current.table).delete().eq('id', id)
        if (deleteError) throw deleteError
      } else {
        const key = `sistefix_local_${current.table}`
        const existing = JSON.parse(localStorage.getItem(key) ?? '[]')
        localStorage.setItem(key, JSON.stringify(existing.filter((item) => item.id !== id)))
      }
      await loadRows()
    } catch (err) {
      setError(`Error al eliminar: ${err.message}`)
    }
  }

  function onEdit(row) {
    setEditingId(row.id)
    const values = {}
    current.fields.forEach((field) => {
      values[field] = row[field] ?? ''
    })
    setFormData(values)
  }

  function renderHome() {
    return (
      <div className="home-page-shell">
        <div className="home-page-bg" aria-hidden />
        <div className="home-page-inner">
          <header className="header home-header">
            <div className="home-header-brand">
              <img
                className="home-logo-sistebit"
                src={`${import.meta.env.BASE_URL}assets/sistebit-logo.png`}
                alt="Sistebit"
                decoding="async"
                fetchPriority="high"
              />
              <div className="home-header-text">
                <h1>Sistefix Web</h1>
                <p>Centro de Servicio EPSON · Sistema de gestión integral</p>
              </div>
            </div>
            {requiresAuth && user ? (
              <div className="home-header-session">
                <span className="home-header-user" title={user.email}>
                  <span className="home-header-user-emoji" aria-hidden="true">
                    👤
                  </span>
                  <span className="home-header-user-email">{user.email}</span>
                </span>
                <span className={`home-header-role home-header-role--${String(rolUsuario).toLowerCase()}`}>
                  Rol: {rolUsuario}
                </span>
                <button type="button" className="home-header-signout" onClick={() => signOut()}>
                  Cerrar sesión
                </button>
              </div>
            ) : null}
          </header>
          <section className="grid home-menu-grid">
          {homeMenuItems.map((m) => (
            <button
              key={m.key}
              type="button"
              className="card home-menu-card"
              onClick={() => navigateTo(m.key)}
            >
              <span className="home-menu-card-icon">
                <HomeModuleIcon moduleKey={m.key} />
              </span>
              <h3 className="home-menu-card-title">{m.title}</h3>
            </button>
          ))}
          </section>
          <p className="home-photo-credit">
            Logotipo:{' '}
            <a href="https://www.sistebit.com" target="_blank" rel="noopener noreferrer">
              sistebit.com
            </a>
          </p>
        </div>
      </div>
    )
  }

  if (activeModule === 'home') return renderHome()

  if (!rolesReady) {
    return (
      <main className="module">
        <p className="muted center">Verificando permisos…</p>
      </main>
    )
  }

  if (activeModule === 'clientes') {
    return (
      <ClientesModulo
        supabase={supabase}
        retornoVentas={clientesRetornoVentas}
        onRetornoVentasConsumido={limpiarRetornoVentasClientes}
        retornoOrdenes={clientesRetornoOrdenes}
        onRetornoOrdenesConsumido={limpiarRetornoOrdenesClientes}
        onHome={goBack}
        onOpenServiciosConCliente={(row) => {
          const c = normalizeClienteRow(row)
          if (c?.id != null) {
            setClientesRetornoVentas({ openAccionesModal: true, cliente: c })
          }
          setClienteVinculoServicios(c)
          navigateTo('servicios')
          setNotice(`Cliente "${c.nombre || c.id || '—'}" vinculado a Equipos`)
          setTimeout(() => setNotice(''), 4000)
        }}
        onOpenReparaciones={openReparacionesFromServicios}
        onIrEquipos={() => navigateTo('servicios')}
        onIrAOrdenServicio={() => {
          setRepSession(null)
          navigateTo('reparaciones')
        }}
        onOpenVentas={(boot) => {
          const cli = boot?.cliente ? normalizeClienteRow(boot.cliente) : null
          if (cli?.id != null) {
            setClientesRetornoVentas({ openAccionesModal: true, cliente: cli })
          }
          setVentasContext({ ...boot, returnTo: 'clientes' })
          navigateTo('ventas')
        }}
        onError={(msg) => {
          setError(msg)
          setTimeout(() => setError(''), 6000)
        }}
        onNotice={(msg) => {
          setNotice(msg)
          setTimeout(() => setNotice(''), 4000)
        }}
      />
    )
  }

  if (activeModule === 'inventarios') {
    return (
      <main className="module inventarios-module-wrap">
        {!supabase && <p className="warning">Modo local: datos en navegador; defina variables Supabase para producción.</p>}
        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        <InventariosModulo
          supabase={supabase}
          puedeEliminar={puedeEliminar}
          onHome={goBack}
          onError={(msg) => {
            setError(msg)
            setTimeout(() => setError(''), 6000)
          }}
          onNotice={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 4000)
          }}
        />
      </main>
    )
  }

  if (activeModule === 'catalogo_pagos') {
    return (
      <main className="module catalogo-pagos-module-wrap">
        {!supabase && <p className="warning">Modo local: datos en navegador; defina variables Supabase para producción.</p>}
        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        <CatalogoPagosModulo
          supabase={supabase}
          puedeEliminar={puedeEliminar}
          onHome={goBack}
          onError={(msg) => {
            setError(msg)
            setTimeout(() => setError(''), 6000)
          }}
          onNotice={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 4000)
          }}
        />
      </main>
    )
  }

  if (activeModule === 'corte_caja') {
    return (
      <main className="module corte-caja-module-wrap">
        {!supabase && <p className="warning">Modo local: datos en navegador; defina variables Supabase para producción.</p>}
        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        <CorteCajaModulo
          supabase={supabase}
          esAdmin={esAdmin}
          onHome={goBack}
          onError={(msg) => {
            setError(msg)
            setTimeout(() => setError(''), 6000)
          }}
          onNotice={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 4000)
          }}
        />
      </main>
    )
  }

  if (activeModule === 'reportes') {
    return (
      <main className="module reportes-module-wrap">
        {!supabase && <p className="warning">Modo local: datos en navegador; defina variables Supabase para producción.</p>}
        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        <ReportesModulo
          supabase={supabase}
          esAdmin={esAdmin}
          onHome={goBack}
          onError={(msg) => {
            setError(msg)
            setTimeout(() => setError(''), 6000)
          }}
          onNotice={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 4000)
          }}
        />
      </main>
    )
  }

  if (activeModule === 'monitor_ordenes') {
    return (
      <main className="module monitor-ordenes-module-wrap">
        {!supabase && <p className="warning">Modo local: datos en navegador; defina variables Supabase para producción.</p>}
        {error && <p className="error">{error}</p>}
        <MonitorOrdenesModulo
          supabase={supabase}
          puedeEliminar={puedeEliminar}
          retornoVentas={monitorRetornoVentas}
          onRetornoVentasConsumido={limpiarRetornoVentasMonitor}
          onHome={goBack}
          onError={(msg) => {
            setError(msg)
            setTimeout(() => setError(''), 6000)
          }}
          onNotice={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 4000)
          }}
          onEditarOrden={(payload) => openReparacionesFromServicios(payload)}
          onAbrirCuenta={(boot) => {
            setVentasContext({ ...boot, returnTo: 'monitor_ordenes' })
            navigateTo('ventas')
          }}
        />
      </main>
    )
  }

  if (activeModule === 'administracion') {
    return (
      <main className="module administracion-module-wrap">
        {!supabase && (
          <p className="warning">Modo local: la administración de roles requiere Supabase configurado.</p>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        <AdministracionModulo
          supabase={supabase}
          onHome={goBack}
          isAdmin={esAdmin}
          miRol={rolUsuario}
          onError={(msg) => {
            setError(msg)
            setTimeout(() => setError(''), 6000)
          }}
          onNotice={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 4000)
          }}
        />
      </main>
    )
  }

  if (activeModule === 'servicios') {
    return (
      <ServiciosEquipos
        supabase={supabase}
        puedeEliminar={puedeEliminar}
        clienteDesdeClientes={clienteVinculoServicios}
        onConsumeClienteVinculo={() => setClienteVinculoServicios(null)}
        retornoReparaciones={serviciosRetornoReparaciones}
        onRetornoReparacionesConsumido={limpiarRetornoServiciosReparaciones}
        onHome={goBack}
        onIrAClientes={() => navigateTo('clientes')}
        onIrAOrdenServicio={() => {
          setRepSession(null)
          navigateTo('reparaciones')
        }}
        onOpenReparaciones={openReparacionesFromServicios}
        onError={(msg) => {
          setError(msg)
          setTimeout(() => setError(''), 6000)
        }}
        onNotice={(msg) => {
          setNotice(msg)
          setTimeout(() => setNotice(''), 4000)
        }}
      />
    )
  }

  if (activeModule === 'reparaciones') {
    return (
      <OrdenServicioModulo
        supabase={supabase}
        puedeEliminar={puedeEliminar}
        session={repSession ?? {}}
        error={error}
        notice={notice}
        onHome={goBack}
        onIrEquipos={() => navigateTo('servicios')}
        onIrClientes={() => navigateTo('clientes')}
        onSeleccionarOrdenDesdeBusqueda={(payload) => setRepSession({ ...payload, _fromSearch: true })}
        onClearOrdenSession={() => setRepSession(null)}
        onSalir={goBack}
        onIrCuentaCliente={(boot) => {
          setVentasContext({
            ...boot,
            returnTo: 'reparaciones',
            repSessionRestore: repSession ?? {},
          })
          navigateTo('ventas')
        }}
        onError={(msg) => {
          setError(msg)
          setTimeout(() => setError(''), 6000)
        }}
        onNotice={(msg) => {
          setNotice(msg)
          setTimeout(() => setNotice(''), 4000)
        }}
      />
    )
  }

  if (activeModule === 'ventas' && ventasContext) {
    return (
      <main className="module ventas-cuenta-module">
        {!supabase && <p className="warning">Modo local: datos en navegador; defina variables Supabase para producción.</p>}
        {error && <p className="error">{error}</p>}
        {notice && <p className="ok">{notice}</p>}
        <VentasCuentaScreen
          supabase={supabase}
          puedeEliminar={puedeEliminar}
          context={ventasContext}
          onSalir={goBack}
          onError={(msg) => {
            setError(msg)
            setTimeout(() => setError(''), 6000)
          }}
          onNotice={(msg) => {
            setNotice(msg)
            setTimeout(() => setNotice(''), 4000)
          }}
        />
      </main>
    )
  }

  if (activeModule === 'ventas' && !ventasContext) {
    return (
      <main className="module">
        <div className="toolbar">
          <button type="button" onClick={goBack}>
            Atrás
          </button>
          <h2>Ventas / Cuentas</h2>
        </div>
        <p className="warning">Las cuentas se abren desde el módulo Clientes.</p>
        <button type="button" onClick={() => navigateTo('clientes')}>
          Ir a Clientes
        </button>
      </main>
    )
  }

  return (
    <main className="module">
      <AlertaPermiso mensaje={alertaPermisoApp} />
      <div className="toolbar">
        <button type="button" onClick={goBack}>
          Atrás
        </button>
        <h2>{current.title}</h2>
      </div>
      {!supabase && <p className="warning">Modo local: defina `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para usar Supabase real.</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok">{notice}</p>}
      <form className="form" onSubmit={onSave}>
            {current.fields.map((field) => (
              <label key={field}>
                <span>{field}</span>
                <input
                  value={formData[field] ?? ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, [field]: e.target.value }))}
                  placeholder={`Captura ${field}`}
                />
              </label>
            ))}
            <div className="actions">
              <button type="submit">{editingId ? 'Actualizar' : 'Guardar'}</button>
              <button
                type="button"
                onClick={() => {
                  setFormData({})
                  setEditingId(null)
                }}
              >
                Limpiar
              </button>
            </div>
          </form>
          <div className="search">
            <input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button type="button" onClick={loadRows}>
              {loading ? 'Cargando...' : 'Recargar'}
            </button>
          </div>
          <TablaScrollSuperior
            ariaLabel={`Tabla ${current.title}`}
            classNameWrap="table-wrap"
            syncDeps={[filteredRows, activeModule]}
          >
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  {current.fields.map((f) => (
                    <th key={f}>{f}</th>
                  ))}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cuentas-cliente-tabla-fila cuentas-cliente-tabla-fila--clic"
                    role="button"
                    tabIndex={0}
                    title={`Editar registro #${row.id}`}
                    onClick={() => onEdit(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onEdit(row)
                      }
                    }}
                  >
                    <td>{row.id}</td>
                    {current.fields.map((f) => (
                      <td key={f}>{String(row[f] ?? '')}</td>
                    ))}
                    <td className="row-actions">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEdit(row)
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDelete(row.id)
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={current.fields.length + 2}>Sin registros</td>
                  </tr>
                )}
              </tbody>
            </table>
          </TablaScrollSuperior>
    </main>
  )
}

export default App
