/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de clientes */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'

/** Misma clave que Ventas (`pagosclientes`); la tabla `pagocliente` no existe en muchos proyectos Supabase. */
const LS_PAGOS_CLIENTES = 'sistefix_local_pagosclientes'
const LS_PAGOCLIENTE_LEGACY = 'sistefix_local_pagocliente'
const LS_CLIENTES = 'sistefix_local_clientes'

function readLocalPagosCorteMerged() {
  const principal = readLs(LS_PAGOS_CLIENTES, [])
  const legacy = readLs(LS_PAGOCLIENTE_LEGACY, [])
  if (!legacy.length) return principal
  const ids = new Set(principal.map((r) => String(r.id)))
  return [...principal, ...legacy.filter((r) => r.id != null && !ids.has(String(r.id)))]
}

/** Orden: la app Android/web ya usa `pagosclientes` para pagos a cuenta. */
const TABLAS_CORTE_SUPABASE = ['pagosclientes', 'pagocliente']

function isTableMissingError(err) {
  const m = String(err?.message ?? err ?? '').toLowerCase()
  return (
    m.includes('could not find the table') ||
    m.includes('schema cache') ||
    m.includes('does not exist') ||
    (m.includes('relation') && m.includes('does not exist'))
  )
}

function ymdHoy() {
  return new Date().toISOString().slice(0, 10)
}

function ymdInicioMes() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

