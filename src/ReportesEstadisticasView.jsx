import { useCallback, useMemo, useState } from 'react'
import {
  AGRUPACIONES_ESTADISTICAS,
  datasetsComparativaReporte,
  datasetsTienenDatos,
  guardarAgrupacionEstadisticas,
  hayDatosConFecha,
  kpisDesdeDatasets,
  labelPeriodoEje,
  leerAgrupacionEstadisticas,
  serieTieneDatos,
  tituloComparativa,
  totalesDesdeDatasets,
} from './reportesEstadisticas.js'

const W = 640
const H = 240
const PAD = { t: 36, r: 20, b: 48, l: 56 }

function yEtiquetaValor(yPunto, offset = 11) {
  return Math.max(12, Number(yPunto) - offset)
}

function dxEtiquetaSerie(indice, nSeries) {
  if (nSeries <= 1) return 0
  return (indice - (nSeries - 1) / 2) * 9
}

const BAR_COLORS = ['#1976d2', '#42a5f5', '#26a69a', '#66bb6a', '#ffa726', '#ab47bc', '#78909c']

function maxValor(series) {
  const m = Math.max(...(series ?? []).map((d) => Number(d.value) || 0), 0)
  return m <= 0 ? 1 : m
}

function maxValorDatasets(datasets) {
  let m = 0
  for (const d of datasets ?? []) {
    for (const p of d.points ?? []) {
      m = Math.max(m, Number(p.value) || 0)
    }
  }
  return m <= 0 ? 1 : m
}

function normalizarDatasets(datasets, series, color = '#1976d2') {
  if (datasets?.length) return datasets
  if (series?.length) {
    return [{ id: 'serie', label: 'Serie', color, points: series }]
  }
  return []
}

