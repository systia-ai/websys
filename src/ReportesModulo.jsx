/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de clientes */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ESTATUS_ORDEN } from './catalogos.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'

const LS_REP = 'sistefix_local_reparaciones'
const LS_CLIENTES = 'sistefix_local_clientes'

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

function extractDateYmd(row) {
  const raw =
    row.fecha ??
    row.Fecha ??
    row.fecha_ingreso ??
    row.fechaIngreso ??
    row.fecha_entrega ??
    row.created_at ??
    row.updated_at ??
    row.date
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

function esEntregada(rep) {
  return /ENTREGAD/i.test(String(rep?.estatus ?? ''))
}

/**
 * Reportes de reparaciones por periodo (fecha inicio / fin), resumen y lista, al estilo Android.
 */
export default function ReportesModulo({ supabase, onHome, onError, onNotice }) {
  const [pantalla, setPantalla] = useState('fechas')
  const [fechaInicio, setFechaInicio] = useState(ymdInicioMes)
  const [fechaFin, setFechaFin] = useState(ymdHoy)
  const [estatusFiltro, setEstatusFiltro] = useState('')
  const [periodoAplicado, setPeriodoAplicado] = useState(null)
  const [estatusAplicado, setEstatusAplicado] = useState('')
  const [sinColumnaFecha, setSinColumnaFecha] = useState(false)

  const [reparaciones, setReparaciones] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(false)
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

  const ejecutarReporte = useCallback(
    async (ini, fin, estatusSel) => {
      setLoading(true)
      setSinColumnaFecha(false)
      try {
        let todos = []
        if (supabase) {
          const { data, error } = await supabase.from('reparaciones').select('*').order('id', { ascending: false })
          if (error) throw error
          todos = data ?? []
        } else {
          todos = readLs(LS_REP, [])
        }
        const { filas: porFecha, sinColumnaFecha: sinF } = aplicarFiltroFechas(todos, ini, fin)
        let filas = porFecha
        if (estatusSel.trim()) {
          const st = estatusSel.trim().toUpperCase()
          filas = filas.filter((r) => String(r.estatus ?? '').toUpperCase() === st)
        }
        setReparaciones(filas)
        setSinColumnaFecha(sinF)
        setPeriodoAplicado({ ini, fin })
        setEstatusAplicado(estatusSel.trim())
        setPantalla('resultados')
        setBusqueda('')
        if (sinF && todos.length > 0) {
          onNotice?.('Las órdenes no tienen fecha reconocible; se muestran todas para el reporte.')
        }
      } catch (e) {
        onError?.(`Error al generar reporte: ${e.message}`)
        setReparaciones([])
      } finally {
        setLoading(false)
      }
    },
    [supabase, onError, onNotice],
  )

  async function onGenerarReporte() {
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
    await ejecutarReporte(ini, fin, estatusFiltro)
  }

  const resumen = useMemo(() => {
    const total = reparaciones.length
    const entregadas = reparaciones.filter(esEntregada).length
    const activas = total - entregadas
    const totalPagos = reparaciones.reduce((s, r) => s + Number(r.pago ?? 0), 0)
    const totalCosto = reparaciones.reduce((s, r) => s + Number(r.costo_reparacion ?? 0), 0)
    const porEstatus = {}
    for (const r of reparaciones) {
      const k = String(r.estatus ?? '').trim() || '—'
      porEstatus[k] = (porEstatus[k] ?? 0) + 1
    }
    return { total, entregadas, activas, totalPagos, totalCosto, porEstatus }
  }, [reparaciones])

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return reparaciones
    return reparaciones.filter((r) => {
      const id = String(r.id ?? '')
      const est = String(r.estatus ?? '').toLowerCase()
      const nom = nombreCliente(clientes, r.cliente_id).toLowerCase()
      const desc = String(r.descripcion_equipo ?? '').toLowerCase()
      const tipo = String(r.tipo_reparacion ?? '').toLowerCase()
      const tech = String(r.tecnico ?? '').toLowerCase()
      return (
        id.includes(t) ||
        est.includes(t) ||
        nom.includes(t) ||
        desc.includes(t) ||
        tipo.includes(t) ||
        tech.includes(t)
      )
    })
  }, [reparaciones, busqueda, clientes])

  function volverAElegirFechas() {
    setPantalla('fechas')
    setReparaciones([])
    setPeriodoAplicado(null)
    setEstatusAplicado('')
    setSinColumnaFecha(false)
    setBusqueda('')
  }

  function imprimirReporte() {
    if (!periodoAplicado || reparaciones.length === 0) {
      onError?.('No hay datos del reporte para imprimir.')
      return
    }
    const periodoTxt = `${formatearFechaCorta(periodoAplicado.ini)} — ${formatearFechaCorta(periodoAplicado.fin)}`
    const estTxt = estatusAplicado ? escapeHtml(estatusAplicado) : 'Todos'
    const filas = reparaciones
      .map(
        (r) =>
          `<tr><td>${r.id ?? '—'}</td><td>${escapeHtml(nombreCliente(clientes, r.cliente_id))}</td><td>${escapeHtml(String(r.estatus ?? '—'))}</td><td>${escapeHtml(String(r.tipo_reparacion ?? '—'))}</td><td>${escapeHtml(extractDateYmd(r) ?? '—')}</td><td style="text-align:right">$${Number(r.pago ?? 0).toFixed(2)}</td><td style="text-align:right">$${Number(r.costo_reparacion ?? 0).toFixed(2)}</td></tr>`,
      )
      .join('')
    const porEstRows =
      Object.entries(resumen.porEstatus)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${n}</td></tr>`)
        .join('') || '<tr><td colspan="2">—</td></tr>'
    const html = `<h1>Reporte de reparaciones</h1>
<p><strong>Periodo:</strong> ${escapeHtml(periodoTxt)}<br><strong>Estatus filtrado:</strong> ${estTxt}</p>
<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:520px;margin-bottom:16px"><tbody>
<tr><th colspan="2" style="text-align:left;background:#eceff1">Resumen</th></tr>
<tr><td>Total órdenes</td><td style="text-align:right"><strong>${resumen.total}</strong></td></tr>
<tr><td>Activas (no entregadas)</td><td style="text-align:right">${resumen.activas}</td></tr>
<tr><td>Entregadas</td><td style="text-align:right">${resumen.entregadas}</td></tr>
<tr><td>Suma pagos</td><td style="text-align:right">$${resumen.totalPagos.toFixed(2)}</td></tr>
<tr><td>Suma costo reparación</td><td style="text-align:right">$${resumen.totalCosto.toFixed(2)}</td></tr>
</tbody></table>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:520px;margin-bottom:20px"><caption style="caption-side:top;text-align:left;font-weight:bold;padding:8px 0">Por estatus</caption><tbody>${porEstRows}</tbody></table>
<h2>Detalle de órdenes</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr><th>No</th><th>Cliente</th><th>Estatus</th><th>Tipo</th><th>Fecha</th><th>Pago</th><th>Costo</th></tr></thead><tbody>${filas}</tbody></table>`
    const w = window.open('', '_blank')
    if (!w) {
      onError?.('Permita ventanas emergentes para imprimir.')
      return
    }
    w.document.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte reparaciones</title><style>
body{font-family:Arial,sans-serif;padding:20px;color:#111}
h1{font-size:1.35rem;margin:0 0 12px}
h2{font-size:1.1rem;margin:20px 0 10px}
th{background:#eceff1;font-size:0.8rem}
td{font-size:0.88rem}
p{margin:0 0 16px;line-height:1.5}
</style></head><body>${html}<p class="muted">Imprima o guarde como PDF desde el navegador.</p></body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  if (pantalla === 'fechas') {
    return (
      <div className="servicios-root inventarios-root reportes-modulo-root">
        <header className="servicios-appbar">
          <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
            ←
          </button>
          <h1 className="servicios-appbar-title">
            <span className="appbar-title-emoji" aria-hidden="true">📊</span>
            Reportes
          </h1>
          <span className="servicios-appbar-placeholder" aria-hidden />
        </header>
        <div className="servicios-body">
          <section className="corte-caja-fechas-card card-pad reportes-fechas-card">
            <h2 className="corte-caja-fechas-titulo">Reporte de reparaciones</h2>
            <p className="muted small corte-caja-fechas-desc">
              Elija el periodo y, si desea, un estatus para filtrar las órdenes incluidas en el reporte.
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
              <label>
                Estatus (opcional)
                <select value={estatusFiltro} onChange={(e) => setEstatusFiltro(e.target.value)}>
                  <option value="">Todos</option>
                  {ESTATUS_ORDEN.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="btn-agregar-equipo btn-consultar-corte-caja"
              onClick={() => void onGenerarReporte()}
              disabled={loading}
            >
              {loading ? 'Generando…' : 'GENERAR REPORTE'}
            </button>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div className="servicios-root inventarios-root reportes-modulo-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">📊</span>
          Reportes
        </h1>
        <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={volverAElegirFechas}>
          Periodo
        </button>
      </header>

      <div className="servicios-body">
        {periodoAplicado ? (
          <p className="corte-caja-periodo-banner card-pad">
            <strong>Periodo:</strong> {formatearFechaCorta(periodoAplicado.ini)} — {formatearFechaCorta(periodoAplicado.fin)}
            {estatusAplicado ? (
              <>
                {' '}
                · <strong>Estatus:</strong> {estatusAplicado}
              </>
            ) : (
              <>
                {' '}
                · <strong>Estatus:</strong> Todos
              </>
            )}
          </p>
        ) : null}

        {sinColumnaFecha ? (
          <p className="warning card-pad corte-caja-warning-inset">
            Las órdenes no incluyen fecha reconocible en los datos; se listaron todas para calcular el reporte.
          </p>
        ) : null}

        <section className="corte-caja-resumen card-pad reportes-resumen">
          <h2 className="corte-caja-resumen-titulo">Resumen</h2>
          <div className="corte-caja-stats reportes-stats">
            <div className="corte-caja-stat total">
              <span className="label">Total órdenes</span>
              <strong>{resumen.total}</strong>
            </div>
            <div className="corte-caja-stat">
              <span className="label">Activas</span>
              <strong>{resumen.activas}</strong>
            </div>
            <div className="corte-caja-stat">
              <span className="label">Entregadas</span>
              <strong>{resumen.entregadas}</strong>
            </div>
            <div className="corte-caja-stat">
              <span className="label">Suma pagos</span>
              <strong>${resumen.totalPagos.toFixed(2)}</strong>
            </div>
            <div className="corte-caja-stat">
              <span className="label">Suma costo reparación</span>
              <strong>${resumen.totalCosto.toFixed(2)}</strong>
            </div>
          </div>
          <div className="reportes-por-estatus">
            <h3 className="reportes-subtitulo">Por estatus</h3>
            <ul className="reportes-estatus-lista">
              {Object.entries(resumen.porEstatus)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => (
                  <li key={k}>
                    <span>{k}</span>
                    <strong>{n}</strong>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <button
          type="button"
          className="btn-agregar-equipo btn-imprimir-corte-caja"
          onClick={imprimirReporte}
          disabled={loading || reparaciones.length === 0}
        >
          🖨 IMPRIMIR REPORTE
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar en este reporte (no, cliente, estatus, equipo…)"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>
              {busqueda.trim()
                ? 'No se encontraron resultados'
                : sinColumnaFecha
                  ? 'No hay órdenes'
                  : 'No hay órdenes en el periodo y filtro seleccionados'}
            </p>
          </div>
        ) : (
          <ul className="equipo-list inventario-list reportes-lista">
            {filtrados.map((r) => (
              <li key={r.id} className="equipo-card inventario-card reportes-card">
                <div className="equipo-card-main inventario-card-main reportes-fila">
                  <strong>Orden #{r.id}</strong>
                  <span className="muted">{nombreCliente(clientes, r.cliente_id)}</span>
                  <span className="corte-caja-chip">{String(r.estatus ?? '—')}</span>
                  <span className="muted small">{String(r.descripcion_equipo ?? r.tipo_reparacion ?? '—')}</span>
                  <span className="muted small">
                    Pago ${Number(r.pago ?? 0).toFixed(2)} · Costo ${Number(r.costo_reparacion ?? 0).toFixed(2)}
                    {extractDateYmd(r) ? ` · ${extractDateYmd(r)}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
