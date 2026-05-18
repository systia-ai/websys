import { useMemo } from 'react'
import {
  hayDatosConFecha,
  labelDiaCorta,
  serieEntregadasActivas,
  serieEstatus,
  serieOrdenesPorDia,
  seriePagosPorDia,
} from './reportesEstadisticas.js'

const W = 640
const H = 220
const PAD = { t: 24, r: 16, b: 44, l: 52 }

function maxValor(series) {
  const m = Math.max(...series.map((d) => d.value), 0)
  return m <= 0 ? 1 : m
}

function SvgLineChart({ title, series, formatY = (v) => String(v) }) {
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const maxY = maxValor(series)
  const n = series.length

  const pts = series.map((d, i) => {
    const x = PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = PAD.t + innerH - (d.value / maxY) * innerH
    return { x, y, ...d }
  })

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath =
    pts.length > 0
      ? `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${pts[0].x.toFixed(1)},${(PAD.t + innerH).toFixed(1)} Z`
      : ''

  const gridLines = 4
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = (maxY * (gridLines - i)) / gridLines
    const y = PAD.t + (i / gridLines) * innerH
    return { v, y }
  })

  const xStep = Math.max(1, Math.ceil(n / 8))

  return (
    <figure className="reportes-chart-card">
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="reportes-chart-svg" role="img" aria-label={title}>
        {yTicks.map(({ v, y }) => (
          <g key={v}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} className="reportes-chart-grid" />
            <text x={PAD.l - 8} y={y + 4} textAnchor="end" className="reportes-chart-axis-y">
              {formatY(v)}
            </text>
          </g>
        ))}
        {areaPath ? <path d={areaPath} className="reportes-chart-area" /> : null}
        {linePath ? <path d={linePath} className="reportes-chart-line" fill="none" /> : null}
        {pts.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r={4} className="reportes-chart-dot" />
        ))}
        {pts.map((p, i) =>
          i % xStep === 0 || i === n - 1 ? (
            <text key={`x-${p.label}`} x={p.x} y={H - 12} textAnchor="middle" className="reportes-chart-axis-x">
              {labelDiaCorta(p.label)}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  )
}

function SvgBarChart({ title, series, formatY = (v) => String(v) }) {
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const maxY = maxValor(series)
  const n = series.length
  const gap = 12
  const barW = n > 0 ? Math.min(48, (innerW - gap * (n + 1)) / n) : 0

  return (
    <figure className="reportes-chart-card">
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="reportes-chart-svg" role="img" aria-label={title}>
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = PAD.t + innerH * (1 - frac)
          const v = maxY * frac
          return (
            <g key={frac}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} className="reportes-chart-grid" />
              <text x={PAD.l - 8} y={y + 4} textAnchor="end" className="reportes-chart-axis-y">
                {formatY(v)}
              </text>
            </g>
          )
        })}
        {series.map((d, i) => {
          const h = (d.value / maxY) * innerH
          const x = PAD.l + gap + i * (barW + gap)
          const y = PAD.t + innerH - h
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={h} rx={4} className="reportes-chart-bar" />
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" className="reportes-chart-axis-x reportes-chart-axis-x--bar">
                {d.label.length > 10 ? `${d.label.slice(0, 9)}…` : d.label}
              </text>
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="reportes-chart-bar-val">
                {d.value}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

function SvgDonutChart({ title, series }) {
  const total = series.reduce((s, d) => s + d.value, 0)
  const cx = W / 2
  const cy = H / 2 - 8
  const r = 72
  const ir = 44
  let acc = 0

  const slices =
    total <= 0
      ? []
      : series.map((d) => {
          const start = (acc / total) * Math.PI * 2 - Math.PI / 2
          acc += d.value
          const end = (acc / total) * Math.PI * 2 - Math.PI / 2
          const x1 = cx + r * Math.cos(start)
          const y1 = cy + r * Math.sin(start)
          const x2 = cx + r * Math.cos(end)
          const y2 = cy + r * Math.sin(end)
          const xi1 = cx + ir * Math.cos(end)
          const yi1 = cy + ir * Math.sin(end)
          const xi2 = cx + ir * Math.cos(start)
          const yi2 = cy + ir * Math.sin(start)
          const large = end - start > Math.PI ? 1 : 0
          const path = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi1},${yi1} A${ir},${ir} 0 ${large} 0 ${xi2},${yi2} Z`
          return { ...d, path }
        })

  return (
    <figure className="reportes-chart-card reportes-chart-card--donut">
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="reportes-chart-svg" role="img" aria-label={title}>
        {slices.map((s) => (
          <path key={s.label} d={s.path} fill={s.color ?? '#1976d2'} className="reportes-chart-slice" />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="reportes-chart-donut-center">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="reportes-chart-donut-sub">
          órdenes
        </text>
      </svg>
      <ul className="reportes-chart-legend">
        {series.map((s) => (
          <li key={s.label}>
            <span className="reportes-chart-legend-swatch" style={{ background: s.color ?? '#1976d2' }} />
            {s.label}: <strong>{s.value}</strong>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export default function ReportesEstadisticasView({
  reparaciones,
  resumen,
  periodoAplicado,
  estatusAplicado,
  formatearFechaCorta,
  soloPeriodo = false,
  loading = false,
  filtrosSlot = null,
  onVolver,
}) {
  const conFecha = useMemo(() => hayDatosConFecha(reparaciones), [reparaciones])

  const ordenesDia = useMemo(
    () => serieOrdenesPorDia(reparaciones, periodoAplicado),
    [reparaciones, periodoAplicado],
  )
  const pagosDia = useMemo(
    () => seriePagosPorDia(reparaciones, periodoAplicado),
    [reparaciones, periodoAplicado],
  )
  const estatusSerie = useMemo(() => serieEstatus(resumen.porEstatus), [resumen.porEstatus])
  const entregadasSerie = useMemo(
    () => serieEntregadasActivas(resumen.entregadas, resumen.activas),
    [resumen.entregadas, resumen.activas],
  )

  const periodoTxt = periodoAplicado
    ? `${formatearFechaCorta(periodoAplicado.ini)} — ${formatearFechaCorta(periodoAplicado.fin)}`
    : '—'

  return (
    <div className="servicios-root inventarios-root reportes-modulo-root reportes-estadisticas-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onVolver} aria-label="Volver al reporte">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">
            📈
          </span>
          {soloPeriodo ? 'Estadísticas del periodo' : 'Estadísticas'}
        </h1>
        <span className="servicios-appbar-placeholder" aria-hidden />
      </header>

      <div className="servicios-body">
        {filtrosSlot}

        <p className="corte-caja-periodo-banner card-pad">
          <strong>Periodo:</strong> {periodoTxt}
          {' '}
          · <strong>Estatus:</strong> {estatusAplicado || 'Todos'}
        </p>

        {loading ? <p className="muted center card-pad">Actualizando gráficas…</p> : null}

        {!soloPeriodo ? (
        <section className="reportes-kpi-grid card-pad">
          <div className="reportes-kpi">
            <span className="label">Órdenes</span>
            <strong>{resumen.total}</strong>
          </div>
          <div className="reportes-kpi">
            <span className="label">Pagos</span>
            <strong>${resumen.totalPagos.toFixed(2)}</strong>
          </div>
          <div className="reportes-kpi">
            <span className="label">Costo reparación</span>
            <strong>${resumen.totalCosto.toFixed(2)}</strong>
          </div>
          <div className="reportes-kpi">
            <span className="label">Entregadas</span>
            <strong>{resumen.entregadas}</strong>
          </div>
        </section>
        ) : null}

        {!loading && !conFecha ? (
          <p className="warning card-pad">
            No hay fechas en las órdenes de este reporte; las gráficas por día no están disponibles.
          </p>
        ) : !loading && conFecha ? (
          <>
            <SvgLineChart title="Órdenes por día" series={ordenesDia} />
            <SvgLineChart
              title="Ingresos por día (pagos)"
              series={pagosDia}
              formatY={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`)}
            />
          </>
        ) : null}

        {!loading && estatusSerie.length > 0 ? (
          <SvgBarChart title="Órdenes por estatus" series={estatusSerie} />
        ) : null}

        {!loading && entregadasSerie.length > 0 ? (
          <SvgDonutChart title="Entregadas vs activas" series={entregadasSerie} />
        ) : null}

        <button type="button" className="btn-agregar-equipo btn-volver-reporte" onClick={onVolver}>
          {soloPeriodo ? '← Volver al reporte' : '← Volver'}
        </button>
      </div>
    </div>
  )
}