function formatCantEje(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

export function ReportesKpisSeleccion({ kpis }) {
  if (!kpis?.length) return null
  return (
    <section className="reportes-kpi-grid card-pad" aria-label="Cantidades de la selección">
      {kpis.map((k) => (
        <div key={k.id} className="reportes-kpi" style={{ borderTopColor: k.color }}>
          <span className="label">
            <span className="reportes-kpi-swatch" style={{ background: k.color }} aria-hidden />
            {k.label}
          </span>
          <strong>{k.value}</strong>
        </div>
      ))}
    </section>
  )
}

function LeyendaComparativa({ datasets }) {
  if (!datasets?.length) return null
  return (
    <ul className="reportes-chart-legend reportes-chart-legend--comparativa">
      {datasets.map((d) => (
        <li key={d.id}>
          <span className="reportes-chart-legend-swatch" style={{ background: d.color }} />
          {d.label}
        </li>
      ))}
    </ul>
  )
}

function SvgChartEmpty({ title, mensaje = 'Sin datos en este periodo' }) {
  return (
    <figure className="reportes-chart-card reportes-chart-card--empty">
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <div className="reportes-chart-empty" role="status">
        <span aria-hidden="true">📊</span>
        <p>{mensaje}</p>
      </div>
    </figure>
  )
}

function SvgDefs() {
  return (
    <defs>
      <linearGradient id="reportesAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1976d2" stopOpacity="0.28" />
        <stop offset="100%" stopColor="#1976d2" stopOpacity="0.02" />
      </linearGradient>
      <linearGradient id="reportesBarGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#42a5f5" />
        <stop offset="100%" stopColor="#1976d2" />
      </linearGradient>
    </defs>
  )
}

function SvgLineChart({ title, series, datasets, formatY = formatCantEje, formatXLabel }) {
  const fmtX = formatXLabel ?? ((l) => l)
  const sets = normalizarDatasets(datasets, series)
  const n = sets[0]?.points?.length ?? 0
  const conDatos = datasetsTienenDatos(sets)

  if (!conDatos || n === 0) {
    return <SvgChartEmpty title={title} />
  }

  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const maxY = maxValorDatasets(sets)
  const labels = sets[0].points.map((p) => p.label)
  const xAt = (i) => PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v) => PAD.t + innerH - (Number(v) / maxY) * innerH

  const gridLines = 4
  const yTicks = Array.from({ length: gridLines + 1 }, (_, i) => {
    const v = (maxY * (gridLines - i)) / gridLines
    const y = PAD.t + (i / gridLines) * innerH
    return { v, y, key: `y-${i}` }
  })
  const xStep = Math.max(1, Math.ceil(n / 7))
  const multi = sets.length > 1

  return (
    <figure className="reportes-chart-card">
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="reportes-chart-svg" role="img" aria-label={title}>
        {yTicks.map(({ v, y, key }) => (
          <g key={key}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} className="reportes-chart-grid" />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" className="reportes-chart-axis-y">
              {formatY(v)}
            </text>
          </g>
        ))}
        {sets.map((set, si) => {
          const pts = (set.points ?? []).map((d, i) => ({
            x: xAt(i),
            y: yAt(d.value),
            ...d,
          }))
          const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
          const dx = dxEtiquetaSerie(si, sets.length)
          return (
            <g key={`line-${set.id}`}>
              {linePath ? (
                <path d={linePath} fill="none" stroke={set.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
              {pts.map((p, i) => (
                <g key={`pt-${set.id}-${i}`}>
                  <circle cx={p.x} cy={p.y} r={multi ? 3.5 : 5} fill={set.color} className="reportes-chart-dot">
                    <title>{`${set.label}: ${formatY(p.value)}`}</title>
                  </circle>
                  {Number(p.value) > 0 ? (
                    <text
                      x={p.x + dx}
                      y={yEtiquetaValor(p.y)}
                      textAnchor="middle"
                      className="reportes-chart-point-val"
                      style={{ fill: set.color }}
                    >
                      {formatY(p.value)}
                    </text>
                  ) : null}
                </g>
              ))}
            </g>
          )
        })}
        {labels.map((label, i) =>
          i % xStep === 0 || i === n - 1 ? (
            <text key={`x-${i}-${label}`} x={xAt(i)} y={H - 14} textAnchor="middle" className="reportes-chart-axis-x">
              {fmtX(label)}
            </text>
          ) : null,
        )}
      </svg>
      <LeyendaComparativa datasets={sets} />
    </figure>
  )
}

/** Parte en dos líneas si el texto no cabe en una. */
function lineasEtiquetaBarra(texto, maxPorLinea = 11) {
  const t = String(texto ?? '').trim()
  if (!t) return ['—']
  if (t.length <= maxPorLinea) return [t]
  const corte = t.lastIndexOf(' ', maxPorLinea)
  if (corte > 3) return [t.slice(0, corte), t.slice(corte + 1)]
  const mitad = Math.ceil(t.length / 2)
  return [t.slice(0, mitad), t.slice(mitad)]
}

function SvgBarChart({
  title,
  series,
  datasets,
  formatY = formatCantEje,
  formatXLabel,
  formatBarValue,
  colorCycle = BAR_COLORS,
  /** Recuadros horizontales bajo cada barra (estatus). */
  chipXLabels = false,
}) {
  const fmtX = formatXLabel ?? ((l) => l)
  const fmtVal = formatBarValue ?? formatY
  const sets = normalizarDatasets(datasets, series, colorCycle[0])
  const grouped = Boolean(datasets?.length)
  const n = grouped ? (sets[0]?.points?.length ?? 0) : (series?.length ?? sets[0]?.points?.length ?? 0)
  const conDatos = grouped ? datasetsTienenDatos(sets) : serieTieneDatos(series ?? sets[0]?.points)

  if (!conDatos || n === 0) {
    return <SvgChartEmpty title={title} />
  }

  if (grouped) {
    const pad = PAD
    const innerW = W - pad.l - pad.r
    const innerH = H - pad.t - pad.b
    const maxY = maxValorDatasets(sets)
    const nSeries = sets.length
    const groupGap = n > 10 ? 4 : 8
    const groupW = n > 0 ? (innerW - groupGap * (n + 1)) / n : 0
    const barGap = 2
    const barW = Math.max(3, (groupW - barGap * (nSeries - 1)) / nSeries)
    const xStep = Math.max(1, Math.ceil(n / 8))
    const labels = sets[0].points.map((p) => p.label)

    return (
      <figure className="reportes-chart-card">
        <figcaption className="reportes-chart-title">{title}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="reportes-chart-svg" role="img" aria-label={title}>
          {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
            const y = pad.t + innerH * (1 - frac)
            const v = maxY * frac
            return (
              <g key={`grid-${i}`}>
                <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} className="reportes-chart-grid" />
                <text x={pad.l - 6} y={y + 4} textAnchor="end" className="reportes-chart-axis-y">
                  {formatY(v)}
                </text>
              </g>
            )
          })}
          {labels.map((label, i) => {
            const groupX = pad.l + groupGap + i * (groupW + groupGap)
            const cx = groupX + groupW / 2
            return (
              <g key={`grp-${i}-${label}`}>
                {sets.map((set, j) => {
                  const val = Number(set.points[i]?.value || 0)
                  const h = Math.max(val > 0 ? 3 : 0, (val / maxY) * innerH)
                  const x = groupX + j * (barW + barGap)
                  const y = pad.t + innerH - h
                  const cxBar = x + barW / 2
                  return (
                    <g key={`bar-${set.id}-${i}`}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={set.color}
                        className="reportes-chart-bar"
                      >
                        <title>{`${set.label}: ${fmtVal(val)}`}</title>
                      </rect>
                      {val > 0 ? (
                        <text
                          x={cxBar}
                          y={yEtiquetaValor(y, 5)}
                          textAnchor="middle"
                          className={`reportes-chart-bar-val${n > 12 || barW < 12 ? ' reportes-chart-bar-val--dense' : ''}`}
                          style={{ fill: set.color }}
                        >
                          {fmtVal(val)}
                        </text>
                      ) : null}
                    </g>
                  )
                })}
                {i % xStep === 0 || i === n - 1 ? (
                  <text
                    x={cx}
                    y={H - 12}
                    textAnchor="middle"
                    className="reportes-chart-axis-x reportes-chart-axis-x--bar"
                  >
                    {fmtX(label)}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
        <LeyendaComparativa datasets={sets} />
      </figure>
    )
  }

  const pad = chipXLabels ? { ...PAD, b: 16 } : PAD
  const chartH = H
  const innerW = W - pad.l - pad.r
  const innerH = chartH - pad.t - pad.b
  const maxY = maxValor(series)

  const slotGap = chipXLabels ? 14 : 0
  const slotW = chipXLabels && n > 0 ? (innerW - slotGap * (n + 1)) / n : 0
  const gap =
    chipXLabels && n <= 8
      ? slotGap
      : n > 14
        ? 4
        : 8
  const barW =
    n > 0
      ? chipXLabels && n <= 8
        ? Math.min(44, Math.max(20, slotW * 0.42))
        : Math.max(6, Math.min(40, (innerW - gap * (n + 1)) / n))
      : 0
  const totalBarsW = chipXLabels ? innerW : n * barW + (n + 1) * gap
  const offsetX = chipXLabels ? pad.l : pad.l + Math.max(0, (innerW - totalBarsW) / 2)
  const xStep = chipXLabels ? 1 : Math.max(1, Math.ceil(n / 8))

  return (
    <figure className={`reportes-chart-card${chipXLabels ? ' reportes-chart-card--chip-labels' : ''}`}>
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${chartH}`} className="reportes-chart-svg" role="img" aria-label={title}>
        <SvgDefs />
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const y = pad.t + innerH * (1 - frac)
          const v = maxY * frac
          return (
            <g key={`grid-${i}`}>
              <line x1={pad.l} y1={y} x2={W - pad.r} y2={y} className="reportes-chart-grid" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" className="reportes-chart-axis-y">
                {formatY(v)}
              </text>
            </g>
          )
        })}
        {series.map((d, i) => {
          const val = Number(d.value) || 0
          const h = Math.max(val > 0 ? 3 : 0, (val / maxY) * innerH)
          const slotX = chipXLabels ? offsetX + slotGap + i * (slotW + slotGap) : offsetX + gap + i * (barW + gap)
          const cx = chipXLabels ? slotX + slotW / 2 : slotX + barW / 2
          const x = cx - barW / 2
          const y = pad.t + innerH - h
          const xLbl = fmtX(d.label)
          const short = xLbl.length > 10 && !chipXLabels ? `${xLbl.slice(0, 9)}…` : xLbl
          const fill = colorCycle[i % colorCycle.length]
          return (
            <g key={`bar-${i}-${d.label}`}>
              <rect x={x} y={y} width={barW} height={h} rx={3} fill={fill} className="reportes-chart-bar" />
              {val > 0 ? (
                <text x={cx} y={yEtiquetaValor(y, 5)} textAnchor="middle" className="reportes-chart-bar-val">
                  {fmtVal(val)}
                </text>
              ) : null}
              {!chipXLabels && (i % xStep === 0 || i === n - 1) ? (
                <text
                  x={cx}
                  y={chartH - 12}
                  textAnchor="middle"
                  className="reportes-chart-axis-x reportes-chart-axis-x--bar"
                >
                  <title>{String(d.label ?? xLbl)}</title>
                  {short}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {chipXLabels ? (
        <div className="reportes-bar-chips" style={{ paddingLeft: pad.l, paddingRight: pad.r }}>
          <div
            className="reportes-bar-chips-grid"
            style={{
              gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
              columnGap: slotGap,
            }}
          >
            {series.map((d, i) => {
              const xLbl = fmtX(d.label)
              const lineas = lineasEtiquetaBarra(xLbl, 14)
              const fill = colorCycle[i % colorCycle.length]
              return (
                <div
                  key={`chip-${i}-${d.label}`}
                  className="reportes-bar-chip"
                  style={{ borderTopColor: fill }}
                  title={String(d.label ?? xLbl)}
                >
                  {lineas.map((linea) => (
                    <span key={linea} className="reportes-bar-chip-line">
                      {linea}
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}
    </figure>
  )
}

function SvgDonutChart({ title, series }) {
  const total = series.reduce((s, d) => s + Number(d.value), 0)
  const cx = W / 2
  const cy = H / 2 - 6
  const r = 78
  const ir = 48

  if (total <= 0) {
    return <SvgChartEmpty title={title} />
  }

  let acc = 0
  const slices = series.map((d, i) => {
    const start = (acc / total) * Math.PI * 2 - Math.PI / 2
    acc += Number(d.value)
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
    return { ...d, path, pct: Math.round((Number(d.value) / total) * 100), color: d.color ?? BAR_COLORS[i % BAR_COLORS.length] }
  })

  return (
    <figure className="reportes-chart-card reportes-chart-card--donut">
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="reportes-chart-svg" role="img" aria-label={title}>
        {slices.map((s, i) => (
          <path key={`slice-${i}-${s.label}`} d={s.path} fill={s.color} className="reportes-chart-slice" />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="reportes-chart-donut-center">
          {total}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="reportes-chart-donut-sub">
          total
        </text>
      </svg>
      <ul className="reportes-chart-legend">
        {slices.map((s, i) => (
          <li key={`leg-${i}-${s.label}`}>
            <span className="reportes-chart-legend-swatch" style={{ background: s.color }} />
            {s.label}: <strong>{s.value}</strong>
            <span className="reportes-chart-legend-pct"> ({s.pct}%)</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

function GraficasTemporales({ agrupacion, datasets }) {
  const fmtX = useCallback((l) => labelPeriodoEje(l, agrupacion), [agrupacion])
  const totales = useMemo(() => totalesDesdeDatasets(datasets), [datasets])
  const titulo = tituloComparativa(agrupacion)

  return (
    <section className="reportes-graficas-comparativa" aria-label={titulo}>
      <SvgLineChart title={`${titulo} (lineal)`} datasets={datasets} formatXLabel={fmtX} />
      <SvgBarChart title={`${titulo} (barras)`} datasets={datasets} formatXLabel={fmtX} />
      <SvgDonutChart title={`${titulo} (circular)`} series={totales} />
    </section>
  )
}

export default function ReportesEstadisticasView({
  reparaciones,
  periodoAplicado,
  estatusAplicado,
  formatearFechaCorta,
  soloPeriodo = false,
  duplicadasExcluidas = 0,
  loading = false,
  filtrosSlot = null,
  onVolver,
  onHome,
}) {
  const [agrupacion, setAgrupacion] = useState(leerAgrupacionEstadisticas)

  const cambiarAgrupacion = (id) => {
    setAgrupacion(id)
    guardarAgrupacionEstadisticas(id)
  }

  const conFecha = useMemo(() => hayDatosConFecha(reparaciones), [reparaciones])
  const datasets = useMemo(
    () =>
      datasetsComparativaReporte({
        reparaciones,
        periodo: periodoAplicado,
        agrupacion,
        incluirIngreso: Boolean(periodoAplicado?.incluirIngreso),
        incluirEntrega: Boolean(periodoAplicado?.incluirEntrega),
        incluirEstatus: Boolean(periodoAplicado?.incluirEstatus),
        estatusSet: periodoAplicado?.estatusSet,
      }),
    [reparaciones, periodoAplicado, agrupacion],
  )
  const kpis = useMemo(() => kpisDesdeDatasets(datasets), [datasets])

  const periodoTxt = periodoAplicado
    ? `${formatearFechaCorta(periodoAplicado.ini)} — ${formatearFechaCorta(periodoAplicado.fin)}`
    : '—'
  const filtrosTxt = String(estatusAplicado || '').trim()

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
        {onHome ? (
          <button type="button" className="appbar-text-btn appbar-text-btn--narrow" onClick={onHome}>
            Inicio
          </button>
        ) : (
          <span className="servicios-appbar-placeholder" aria-hidden />
        )}
      </header>

      <div className="servicios-body corte-caja-body reportes-body">
        {filtrosSlot}

        <div className="corte-caja-periodo-banner card-pad" role="status">
          <span className="corte-caja-periodo-ico" aria-hidden="true">
            📆
          </span>
          <span>
            <strong>Periodo:</strong> {periodoTxt}
            {filtrosTxt ? (
              <>
                {' '}
                · <strong>Comparativa:</strong> {filtrosTxt}
              </>
            ) : null}
          </span>
        </div>

        {duplicadasExcluidas > 0 ? (
          <p className="reportes-aviso-duplicadas card-pad" role="status">
            <span aria-hidden="true">🔄</span> Las gráficas no incluyen <strong>{duplicadasExcluidas}</strong>{' '}
            {duplicadasExcluidas === 1 ? 'orden duplicada' : 'órdenes duplicadas'} del periodo.
          </p>
        ) : null}

        {conFecha && periodoAplicado ? (
          <div
            className="reportes-agrupacion-bar card-pad"
            role="group"
            aria-label="Comparativo de gráficas por día, mes o año"
          >
            <span className="reportes-agrupacion-label">
              <span aria-hidden="true">📉</span> Comparativo:
            </span>
            <div className="reportes-agrupacion-opciones">
              {AGRUPACIONES_ESTADISTICAS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`reportes-agrupacion-btn${agrupacion === opt.id ? ' reportes-agrupacion-btn--activo' : ''}`}
                  aria-pressed={agrupacion === opt.id}
                  onClick={() => cambiarAgrupacion(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {loading ? <p className="muted center card-pad">Actualizando gráficas…</p> : null}

        {!loading && kpis.length > 0 ? <ReportesKpisSeleccion kpis={kpis} /> : null}

        {!loading && !conFecha ? (
          <p className="corte-caja-warning-inset card-pad">
            <span aria-hidden="true">⚠️</span> No hay fechas en las órdenes; las gráficas por periodo no están
            disponibles.
          </p>
        ) : !loading && conFecha ? (
          <GraficasTemporales agrupacion={agrupacion} datasets={datasets} />
        ) : null}

        <button type="button" className="btn-agregar-equipo btn-volver-reporte" onClick={onVolver}>
          {soloPeriodo ? '← Volver al reporte' : '← Volver'}
        </button>
      </div>
    </div>
  )
}
