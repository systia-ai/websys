/* eslint-disable react-hooks/set-state-in-effect -- carga inicial reparaciones / catálogos */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESTATUS_ORDEN } from './catalogos.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { estatusEsEntregado } from './reparacionUtils.js'
import { leerTecnicos, agregarTecnico, eliminarTecnico } from './tecnicosCatalogo.js'

const LS_REP = 'sistefix_local_reparaciones'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_EQUIPOS = 'sistefix_local_equipos'

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

/** Convierte timestamp o fecha a YYYY-MM-DD en calendario local (coherente con `<input type="date">`). */
function aYmdLocalDesdeRaw(raw) {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Fecha de ingreso al taller (Supabase guarda `fecha_creacion` al registrar la orden). */
function fechaIngresoYmd(rep) {
  const raw =
    rep.fecha_ingreso ??
    rep.fechaIngreso ??
    rep.fecha_registro ??
    rep.fecha_creacion ??
    rep.created_at ??
    rep.fecha ??
    rep.updated_at
  return aYmdLocalDesdeRaw(raw)
}

function fechaIngresoTime(rep) {
  const ymd = fechaIngresoYmd(rep)
  if (ymd) {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const raw = rep.fecha_creacion ?? rep.created_at ?? rep.updated_at
  if (raw == null) return null
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? null : t
}

function hoyYmdLocal() {
  return aYmdLocalDesdeRaw(new Date())
}

function diffDiasCalendario(ymdA, ymdB) {
  if (!ymdA || !ymdB || ymdA.length < 10 || ymdB.length < 10) return null
  const [ya, ma, da] = ymdA.slice(0, 10).split('-').map(Number)
  const [yb, mb, db] = ymdB.slice(0, 10).split('-').map(Number)
  const ta = Date.UTC(ya, ma - 1, da)
  const tb = Date.UTC(yb, mb - 1, db)
  return Math.round((tb - ta) / 86400000)
}

/**
 * Días en taller solo para órdenes abiertas (ingreso → hoy).
 * Si ya está ENTREGADO/A, devuelve null (la UI muestra ✅, no número).
 */
function diasEnTaller(rep) {
  if (estatusEsEntregado(rep?.estatus)) return null
  const ing = fechaIngresoYmd(rep)
  if (!ing) return null
  const n = diffDiasCalendario(ing, hoyYmdLocal())
  return n == null ? null : Math.max(0, n)
}

/** Si el texto es solo «N días» / «N dia», devuelve N; si no, null. */
function parsearFiltroDiasExactos(texto) {
  const t = String(texto ?? '').trim()
  const m = t.match(/^(\d+)\s*d[ií]a(s)?\s*$/i)
  return m ? Number(m[1]) : null
}

function formatearFechaMostrar(ymdOrNull) {
  if (!ymdOrNull || ymdOrNull.length < 10) return '—'
  const [y, m, d] = ymdOrNull.slice(0, 10).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymdOrNull
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Alinea variantes de BD con los valores del catálogo del monitor. */
function estatusParaFiltro(rep) {
  const st = String(rep?.estatus ?? '').trim().toUpperCase()
  if (st === 'ENTREGADA') return 'ENTREGADO'
  return st
}

const TECNICO_TODAS = ''
const TECNICO_SIN = '__sin_tecnico__'

/**
 * Monitor de órdenes: lista de reparaciones filtrable por estatus, orden por fecha de registro,
 * columnas tipo taller (Android).
 */
export default function MonitorOrdenesModulo({ supabase, onHome, onError, onNotice, onEditarOrden }) {
  void onNotice
  const [reparaciones, setReparaciones] = useState([])
  const [clientes, setClientes] = useState([])
  const [equipos, setEquipos] = useState([])
  const [loading, setLoading] = useState(true)

  /** Estatus incluidos en el listado (por defecto solo INGRESADO). */
  const [estatusSeleccionados, setEstatusSeleccionados] = useState(() => new Set(['INGRESADO']))
  /** 'asc' = más antigua primero, 'desc' = más reciente primero */
  const [ordenFecha, setOrdenFecha] = useState('asc')
  /** '' = todas las órdenes (por técnico); valor = técnico exacto; TECNICO_SIN = sin técnico asignado */
  const [tecnicoFiltro, setTecnicoFiltro] = useState(TECNICO_TODAS)
  /** '' = sin filtro; yyyy-mm-dd = solo órdenes con fecha de ingreso >= este día */
  const [fechaDesde, setFechaDesde] = useState('')
  /** Buscador: «12 días» = exactamente 12 días en taller; otro texto = cliente, #orden, problema, etc. */
  const [busqueda, setBusqueda] = useState('')

  /** Catálogo de técnicos (controlado por el usuario). */
  const [tecnicosCatalogo, setTecnicosCatalogo] = useState(() => leerTecnicos())
  const [gestionTecnicosAbierto, setGestionTecnicosAbierto] = useState(false)
  const [nuevoTecnico, setNuevoTecnico] = useState('')

  const cargarTodo = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const [r1, r2, r3] = await Promise.all([
          supabase.from('reparaciones').select('*'),
          supabase.from('clientes').select('*'),
          supabase.from('equipos').select('*'),
        ])
        if (r1.error) throw r1.error
        if (r2.error) throw r2.error
        if (r3.error) throw r3.error
        setReparaciones(r1.data ?? [])
        setClientes((r2.data ?? []).map((x) => normalizeClienteRow(x)))
        setEquipos(r3.data ?? [])
      } else {
        setReparaciones(readLs(LS_REP, []))
        setClientes(readLs(LS_CLIENTES, []).map((x) => normalizeClienteRow(x)))
        setEquipos(readLs(LS_EQUIPOS, []))
      }
    } catch (e) {
      onError?.(`Error al cargar monitor: ${e.message}`)
      setReparaciones([])
      setClientes([])
      setEquipos([])
    } finally {
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarTodo()
  }, [cargarTodo])

  const equipoPorId = useMemo(() => {
    const m = new Map()
    for (const e of equipos) {
      if (e?.id != null) m.set(String(e.id), e)
    }
    return m
  }, [equipos])

  const tecnicosLista = useMemo(() => {
    const haySin = reparaciones.some((r) => !String(r.tecnico ?? '').trim())
    const nombres = [...tecnicosCatalogo].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    )
    return { nombres, haySin }
  }, [reparaciones, tecnicosCatalogo])

  const filasOrdenadas = useMemo(() => {
    const sel = estatusSeleccionados
    let filtradas = reparaciones.filter((r) => {
      const st = estatusParaFiltro(r)
      return sel.size === 0 ? false : sel.has(st)
    })
    if (tecnicoFiltro === TECNICO_SIN) {
      filtradas = filtradas.filter((r) => !String(r.tecnico ?? '').trim())
    } else if (tecnicoFiltro !== TECNICO_TODAS) {
      const want = tecnicoFiltro.trim().toUpperCase()
      filtradas = filtradas.filter((r) => {
        const t = String(r.tecnico ?? '').trim().toUpperCase()
        if (!t) return false
        const partes = t.split(/\s*&\s*/).map((x) => x.trim()).filter(Boolean)
        return partes.includes(want)
      })
    }
    const desde = String(fechaDesde ?? '').trim()
    if (desde) {
      filtradas = filtradas.filter((r) => {
        const ymd = fechaIngresoYmd(r)
        return ymd != null && ymd >= desde
      })
    }
    const diasExactos = parsearFiltroDiasExactos(busqueda)
    const qTexto = String(busqueda ?? '').trim()
    if (diasExactos != null) {
      filtradas = filtradas.filter((r) => diasEnTaller(r) === diasExactos)
    } else if (qTexto) {
      const q = qTexto.toLowerCase()
      filtradas = filtradas.filter((r) => {
        const c = clientes.find((x) => sameId(x.id, r.cliente_id))
        const nombre = String(c?.nombre ?? '').toLowerCase()
        const blob = [
          nombre,
          String(r.id ?? ''),
          String(r.problemas_reportados ?? '').toLowerCase(),
          String(r.descripcion_equipo ?? '').toLowerCase(),
          String(r.tecnico ?? '').toLowerCase(),
          String(r.estatus ?? '').toLowerCase(),
        ].join(' ')
        return blob.includes(q)
      })
    }
    const conTiempo = filtradas.map((r) => ({
      rep: r,
      t: fechaIngresoTime(r),
      ymd: fechaIngresoYmd(r),
      dias: diasEnTaller(r),
    }))
    conTiempo.sort((a, b) => {
      const ta = a.t ?? 0
      const tb = b.t ?? 0
      if (ta === tb) return Number(a.rep.id ?? 0) - Number(b.rep.id ?? 0)
      if (a.t == null && b.t == null) return 0
      if (a.t == null) return 1
      if (b.t == null) return -1
      return ordenFecha === 'asc' ? ta - tb : tb - ta
    })
    return conTiempo.map(({ rep, ymd, dias }) => ({ rep, ymd, dias }))
  }, [reparaciones, estatusSeleccionados, ordenFecha, tecnicoFiltro, fechaDesde, busqueda, clientes])

  function toggleEstatus(est) {
    const st = String(est).trim().toUpperCase()
    setEstatusSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(st)) next.delete(st)
      else next.add(st)
      return next
    })
  }

  function seleccionarSolo(est) {
    setEstatusSeleccionados(new Set([String(est).trim().toUpperCase()]))
  }

  function nombreCliente(cid) {
    const c = clientes.find((x) => sameId(x.id, cid))
    return c ? c.nombre || `#${cid}` : cid != null ? `Cliente #${cid}` : '—'
  }

  function handleAgregarTecnico() {
    const n = nuevoTecnico.trim()
    if (!n) return
    const nueva = agregarTecnico(n)
    setTecnicosCatalogo(nueva)
    setNuevoTecnico('')
  }

  function handleEliminarTecnico(nombre) {
    if (!window.confirm(`¿Eliminar el técnico "${nombre}" del catálogo?\n\nLas órdenes ya asignadas a este técnico no se modifican; pero no podrás seleccionarlo de nuevo.`)) return
    const nueva = eliminarTecnico(nombre)
    setTecnicosCatalogo(nueva)
    if (tecnicoFiltro === nombre) setTecnicoFiltro(TECNICO_TODAS)
  }

  function handleEditarOrden(rep) {
    if (!onEditarOrden) return
    const c = clientes.find((x) => sameId(x.id, rep.cliente_id)) ?? {}
    const eq = rep.equipo_id != null ? equipoPorId.get(String(rep.equipo_id)) ?? {} : {}
    onEditarOrden({
      clienteNombre: c.nombre ?? '',
      clienteTelefono: c.telefono ?? '',
      clienteDomicilio: c.domicilio ?? '',
      clienteCorreo: c.correo ?? '',
      equipoSerie: eq.serie ?? '',
      equipoTipo: eq.tipo_equipo ?? '',
      equipoDescripcion: rep.descripcion_equipo ?? eq.descripcion ?? '',
      equipoTipoReparacion: rep.tipo_reparacion ?? eq.tipo_reparacion ?? '',
      reparacionId: rep.id != null ? String(rep.id) : '',
    })
  }

  function datosEquipo(rep) {
    const id = rep.equipo_id
    if (id == null) return { tipo: '—', desc: String(rep.descripcion_equipo ?? '—') }
    const eq = equipoPorId.get(String(id))
    const tipo = eq?.tipo_equipo != null && String(eq.tipo_equipo).trim() !== '' ? String(eq.tipo_equipo) : '—'
    const desc =
      rep.descripcion_equipo != null && String(rep.descripcion_equipo).trim() !== ''
        ? String(rep.descripcion_equipo)
        : eq?.descripcion != null
          ? String(eq.descripcion)
          : '—'
    return { tipo, desc }
  }

  return (
    <div className="servicios-root inventarios-root monitor-ordenes-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Inicio">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">📋</span>
          Monitor de órdenes
        </h1>
        <span className="servicios-appbar-placeholder" aria-hidden />
      </header>

      <div className="servicios-body">
        <section className="monitor-ordenes-filtros card-pad">
          <h2 className="monitor-ordenes-filtros-titulo">Filtros</h2>
          <div className="monitor-ordenes-filtros-doble">
            <label className="monitor-ordenes-label-inline">
              <span>Orden por fecha de registro</span>
              <select value={ordenFecha} onChange={(e) => setOrdenFecha(e.target.value)}>
                <option value="asc">Más antigua primero</option>
                <option value="desc">Más reciente primero</option>
              </select>
            </label>
            <label className="monitor-ordenes-label-inline">
              <span>
                Técnico{' '}
                <button
                  type="button"
                  className="monitor-ordenes-gestion-tecnicos-btn"
                  onClick={() => setGestionTecnicosAbierto(true)}
                  title="Agregar o eliminar técnicos del catálogo"
                >
                  ⚙️ Gestionar
                </button>
              </span>
              <select value={tecnicoFiltro} onChange={(e) => setTecnicoFiltro(e.target.value)}>
                <option value={TECNICO_TODAS}>Todas las órdenes</option>
                {tecnicosLista.haySin ? (
                  <option value={TECNICO_SIN}>(Sin técnico asignado)</option>
                ) : null}
                {tecnicosLista.nombres.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="monitor-ordenes-label-inline">
              <span>Fecha desde (incluye)</span>
              <div className="monitor-ordenes-fecha-desde">
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  aria-label="Mostrar órdenes con fecha de ingreso desde este día"
                />
                <button
                  type="button"
                  className="monitor-ordenes-fecha-clear"
                  onClick={() => setFechaDesde('')}
                  disabled={!fechaDesde}
                  title="Quitar filtro de fecha"
                  aria-label="Quitar filtro de fecha"
                >
                  Limpiar
                </button>
              </div>
            </label>
            <label className="monitor-ordenes-label-inline monitor-ordenes-busqueda-wrap">
              <span>Buscador</span>
              <div className="monitor-ordenes-fecha-desde">
                <input
                  type="search"
                  className="monitor-ordenes-busqueda-input"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Ej. 10 días, nombre cliente, #orden…"
                  aria-label="Buscador: texto libre o filtro exacto por días en taller"
                />
                <button
                  type="button"
                  className="monitor-ordenes-fecha-clear"
                  onClick={() => setBusqueda('')}
                  disabled={!busqueda.trim()}
                  title="Limpiar buscador"
                  aria-label="Limpiar buscador"
                >
                  Limpiar
                </button>
              </div>
            </label>
          </div>
          <fieldset className="monitor-ordenes-fieldset">
            <legend className="monitor-ordenes-legend">Estatus a listar</legend>
            <div className="monitor-ordenes-estatus-grid">
              {ESTATUS_ORDEN.map((est) => {
                const st = String(est).trim().toUpperCase()
                const checked = estatusSeleccionados.has(st)
                return (
                  <label key={est} className="monitor-ordenes-check">
                    <input type="checkbox" checked={checked} onChange={() => toggleEstatus(est)} />
                    <span>{est}</span>
                    <button type="button" className="monitor-ordenes-solo" onClick={() => seleccionarSolo(est)} title="Solo este">
                      Solo
                    </button>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </section>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : (
          <>
            <p className="monitor-ordenes-conteo" role="status" aria-live="polite">
              <span className="monitor-ordenes-conteo-icon" aria-hidden="true">📋</span>
              <span className="monitor-ordenes-conteo-num">{filasOrdenadas.length}</span>
              <span className="monitor-ordenes-conteo-texto">
                {filasOrdenadas.length === 1 ? 'orden listada' : 'órdenes listadas'} según filtros actuales
              </span>
            </p>
            <div className="monitor-ordenes-tabla-wrap table-wrap">
              <table className="monitor-ordenes-tabla">
                <thead>
                  <tr>
                    <th>Fecha de ingreso</th>
                    <th>Días en taller</th>
                    <th>No. orden</th>
                    <th>Cliente</th>
                    <th>Tipo de equipo</th>
                    <th>Descripción</th>
                    <th>Problema reportado</th>
                    <th>Técnico</th>
                    <th aria-label="Acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="monitor-ordenes-vacio">
                        No hay órdenes con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filasOrdenadas.map(({ rep, ymd, dias }) => {
                      const { tipo, desc } = datosEquipo(rep)
                      const tech = String(rep.tecnico ?? '').trim()
                      const ent = estatusEsEntregado(rep?.estatus)
                      return (
                        <tr key={rep.id}>
                          <td>{formatearFechaMostrar(ymd)}</td>
                          <td
                            className={`monitor-ordenes-dias${ent ? ' monitor-ordenes-dias--entregado' : ''}`}
                            title={
                              ent
                                ? 'Entregado — ya no está en el taller'
                                : dias == null
                                  ? 'Sin fecha de ingreso'
                                  : `Días en taller: ${dias}`
                            }
                          >
                            {ent ? (
                              <span role="img" aria-label="Entregado, fuera del taller">
                                ✅
                              </span>
                            ) : dias == null ? (
                              '—'
                            ) : (
                              String(dias)
                            )}
                          </td>
                          <td className="monitor-ordenes-num">{rep.id ?? '—'}</td>
                          <td>{nombreCliente(rep.cliente_id)}</td>
                          <td>{tipo}</td>
                          <td className="monitor-ordenes-col-texto">{desc}</td>
                          <td className="monitor-ordenes-col-texto">{String(rep.problemas_reportados ?? '—')}</td>
                          <td>{tech || '—'}</td>
                          <td className="monitor-ordenes-acciones">
                            <button
                              type="button"
                              className="btn-accion-editar"
                              onClick={() => handleEditarOrden(rep)}
                              title="Editar orden"
                              aria-label={`Editar orden ${rep.id}`}
                            >
                              ✏️
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {gestionTecnicosAbierto && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setGestionTecnicosAbierto(false)}
        >
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚙️ Gestionar técnicos</h3>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Agrega o elimina técnicos del catálogo. Los nombres se guardan en mayúsculas.
              </p>
            </div>
            <div className="modal-body">
              <div className="tecnicos-agregar-row">
                <input
                  type="text"
                  placeholder="Nombre del técnico"
                  value={nuevoTecnico}
                  onChange={(e) => setNuevoTecnico(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAgregarTecnico()
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-tecnico-agregar"
                  onClick={handleAgregarTecnico}
                  disabled={!nuevoTecnico.trim() || tecnicosCatalogo.includes(nuevoTecnico.trim().toUpperCase())}
                >
                  ➕ Agregar
                </button>
              </div>
              {tecnicosCatalogo.length === 0 ? (
                <p className="muted center" style={{ marginTop: 12 }}>
                  No hay técnicos en el catálogo.
                </p>
              ) : (
                <ul className="tecnicos-lista">
                  {[...tecnicosCatalogo]
                    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
                    .map((t) => (
                      <li key={t} className="tecnicos-lista-item">
                        <span>{t}</span>
                        <button
                          type="button"
                          className="btn-icon danger"
                          onClick={() => handleEliminarTecnico(t)}
                          title={`Eliminar ${t}`}
                          aria-label={`Eliminar ${t}`}
                        >
                          🗑️
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" onClick={() => setGestionTecnicosAbierto(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
