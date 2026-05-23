/* eslint-disable react-hooks/set-state-in-effect -- carga inicial reparaciones / catálogos */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESTATUS_ORDEN } from './catalogos.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import {
  aYmdLocalDesdeRaw,
  estatusEsEntregado,
  fechaEntregaYmd,
  fechaIngresoYmd,
  repCoincideFiltroMonitor,
  tipoServicioDeRep,
  TIPOS_SERVICIO_CANONICOS,
  ymdHoyLocal,
} from './reparacionUtils.js'
import { leerTecnicos, agregarTecnico, eliminarTecnico } from './tecnicosCatalogo.js'

const LS_REP = 'sistefix_local_reparaciones'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_EQUIPOS = 'sistefix_local_equipos'
const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_PAGOS = 'sistefix_local_pagosclientes'
function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function ymdATime(ymd) {
  if (!ymd || ymd.length < 10) return null
  const [y, m, d] = ymd.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return new Date(y, m - 1, d).getTime()
}

function fechaIngresoTime(rep) {
  const t = ymdATime(fechaIngresoYmd(rep))
  if (t != null) return t
  const raw = rep.fecha_creacion ?? rep.created_at
  if (raw == null) return null
  const n = new Date(raw).getTime()
  return Number.isNaN(n) ? null : n
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

const TIPOS_SERVICIO_FILTRO = TIPOS_SERVICIO_CANONICOS

function todosTiposServicioSeleccionados(sel) {
  return TIPOS_SERVICIO_FILTRO.length > 0 && TIPOS_SERVICIO_FILTRO.every((t) => sel.has(t))
}

/**
 * Monitor de órdenes: lista de reparaciones filtrable por estatus, orden por fecha de registro,
 * columnas tipo taller (Android).
 */
export default function MonitorOrdenesModulo({ supabase, onHome, onError, onNotice, onEditarOrden }) {
  void onNotice
  const [reparaciones, setReparaciones] = useState([])
  const [clientes, setClientes] = useState([])
  const [equipos, setEquipos] = useState([])
  const [cuentas, setCuentas] = useState([])
  const [pagos, setPagos] = useState([])
  const [loading, setLoading] = useState(true)

  /** Estatus incluidos en el listado (por defecto solo INGRESADO). */
  const [estatusSeleccionados, setEstatusSeleccionados] = useState(() => new Set(['INGRESADO']))
  /** Tipos de servicio incluidos (por defecto todos los del catálogo). */
  const [tiposServicioSeleccionados, setTiposServicioSeleccionados] = useState(
    () => new Set(TIPOS_SERVICIO_FILTRO),
  )
  /** 'asc' = más antigua primero, 'desc' = más reciente primero */
  const [ordenFecha, setOrdenFecha] = useState('desc')
  /** '' = todas las órdenes (por técnico); valor = técnico exacto; TECNICO_SIN = sin técnico asignado */
  const [tecnicoFiltro, setTecnicoFiltro] = useState(TECNICO_TODAS)
  /** '' = sin límite; yyyy-mm-dd = ingreso o entrega en el rango */
  const [fechaDesde, setFechaDesde] = useState(ymdHoyLocal)
  const [fechaHasta, setFechaHasta] = useState(ymdHoyLocal)
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
        const [r1, r2, r3, r4, r5] = await Promise.all([
          supabase.from('reparaciones').select('*'),
          supabase.from('clientes').select('*'),
          supabase.from('equipos').select('*'),
          supabase.from('cuentas').select('*'),
          supabase.from('pagosclientes').select('*'),
        ])
        if (r1.error) throw r1.error
        if (r2.error) throw r2.error
        if (r3.error) throw r3.error
        setReparaciones(r1.data ?? [])
        setClientes((r2.data ?? []).map((x) => normalizeClienteRow(x)))
        setEquipos(r3.data ?? [])
        if (r4.error) {
          console.warn('Monitor: no se cargaron cuentas para fechas de entrega:', r4.error.message)
          setCuentas([])
        } else {
          setCuentas(r4.data ?? [])
        }
        if (r5.error) {
          console.warn('Monitor: no se cargaron pagos para fechas de entrega:', r5.error.message)
          setPagos([])
        } else {
          setPagos(r5.data ?? [])
        }
      } else {
        setReparaciones(readLs(LS_REP, []))
        setClientes(readLs(LS_CLIENTES, []).map((x) => normalizeClienteRow(x)))
        setEquipos(readLs(LS_EQUIPOS, []))
        setCuentas(readLs(LS_CUENTAS, []))
        setPagos(readLs(LS_PAGOS, []))
      }
    } catch (e) {
      onError?.(`Error al cargar monitor: ${e.message}`)
      setReparaciones([])
      setClientes([])
      setEquipos([])
      setCuentas([])
      setPagos([])
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

  const entregaDesdePagosPorRepara = useMemo(() => {
    const reparaPorCuenta = new Map()
    for (const c of cuentas) {
      const rid = c?.repara_id ?? c?.reparacion_id
      if (rid != null && c?.id != null) reparaPorCuenta.set(String(c.id), String(rid))
    }
    const m = new Map()
    for (const p of pagos) {
      const rid = reparaPorCuenta.get(String(p?.cuenta_id))
      if (!rid) continue
      const y = aYmdLocalDesdeRaw(p?.created_at ?? p?.fecha ?? p?.fecha_pago)
      if (!y) continue
      const prev = m.get(rid)
      if (!prev || y > prev) m.set(rid, y)
    }
    return m
  }, [cuentas, pagos])

  const cuentaPorReparaId = useMemo(() => {
    const m = new Map()
    for (const c of cuentas) {
      const rid = c?.repara_id ?? c?.reparacion_id
      if (rid == null) continue
      const key = String(rid)
      const prev = m.get(key)
      if (!prev) {
        m.set(key, c)
        continue
      }
      const tNew = new Date(c.updated_at ?? c.created_at ?? 0).getTime()
      const tPrev = new Date(prev.updated_at ?? prev.created_at ?? 0).getTime()
      if (tNew >= tPrev) m.set(key, c)
    }
    return m
  }, [cuentas])

  const tecnicosLista = useMemo(() => {
    const haySin = reparaciones.some((r) => !String(r.tecnico ?? '').trim())
    const nombres = [...tecnicosCatalogo].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    )
    return { nombres, haySin }
  }, [reparaciones, tecnicosCatalogo])

  const tiposServicioLista = TIPOS_SERVICIO_FILTRO

  const filasOrdenadas = useMemo(() => {
    const sel = estatusSeleccionados
    const desde = String(fechaDesde ?? '').trim()
    const hasta = String(fechaHasta ?? '').trim()
    let filtradas = reparaciones.filter((r) => {
      const rid = String(r.id)
      return repCoincideFiltroMonitor(r, {
        estatusSeleccionados: sel,
        desde,
        hasta,
        cuentaVinculada: cuentaPorReparaId.get(rid),
        ymdDesdePagos: entregaDesdePagosPorRepara.get(rid) ?? null,
        estatusParaFiltroFn: estatusParaFiltro,
      })
    })
    const tiposSel = tiposServicioSeleccionados
    if (tiposSel.size === 0) {
      filtradas = []
    } else if (!todosTiposServicioSeleccionados(tiposSel)) {
      filtradas = filtradas.filter((r) => {
        const t = tipoServicioDeRep(r, equipoPorId)
        return t != null && tiposSel.has(t)
      })
    }
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
    const diasExactos = parsearFiltroDiasExactos(busqueda)
    const qTexto = String(busqueda ?? '').trim()
    if (diasExactos != null) {
      filtradas = filtradas.filter((r) => diasEnTaller(r) === diasExactos)
    } else if (qTexto) {
      const q = qTexto.toLowerCase()
      filtradas = filtradas.filter((r) => {
        const c = clientes.find((x) => sameId(x.id, r.cliente_id))
        const nombre = String(c?.nombre ?? '').toLowerCase()
        const tipoCanon = tipoServicioDeRep(r, equipoPorId) ?? ''
        const blob = [
          nombre,
          String(r.id ?? ''),
          String(r.problemas_reportados ?? '').toLowerCase(),
          String(r.descripcion_equipo ?? '').toLowerCase(),
          String(r.tecnico ?? '').toLowerCase(),
          String(r.estatus ?? '').toLowerCase(),
          tipoCanon.toLowerCase(),
        ].join(' ')
        return blob.includes(q)
      })
    }
    const conTiempo = filtradas.map((r) => {
      const rid = String(r.id)
      const cuenta = cuentaPorReparaId.get(rid)
      const ymdPago = entregaDesdePagosPorRepara.get(rid) ?? null
      const ymdIng = fechaIngresoYmd(r)
      const ymdEnt = fechaEntregaYmd(r, cuenta, ymdPago)
      const t = fechaIngresoTime(r)
      return {
        rep: r,
        t,
        ymd: ymdIng,
        ymdEntrega: ymdEnt,
        dias: diasEnTaller(r),
        cuenta,
        ymdPago,
      }
    })
    conTiempo.sort((a, b) => {
      const ta = a.t ?? 0
      const tb = b.t ?? 0
      if (ta === tb) return Number(a.rep.id ?? 0) - Number(b.rep.id ?? 0)
      if (a.t == null && b.t == null) return 0
      if (a.t == null) return 1
      if (b.t == null) return -1
      return ordenFecha === 'asc' ? ta - tb : tb - ta
    })
    return conTiempo.map(({ rep, ymd, ymdEntrega, dias }) => ({ rep, ymd, ymdEntrega, dias }))
  }, [
    reparaciones,
    estatusSeleccionados,
    tiposServicioSeleccionados,
    ordenFecha,
    tecnicoFiltro,
    fechaDesde,
    fechaHasta,
    busqueda,
    clientes,
    cuentaPorReparaId,
    entregaDesdePagosPorRepara,
  ])

  const rangoFechasInvalido = useMemo(() => {
    const d = String(fechaDesde ?? '').trim()
    const h = String(fechaHasta ?? '').trim()
    return d && h && d > h
  }, [fechaDesde, fechaHasta])

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

  function toggleTipoServicio(tipo) {
    const t = String(tipo).trim().toUpperCase()
    setTiposServicioSeleccionados((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function seleccionarSoloTipoServicio(tipo) {
    setTiposServicioSeleccionados(new Set([String(tipo).trim().toUpperCase()]))
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

  const tileActive = (on) => (on ? ' monitor-ordenes-tile--active' : '')
  const filtroTecnicoActivo = tecnicoFiltro !== TECNICO_TODAS
  const filtroRangoActivo = Boolean(String(fechaDesde ?? '').trim() || String(fechaHasta ?? '').trim())
  const filtroBusquedaActivo = Boolean(String(busqueda ?? '').trim())
  return (
    <div className="servicios-root inventarios-root monitor-ordenes-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
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
          <h2 className="monitor-ordenes-filtros-titulo">
            <span className="monitor-ordenes-filtros-titulo-icon" aria-hidden="true">
              🔎
            </span>
            Filtros
          </h2>

          <div className="monitor-ordenes-filtros-grid">
            <label className="monitor-ordenes-label-inline monitor-ordenes-tile">
              <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
              <span className="monitor-ordenes-tile-label">Orden por fecha de registro</span>
              <select value={ordenFecha} onChange={(e) => setOrdenFecha(e.target.value)}>
                <option value="asc">Más antigua primero</option>
                <option value="desc">Más reciente primero</option>
              </select>
            </label>
            <label
              className={`monitor-ordenes-label-inline monitor-ordenes-tile${tileActive(filtroTecnicoActivo)}`}
            >
              <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
              <span className="monitor-ordenes-tile-label">
                Técnico{' '}
                <button
                  type="button"
                  className="monitor-ordenes-gestion-tecnicos-btn"
                  onClick={(e) => {
                    e.preventDefault()
                    setGestionTecnicosAbierto(true)
                  }}
                  title="Agregar o eliminar técnicos del catálogo"
                >
                  ⚙️ Gestionar
                </button>
              </span>
              <select
                value={tecnicoFiltro}
                onChange={(e) => setTecnicoFiltro(e.target.value)}
                aria-label="Filtrar por técnico"
              >
                <option value={TECNICO_TODAS}>Todos los técnicos</option>
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

            <div
              className={`monitor-ordenes-filtros-rango monitor-ordenes-tile monitor-ordenes-tile--wide${tileActive(filtroRangoActivo)}`}
            >
              <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
              <span className="monitor-ordenes-filtros-grupo-titulo">Rango de fechas</span>
              <div className="monitor-ordenes-rango-inputs">
                <label className="monitor-ordenes-label-inline monitor-ordenes-label-fecha monitor-ordenes-tile-inner">
                  <span>Desde</span>
                  <input
                    type="date"
                    value={fechaDesde}
                    max={fechaHasta || undefined}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    aria-label="Fecha inicial del rango"
                  />
                </label>
                <label className="monitor-ordenes-label-inline monitor-ordenes-label-fecha monitor-ordenes-tile-inner">
                  <span>Hasta</span>
                  <input
                    type="date"
                    value={fechaHasta}
                    min={fechaDesde || undefined}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    aria-label="Fecha final del rango"
                  />
                </label>
                <button
                  type="button"
                  className="monitor-ordenes-fecha-clear monitor-ordenes-fecha-clear--rango"
                  onClick={() => {
                    setFechaDesde('')
                    setFechaHasta('')
                  }}
                  disabled={!fechaDesde && !fechaHasta}
                  title="Quitar filtro de rango de fechas"
                  aria-label="Quitar filtro de rango de fechas"
                >
                  Limpiar fechas
                </button>
              </div>
              {rangoFechasInvalido ? (
                <p className="monitor-ordenes-rango-aviso" role="alert">
                  La fecha inicial no puede ser posterior a la final.
                </p>
              ) : null}
            </div>

            <label
              className={`monitor-ordenes-label-inline monitor-ordenes-filtros-busqueda monitor-ordenes-tile monitor-ordenes-tile--wide${tileActive(filtroBusquedaActivo)}`}
            >
              <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
              <span className="monitor-ordenes-tile-label">Buscador</span>
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

          <fieldset className="monitor-ordenes-fieldset monitor-ordenes-fieldset--estatus monitor-ordenes-tile monitor-ordenes-tile--wide">
            <legend className="monitor-ordenes-legend">Estatus de la orden</legend>
            <div className="monitor-ordenes-estatus-grid">
              {ESTATUS_ORDEN.map((est) => {
                const st = String(est).trim().toUpperCase()
                const checked = estatusSeleccionados.has(st)
                return (
                  <label
                    key={est}
                    className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(checked)}`}
                  >
                    <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
                    <input
                      type="checkbox"
                      className="monitor-ordenes-check-input"
                      checked={checked}
                      onChange={() => toggleEstatus(est)}
                    />
                    <span className="monitor-ordenes-check-text">{est}</span>
                    <button
                      type="button"
                      className="monitor-ordenes-solo"
                      onClick={(e) => {
                        e.preventDefault()
                        seleccionarSolo(est)
                      }}
                      title="Solo este"
                    >
                      Solo
                    </button>
                  </label>
                )
              })}
            </div>
          </fieldset>

          <fieldset className="monitor-ordenes-fieldset monitor-ordenes-fieldset--estatus monitor-ordenes-tile monitor-ordenes-tile--wide">
            <legend className="monitor-ordenes-legend">Tipo de servicio</legend>
            <div className="monitor-ordenes-estatus-grid">
              {tiposServicioLista.map((tipo) => {
                const checked = tiposServicioSeleccionados.has(tipo)
                return (
                  <label
                    key={tipo}
                    className={`monitor-ordenes-check monitor-ordenes-tile monitor-ordenes-tile--chip${tileActive(checked)}`}
                  >
                    <span className="monitor-ordenes-tile-badge" aria-hidden="true" />
                    <input
                      type="checkbox"
                      className="monitor-ordenes-check-input"
                      checked={checked}
                      onChange={() => toggleTipoServicio(tipo)}
                    />
                    <span className="monitor-ordenes-check-text">{tipo}</span>
                    <button
                      type="button"
                      className="monitor-ordenes-solo"
                      onClick={(e) => {
                        e.preventDefault()
                        seleccionarSoloTipoServicio(tipo)
                      }}
                      title="Solo este tipo"
                    >
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
                    <th>Fecha de entrega</th>
                    <th>Días en taller</th>
                    <th>No. orden</th>
                    <th>Cliente</th>
                    <th>Tipo de equipo</th>
                    <th>Tipo de servicio</th>
                    <th>Descripción</th>
                    <th>Problema reportado</th>
                    <th>Técnico</th>
                    <th aria-label="Acciones">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filasOrdenadas.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="monitor-ordenes-vacio">
                        No hay órdenes con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    filasOrdenadas.map(({ rep, ymd, ymdEntrega, dias }) => {
                      const { tipo, desc } = datosEquipo(rep)
                      const tipoServicio = tipoServicioDeRep(rep, equipoPorId) ?? '—'
                      const tech = String(rep.tecnico ?? '').trim()
                      const ent = estatusEsEntregado(rep?.estatus)
                      return (
                        <tr key={rep.id}>
                          <td className="monitor-ordenes-fecha-ingreso">{formatearFechaMostrar(ymd)}</td>
                          <td
                            className={`monitor-ordenes-fecha-entrega-celda${ent ? ' monitor-ordenes-fecha-entrega-celda--ok' : ''}`}
                          >
                            {ent && ymdEntrega ? formatearFechaMostrar(ymdEntrega) : '—'}
                          </td>
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
                          <td className="monitor-ordenes-tipo-servicio">{tipoServicio}</td>
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
