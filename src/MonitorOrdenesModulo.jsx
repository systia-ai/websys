/* eslint-disable react-hooks/set-state-in-effect -- carga inicial reparaciones / catálogos */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESTATUS_ORDEN } from './catalogos.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'

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

/** Fecha de ingreso para ordenar y mostrar (variantes comunes en DB / Android). */
function fechaIngresoYmd(rep) {
  const raw =
    rep.fecha_ingreso ??
    rep.fechaIngreso ??
    rep.fecha_registro ??
    rep.fecha ??
    rep.created_at ??
    rep.updated_at
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function fechaIngresoTime(rep) {
  const y = fechaIngresoYmd(rep)
  if (y) return new Date(`${y}T12:00:00`).getTime()
  const raw = rep.created_at ?? rep.updated_at
  if (raw == null) return null
  const t = new Date(raw).getTime()
  return Number.isNaN(t) ? null : t
}

function formatearFechaMostrar(ymdOrNull) {
  if (!ymdOrNull || ymdOrNull.length < 10) return '—'
  const [y, m, d] = ymdOrNull.slice(0, 10).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymdOrNull
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

const TECNICO_TODAS = ''
const TECNICO_SIN = '__sin_tecnico__'

/**
 * Monitor de órdenes: lista de reparaciones filtrable por estatus, orden por fecha de registro,
 * columnas tipo taller (Android).
 */
export default function MonitorOrdenesModulo({ supabase, onHome, onError }) {
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
    const s = new Set()
    let haySin = false
    for (const r of reparaciones) {
      const t = String(r.tecnico ?? '').trim()
      if (t) s.add(t)
      else haySin = true
    }
    const lista = [...s].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
    return { nombres: lista, haySin }
  }, [reparaciones])

  const filasOrdenadas = useMemo(() => {
    const sel = estatusSeleccionados
    let filtradas = reparaciones.filter((r) => {
      const st = String(r.estatus ?? '').trim().toUpperCase()
      return sel.size === 0 ? false : sel.has(st)
    })
    if (tecnicoFiltro === TECNICO_SIN) {
      filtradas = filtradas.filter((r) => !String(r.tecnico ?? '').trim())
    } else if (tecnicoFiltro !== TECNICO_TODAS) {
      const want = tecnicoFiltro.trim().toLowerCase()
      filtradas = filtradas.filter((r) => String(r.tecnico ?? '').trim().toLowerCase() === want)
    }
    const conTiempo = filtradas.map((r) => ({
      rep: r,
      t: fechaIngresoTime(r),
      ymd: fechaIngresoYmd(r),
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
    return conTiempo.map(({ rep, ymd }) => ({ rep, ymd }))
  }, [reparaciones, estatusSeleccionados, ordenFecha, tecnicoFiltro])

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
        <h1 className="servicios-appbar-title">Monitor de órdenes</h1>
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
              <span>Técnico</span>
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
          </div>
          <fieldset className="monitor-ordenes-fieldset">
            <legend className="monitor-ordenes-legend">Estatus a listar</legend>
            <p className="muted small monitor-ordenes-ayuda">Por defecto solo <strong>INGRESADO</strong>. Marque los que desea ver.</p>
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
            <p className="monitor-ordenes-conteo card-pad" role="status">
              <strong>{filasOrdenadas.length}</strong>{' '}
              {filasOrdenadas.length === 1 ? 'orden listada' : 'órdenes listadas'} según filtros actuales.
            </p>
            <div className="monitor-ordenes-tabla-wrap table-wrap">
              <table className="monitor-ordenes-tabla">
                <thead>
                  <tr>
                    <th>Fecha de ingreso</th>
                    <th>No. orden</th>
                    <th>Cliente</th>
                    <th>Técnico</th>
                    <th>Tipo de equipo</th>
                    <th>Descripción</th>
                    <th>Problema reportado</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="monitor-ordenes-vacio">
                        No hay órdenes con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filasOrdenadas.map(({ rep, ymd }) => {
                      const { tipo, desc } = datosEquipo(rep)
                      const tech = String(rep.tecnico ?? '').trim()
                      return (
                        <tr key={rep.id}>
                          <td>{formatearFechaMostrar(ymd)}</td>
                          <td className="monitor-ordenes-num">{rep.id ?? '—'}</td>
                          <td>{nombreCliente(rep.cliente_id)}</td>
                          <td>{tech || '—'}</td>
                          <td>{tipo}</td>
                          <td className="monitor-ordenes-col-texto">{desc}</td>
                          <td className="monitor-ordenes-col-texto">{String(rep.problemas_reportados ?? '—')}</td>
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
    </div>
  )
}
