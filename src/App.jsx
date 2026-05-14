import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
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
import HomeModuleIcon from './HomeModuleIcon.jsx'

const modules = [
  { key: 'clientes', title: 'Clientes', table: 'clientes', fields: ['nombre', 'telefono', 'domicilio', 'correo'] },
  { key: 'servicios', title: 'Servicios (Equipos)', table: 'equipos', fields: ['serie', 'tipo_equipo', 'descripcion', 'tipo_reparacion', 'cliente_id'] },
  { key: 'reparaciones', title: 'Orden de servicio', table: 'reparaciones', fields: ['equipo_id', 'cliente_id', 'tecnico', 'estatus', 'descripcion_equipo', 'problemas_reportados', 'niveles_tinta', 'descripcion_solucion', 'pago', 'costo_reparacion', 'tipo_reparacion'] },
]

/** Tarjetas del inicio: módulos CRUD + pantallas dedicadas. */
const homeMenuItems = [
  ...modules,
  { key: 'inventarios', title: 'Inventarios', table: 'productos' },
  { key: 'catalogo_pagos', title: 'Catalogo de Pagos', table: 'catalogopagos' },
  { key: 'corte_caja', title: 'Corte de Caja', table: 'pagosclientes' },
  { key: 'reportes', title: 'Reportes', table: 'reparaciones' },
  { key: 'monitor_ordenes', title: 'MONITOR de ORDENES', table: 'reparaciones' },
]

function getSupabaseClient() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function App() {
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
  const supabase = useMemo(() => getSupabaseClient(), [])

  const activeModuleRef = useRef(activeModule)
  /** Historial de pantallas para «atrás» / salir (no siempre inicio). */
  const navStackRef = useRef(['home'])

  useEffect(() => {
    activeModuleRef.current = activeModule
  }, [activeModule])

  function navigateTo(nextKey) {
    if (nextKey === 'home') {
      navStackRef.current = ['home']
      setRepSession(null)
      setVentasContext(null)
      setClienteVinculoServicios(null)
      setActiveModule('home')
      setNotice('')
      return
    }
    const cur = activeModuleRef.current
    if (cur === nextKey) {
      setActiveModule(nextKey)
      return
    }
    navStackRef.current = [...navStackRef.current, nextKey]
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
    if (leaving === 'ventas') setVentasContext(null)
    if (leaving === 'servicios') setClienteVinculoServicios(null)
    setActiveModule(target)
    setNotice('')
  }

  function openReparacionesFromServicios(payload) {
    setRepSession(payload ?? null)
    setError('')
    navigateTo('reparaciones')
  }

  const current = modules.find((m) => m.key === activeModule)
  const filteredRows = rows.filter((row) => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()))

  useEffect(() => {
    if (!current || activeModule === 'servicios' || activeModule === 'reparaciones' || activeModule === 'clientes')
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

  if (activeModule === 'clientes') {
    return (
      <ClientesModulo
        supabase={supabase}
        onHome={goBack}
        onOpenServiciosConCliente={(row) => {
          const c = normalizeClienteRow(row)
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
        />
      </main>
    )
  }

  if (activeModule === 'servicios') {
    return (
      <ServiciosEquipos
        supabase={supabase}
        clienteDesdeClientes={clienteVinculoServicios}
        onConsumeClienteVinculo={() => setClienteVinculoServicios(null)}
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
        session={repSession ?? {}}
        error={error}
        notice={notice}
        onHome={goBack}
        onIrEquipos={() => navigateTo('servicios')}
        onIrClientes={() => navigateTo('clientes')}
        onSeleccionarOrdenDesdeBusqueda={(payload) => setRepSession(payload)}
        onClearOrdenSession={() => setRepSession(null)}
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
          <button type="button" onClick={() => navigateTo('home')}>
            Inicio
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
      <div className="toolbar">
        <button type="button" onClick={() => navigateTo('home')}>
          Inicio
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
          <div className="table-wrap">
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
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    {current.fields.map((f) => (
                      <td key={f}>{String(row[f] ?? '')}</td>
                    ))}
                    <td className="row-actions">
                      <button type="button" onClick={() => onEdit(row)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => onDelete(row.id)}>
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
          </div>
    </main>
  )
}

export default App