/** Fecha del movimiento para filtrar el corte (mismas variantes que suelen venir de Android/Postgres). */
function extractDateYmd(p) {
  const raw = p.fecha ?? p.Fecha ?? p.fecha_pago ?? p.fecha_registro ?? p.fecha_movimiento ?? p.created_at ?? p.date
  if (raw == null || raw === '') return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function hayAlgunaFechaEnFilas(rows) {
  return rows.some((r) => extractDateYmd(r) != null)
}

/**
 * Filtra por [ini, fin] inclusive. Si ningún registro trae fecha, devuelve todo y marca aviso.
 */
function aplicarFiltroFechas(rows, ini, fin) {
  if (!hayAlgunaFechaEnFilas(rows)) {
    return { filas: [...rows], sinColumnaFecha: true }
  }
  const filas = rows.filter((r) => {
    const y = extractDateYmd(r)
    if (y == null) return false
    return y >= ini && y <= fin
  })
  return { filas, sinColumnaFecha: false }
}

function nombreCliente(clientes, clienteId) {
  if (clienteId == null || clienteId === '') return '—'
  const c = clientes.find((x) => sameId(x.id, clienteId))
  return c ? c.nombre || `#${clienteId}` : `Cliente #${clienteId}`
}

function formatearFechaCorta(ymdStr) {
  if (!ymdStr || ymdStr.length < 10) return ymdStr
  const [y, m, d] = ymdStr.slice(0, 10).split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymdStr
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Corte de caja: primero fechas inicio/fin (como Android), luego resumen y movimientos de pagos
 * (`pagosclientes` o, si existe, `pagocliente`).
 */
export default function CorteCajaModulo({ supabase, onHome, onError, onNotice }) {
  const tablaCorteSupabaseRef = useRef(null)

  const [pantalla, setPantalla] = useState('fechas')
  const [fechaInicio, setFechaInicio] = useState(ymdInicioMes)
  const [fechaFin, setFechaFin] = useState(ymdHoy)
  const [periodoAplicado, setPeriodoAplicado] = useState(null)
  const [sinColumnaFecha, setSinColumnaFecha] = useState(false)

  const [pagos, setPagos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loadingCorte, setLoadingCorte] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const cargarClientes = useCallback(async () => {
    try {
      if (supabase) {
        const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false })
        if (error) throw error
        setClientes((data ?? []).map((r) => normalizeClienteRow(r)))
      } else {
        setClientes(readLs(LS_CLIENTES, []).map((r) => normalizeClienteRow(r)))
      }
    } catch (e) {
      onError?.(`Error al cargar clientes: ${e.message}`)
      setClientes([])
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarClientes()
  }, [cargarClientes])

  const resolverTablaCorteSupabase = useCallback(async () => {
    if (!supabase) return null
    if (tablaCorteSupabaseRef.current) return tablaCorteSupabaseRef.current
    for (const t of TABLAS_CORTE_SUPABASE) {
      const { error } = await supabase.from(t).select('id').limit(1)
      if (!error) {
        tablaCorteSupabaseRef.current = t
        return t
      }
      if (!isTableMissingError(error)) throw new Error(error.message)
    }
    throw new Error('En Supabase no existe la tabla pagosclientes ni pagocliente.')
  }, [supabase])

  const ejecutarConsulta = useCallback(
    async (ini, fin) => {
      setLoadingCorte(true)
      setSinColumnaFecha(false)
      try {
        let todos = []
        if (supabase) {
          const tabla = await resolverTablaCorteSupabase()
          const { data, error } = await supabase.from(tabla).select('*').order('id', { ascending: false })
          if (error) throw error
          todos = data ?? []
        } else {
          todos = readLocalPagosCorteMerged()
        }
        const { filas, sinColumnaFecha: sinF } = aplicarFiltroFechas(todos, ini, fin)
        setPagos(filas)
        setSinColumnaFecha(sinF)
        setPeriodoAplicado({ ini, fin })
        setPantalla('resultados')
        setBusqueda('')
        if (sinF && todos.length > 0) {
          onNotice?.('Los registros no tienen fecha; se muestran todos los movimientos.')
        }
      } catch (e) {
        onError?.(`Error al consultar corte: ${e.message}`)
        setPagos([])
      } finally {
        setLoadingCorte(false)
      }
    },
    [supabase, onError, onNotice, resolverTablaCorteSupabase],
  )

  async function onConsultarCorte() {
    const ini = fechaInicio.trim()
    const fin = fechaFin.trim()
    if (!ini || !fin) {
      onError?.('Indique fecha inicio y fecha fin')
      return
    }
    if (ini > fin) {
      onError?.('La fecha inicio no puede ser posterior a la fecha fin')
      return
    }
    await ejecutarConsulta(ini, fin)
  }

  const resumen = useMemo(() => {
    const cantidadPagos = pagos.length
    const porForma = { EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA: 0, OTRO: 0 }
    for (const p of pagos) {
      const n = Number(p.pago ?? 0)
      if (!Number.isFinite(n)) continue
      const f = String(p.forma_pago ?? 'EFECTIVO').toUpperCase()
      if (f in porForma) porForma[f] += n
      else porForma.OTRO += n
    }
    return { cantidadPagos, porForma }
  }, [pagos])

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return pagos
    return pagos.filter((p) => {
      const con = String(p.concepto ?? '').toLowerCase()
      const fp = String(p.forma_pago ?? '').toLowerCase()
      const nom = nombreCliente(clientes, p.cliente_id).toLowerCase()
      const cid = String(p.cliente_id ?? '')
      const cuent = String(p.cuenta_id ?? '')
      return con.includes(t) || fp.includes(t) || nom.includes(t) || cid.includes(t) || cuent.includes(t)
    })
  }, [pagos, busqueda, clientes])

  function volverAElegirFechas() {
    setPantalla('fechas')
    setPagos([])
    setPeriodoAplicado(null)
    setSinColumnaFecha(false)
    setBusqueda('')
  }

  function imprimirCorte() {
    if (!periodoAplicado) {
      onError?.('Consulte un periodo antes de imprimir.')
      return
    }
    if (pagos.length === 0) {
      onError?.('No hay movimientos en el corte para imprimir.')
      return
    }
    const periodoTxt = `${formatearFechaCorta(periodoAplicado.ini)} — ${formatearFechaCorta(periodoAplicado.fin)}`
    const filas = pagos
      .map(
        (p) =>
          `<tr><td>${escapeHtml(String(p.concepto ?? '—'))}</td><td>${escapeHtml(nombreCliente(clientes, p.cliente_id))}</td><td>${p.cuenta_id != null && p.cuenta_id !== '' ? escapeHtml(String(p.cuenta_id)) : '—'}</td><td>${escapeHtml(String(p.forma_pago ?? '—'))}</td><td>${escapeHtml(extractDateYmd(p) ?? '—')}</td><td style="text-align:right">$${Number(p.pago ?? 0).toFixed(2)}</td></tr>`,
      )
      .join('')
    const otros =
      resumen.porForma.OTRO > 0
        ? `<tr><td>Otras formas de pago</td><td style="text-align:right">$${resumen.porForma.OTRO.toFixed(2)}</td></tr>`
        : ''
    const html = `<h1>Corte de caja</h1><p><strong>Periodo:</strong> ${escapeHtml(periodoTxt)}</p>
<table class="res" border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:480px"><tbody>
<tr><th colspan="2" style="text-align:left;background:#eceff1">Resumen</th></tr>
<tr><td><strong>Cantidad de pagos</strong></td><td style="text-align:right"><strong>${resumen.cantidadPagos}</strong></td></tr>
<tr><td>Efectivo</td><td style="text-align:right">$${resumen.porForma.EFECTIVO.toFixed(2)}</td></tr>
<tr><td>Transferencia</td><td style="text-align:right">$${resumen.porForma.TRANSFERENCIA.toFixed(2)}</td></tr>
<tr><td>Tarjeta</td><td style="text-align:right">$${resumen.porForma.TARJETA.toFixed(2)}</td></tr>
${otros}
</tbody></table>
<h2>Detalle</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>Concepto</th><th>Cliente</th><th>Cuenta</th><th>Forma</th><th>Fecha</th><th>Monto</th></tr></thead><tbody>${filas}</tbody></table>`
    const w = window.open('', '_blank')
    if (!w) {
      onError?.('Permita ventanas emergentes para imprimir.')
      return
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Corte de caja</title><style>
body{font-family:Arial,sans-serif;padding:20px;color:#111}
h1{font-size:1.35rem;margin:0 0 12px}
h2{font-size:1.1rem;margin:20px 0 10px}
table.res{margin:12px 0;width:100%;max-width:520px}
p{margin:0 0 16px}
th{background:#eceff1;font-size:0.8rem}
td{font-size:0.9rem}
</style></head><body>${html}<p class="muted">Use Imprimir o Guarde como PDF desde el navegador.</p></body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  if (pantalla === 'fechas') {
    return (
      <div className="servicios-root inventarios-root corte-caja-root">
        <header className="servicios-appbar">
          <button type="button" className="icon-back" onClick={onHome} aria-label="Inicio">
            ←
          </button>
          <h1 className="servicios-appbar-title">Corte de caja</h1>
          <span className="servicios-appbar-placeholder" aria-hidden />
        </header>

        <div className="servicios-body">
          <section className="corte-caja-fechas-card card-pad">
            <h2 className="corte-caja-fechas-titulo">Consultar periodo</h2>
            <p className="muted small corte-caja-fechas-desc">
              Seleccione la fecha inicio y la fecha fin para ver el corte de caja de ese periodo.
            </p>
            <div className="corte-caja-fechas-grid form-stack">
              <label>
                Fecha inicio
                <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </label>
              <label>
                Fecha fin
                <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </label>
            </div>
            <button
              type="button"
              className="btn-agregar-equipo btn-consultar-corte-caja"
              onClick={() => void onConsultarCorte()}
              disabled={loadingCorte}
            >
              {loadingCorte ? 'Consultando…' : 'CONSULTAR CORTE'}
            </button>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="servicios-root inventarios-root corte-caja-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Inicio">
          ←
        </button>
        <h1 className="servicios-appbar-title">Corte de caja</h1>
        <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={volverAElegirFechas}>
          Fechas
        </button>
      </header>

      <div className="servicios-body">
        {periodoAplicado ? (
          <p className="corte-caja-periodo-banner card-pad">
            <strong>Periodo:</strong> {formatearFechaCorta(periodoAplicado.ini)} — {formatearFechaCorta(periodoAplicado.fin)}
          </p>
        ) : null}

        {sinColumnaFecha ? (
          <p className="warning card-pad corte-caja-warning-inset">
            Los movimientos no incluyen fecha en la base de datos; se listan todos los registros.
          </p>
        ) : null}

        <section className="corte-caja-resumen card-pad">
          <h2 className="corte-caja-resumen-titulo">Resumen del periodo</h2>
          <div className="corte-caja-stats">
            <div className="corte-caja-stat total">
              <span className="label">Cantidad de pagos</span>
              <strong>{resumen.cantidadPagos}</strong>
            </div>
            <div className="corte-caja-stat">
              <span className="label">Efectivo</span>
              <strong>${resumen.porForma.EFECTIVO.toFixed(2)}</strong>
            </div>
            <div className="corte-caja-stat">
              <span className="label">Transferencia</span>
              <strong>${resumen.porForma.TRANSFERENCIA.toFixed(2)}</strong>
            </div>
            <div className="corte-caja-stat">
              <span className="label">Tarjeta</span>
              <strong>${resumen.porForma.TARJETA.toFixed(2)}</strong>
            </div>
            {resumen.porForma.OTRO > 0 ? (
              <div className="corte-caja-stat">
                <span className="label">Otras</span>
                <strong>${resumen.porForma.OTRO.toFixed(2)}</strong>
              </div>
            ) : null}
          </div>
        </section>

        <button
          type="button"
          className="btn-agregar-equipo btn-imprimir-corte-caja"
          onClick={imprimirCorte}
          disabled={loadingCorte || pagos.length === 0}
        >
          🖨 IMPRIMIR CORTE
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar en este periodo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {loadingCorte ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>
              {busqueda.trim()
                ? 'No se encontraron resultados'
                : sinColumnaFecha
                  ? 'No hay movimientos'
                  : 'No hay movimientos en el periodo seleccionado'}
            </p>
          </div>
        ) : (
          <ul className="equipo-list inventario-list corte-caja-lista">
            {filtrados.map((p) => (
              <li key={p.id} className="equipo-card inventario-card corte-caja-card corte-caja-card--solo-lectura">
                <div className="equipo-card-main inventario-card-main corte-caja-fila-lectura">
                  <strong>${Number(p.pago ?? 0).toFixed(2)}</strong>
                  <span className="muted">{String(p.concepto ?? '—')}</span>
                  <span className="muted small">
                    {nombreCliente(clientes, p.cliente_id)}
                    {p.cuenta_id != null && p.cuenta_id !== '' ? ` · Cuenta #${p.cuenta_id}` : ''}
                    {extractDateYmd(p) ? ` · ${extractDateYmd(p)}` : ''}
                  </span>
                  <span className="corte-caja-chip">{String(p.forma_pago ?? 'EFECTIVO')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
