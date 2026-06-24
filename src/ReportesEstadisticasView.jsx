import { useCallback, useMemo, useState } from 'react'
import {
  AGRUPACIONES_ESTADISTICAS,
  guardarAgrupacionEstadisticas,
  hayDatosConFecha,
  labelDiaCorta,
  labelEstatusGrafica,
  labelPeriodoEje,
  leerAgrupacionEstadisticas,
  reparacionesEnRango,
  segmentosAnioEnPeriodo,
  segmentosMesEnPeriodo,
  serieDistribucionOrdenes,
  serieEstatus,
  serieOrdenesAgrupada,
  serieOrdenesPorDia,
  serieTieneDatos,
  serieVerificadasAgrupada,
  tituloAgrupacionOrdenes,
  tituloAgrupacionVerificadas,
} from './reportesEstadisticas.js'

const W = 640
const H = 240
const PAD = { t: 28, r: 20, b: 48, l: 56 }

const BAR_COLORS = ['#1976d2', '#42a5f5', '#26a69a', '#66bb6a', '#ffa726', '#ab47bc', '#78909c']

function maxValor(series) {
  const m = Math.max(...(series ?? []).map((d) => Number(d.value) || 0), 0)
  return m <= 0 ? 1 : m
}

function formatCantEje(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
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

function SvgLineChart({ title, series, formatY = formatCantEje, formatXLabel }) {
  const fmtX = formatXLabel ?? ((l) => l)
  const conDatos = serieTieneDatos(series)
  const n = series?.length ?? 0

  if (!conDatos || n === 0) {
    return <SvgChartEmpty title={title} />
  }

  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const maxY = maxValor(series)
  const pts = series.map((d, i) => {
    const x = PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
    const y = PAD.t + innerH - (Number(d.value) / maxY) * innerH
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
    return { v, y, key: `y-${i}` }
  })

  const xStep = Math.max(1, Math.ceil(n / 7))

  return (
    <figure className="reportes-chart-card">
      <figcaption className="reportes-chart-title">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="reportes-chart-svg" role="img" aria-label={title}>
        <SvgDefs />
        {yTicks.map(({ v, y, key }) => (
          <g key={key}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} className="reportes-chart-grid" />
            <text x={PAD.l - 6} y={y + 4} textAnchor="end" className="reportes-chart-axis-y">
              {formatY(v)}
            </text>
          </g>
        ))}
        {areaPath ? <path d={areaPath} fill="url(#reportesAreaGrad)" /> : null}
        {linePath ? <path d={linePath} className="reportes-chart-line" fill="none" /> : null}
        {pts.map((p, i) => (
          <g key={`pt-${i}-${p.label}`}>
            <circle cx={p.x} cy={p.y} r={5} className="reportes-chart-dot" />
            {Number(p.value) > 0 ? (
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="reportes-chart-point-val">
                {formatY(p.value)}
              </text>
            ) : null}
          </g>
        ))}
        {pts.map((p, i) =>
          i % xStep === 0 || i === n - 1 ? (
            <text key={`x-${i}-${p.label}`} x={p.x} y={H - 14} textAnchor="middle" className="reportes-chart-axis-x">
              {fmtX(p.label)}
            </text>
          ) : null,
        )}
      </svg>
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
  formatY = formatCantEje,
  formatXLabel,
  formatBarValue,
  colorCycle = BAR_COLORS,
  /** Recuadros horizontales bajo cada barra (estatus). */
  chipXLabels = false,
}) {
  const fmtX = formatXLabel ?? ((l) => l)
  const fmtVal = formatBarValue ?? formatY
  const conDatos = serieTieneDatos(series)
  const n = series?.length ?? 0

  if (!conDatos || n === 0) {
    return <SvgChartEmpty title={title} />
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
              {val > 0 && h >= 14 ? (
                <text x={cx} y={y - 5} textAnchor="middle" className="reportes-chart-bar-val">
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
          órdenes
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

function GraficasTemporales({ agrupacion, reparaciones, periodoAplicado }) {
  const periodo = periodoAplicado
  const fmtX = useCallback((l) => labelPeriodoEje(l, agrupacion), [agrupacion])

  const ordenesSerie = useMemo(
    () => serieOrdenesAgrupada(reparaciones, periodo, agrupacion),
    [reparaciones, periodo, agrupacion],
  )
  const verificadasSerie = useMemo(
    () => serieVerificadasAgrupada(reparaciones, periodo, agrupacion),
    [reparaciones, periodo, agrupacion],
  )

  const mesesDetalle = useMemo(
    () => (agrupacion === 'mes' ? segmentosMesEnPeriodo(periodo) : []),
    [agrupacion, periodo],
  )
  const aniosDetalle = useMemo(
    () => (agrupacion === 'anio' ? segmentosAnioEnPeriodo(periodo) : []),
    [agrupacion, periodo],
  )
  const fmtMes = useCallback((l) => labelPeriodoEje(l, 'mes'), [])

  const tituloOrdenes = tituloAgrupacionOrdenes(agrupacion)
  const tituloVerificadas = tituloAgrupacionVerificadas(agrupacion)
  const usarBarras = agrupacion === 'semana' || agrupacion === 'mes' || agrupacion === 'anio'
  const colorVerificadas = ['#00695c', '#00897b', '#26a69a', '#4db6ac', '#80cbc4']

  return (
    <>
      {usarBarras ? (
        <>
          <SvgBarChart title={tituloOrdenes} series={ordenesSerie} formatXLabel={fmtX} />
          <SvgBarChart
            title={tituloVerificadas}
            series={verificadasSerie}
            formatXLabel={fmtX}
            colorCycle={colorVerificadas}
          />
        </>
      ) : (
        <>
          <SvgLineChart title={tituloOrdenes} series={ordenesSerie} formatXLabel={fmtX} />
          <SvgLineChart title={tituloVerificadas} series={verificadasSerie} formatXLabel={fmtX} />
        </>
      )}

      {mesesDetalle.length > 0 ? (
        <section className="reportes-meses-detalle" aria-labelledby="reportes-meses-detalle-titulo">
          <h2 id="reportes-meses-detalle-titulo" className="reportes-meses-detalle-titulo">
            Detalle por mes
          </h2>
          <p className="reportes-meses-detalle-desc muted">
            Vista diaria dentro de cada mes del periodo seleccionado.
          </p>
          {mesesDetalle.map((seg) => {
            const repMes = reparacionesEnRango(reparaciones, seg.ini, seg.fin)
            const ordenesDia = serieOrdenesPorDia(repMes, { ini: seg.ini, fin: seg.fin })
            const verificadasDia = serieVerificadasAgrupada(repMes, { ini: seg.ini, fin: seg.fin }, 'dia')
            if (!serieTieneDatos(ordenesDia) && !serieTieneDatos(verificadasDia)) return null
            return (
              <div key={seg.key} className="reportes-mes-detalle card-pad">
                <h3 className="reportes-mes-detalle-nombre">{seg.label}</h3>
                <SvgLineChart title={`Órdenes — ${seg.label}`} series={ordenesDia} formatXLabel={labelDiaCorta} />
                <SvgLineChart
                  title={`Verificaciones — ${seg.label}`}
                  series={verificadasDia}
                  formatXLabel={labelDiaCorta}
                />
              </div>
            )
          })}
        </section>
      ) : null}

      {aniosDetalle.length > 0 ? (
        <section className="reportes-meses-detalle" aria-labelledby="reportes-anios-detalle-titulo">
          <h2 id="reportes-anios-detalle-titulo" className="reportes-meses-detalle-titulo">
            Detalle por año
          </h2>
          <p className="reportes-meses-detalle-desc muted">
            Vista mensual dentro de cada año del periodo seleccionado.
          </p>
          {aniosDetalle.map((seg) => {
            const repAnio = reparacionesEnRango(reparaciones, seg.ini, seg.fin)
            const ordenesMes = serieOrdenesAgrupada(repAnio, { ini: seg.ini, fin: seg.fin }, 'mes')
            const verificadasMes = serieVerificadasAgrupada(repAnio, { ini: seg.ini, fin: seg.fin }, 'mes')
            if (!serieTieneDatos(ordenesMes) && !serieTieneDatos(verificadasMes)) return null
            return (
              <div key={seg.key} className="reportes-mes-detalle card-pad">
                <h3 className="reportes-mes-detalle-nombre">{seg.label}</h3>
                <SvgBarChart title={`Órdenes por mes — ${seg.label}`} series={ordenesMes} formatXLabel={fmtMes} />
                <SvgBarChart
                  title={`Verificaciones por mes — ${seg.label}`}
                  series={verificadasMes}
                  formatXLabel={fmtMes}
                  colorCycle={colorVerificadas}
                />
              </div>
            )
          })}
        </section>
      ) : null}
    </>
  )
}

export default function ReportesEstadisticasView({
  reparaciones,
  resumen,
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
  const estatusSerie = useMemo(() => serieEstatus(resumen.porEstatus), [resumen.porEstatus])
  const distribucionSerie = useMemo(
    () =>
      serieDistribucionOrdenes({
        entregadas: resumen.entregadas,
        verificadas: resumen.verificadas,
        enProceso: resumen.enProceso,
      }),
    [resumen.entregadas, resumen.verificadas, resumen.enProceso],
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
            <strong>Periodo:</strong> {periodoTxt} · <strong>Estatus:</strong> {estatusAplicado || 'Todos'}
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
            aria-label="Agrupar gráficas por periodo"
          >
            <span className="reportes-agrupacion-label">
              <span aria-hidden="true">📉</span> Ver gráficas:
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

        {!soloPeriodo ? (
          <section className="reportes-kpi-grid card-pad">
            <div className="reportes-kpi">
              <span className="label">
                <span aria-hidden="true">🧾</span> Órdenes
              </span>
              <strong>{resumen.total}</strong>
            </div>
            <div className="reportes-kpi">
              <span className="label">
                <span aria-hidden="true">✅</span> Entregadas
              </span>
              <strong>{resumen.entregadas}</strong>
            </div>
            <div className="reportes-kpi reportes-kpi--verificadas">
              <span className="label">
                <span aria-hidden="true">✓</span> Verificadas
              </span>
              <strong>{resumen.verificadas}</strong>
            </div>
          </section>
        ) : null}

        {!loading && !conFecha ? (
          <p className="corte-caja-warning-inset card-pad">
            <span aria-hidden="true">⚠️</span> No hay fechas en las órdenes; las gráficas por periodo no están
            disponibles.
          </p>
        ) : !loading && conFecha ? (
          <GraficasTemporales
            agrupacion={agrupacion}
            reparaciones={reparaciones}
            periodoAplicado={periodoAplicado}
          />
        ) : null}

        {!loading && estatusSerie.length > 0 ? (
          <SvgBarChart
            title="Órdenes por estatus"
            series={estatusSerie}
            formatXLabel={labelEstatusGrafica}
            chipXLabels
          />
        ) : null}

        {!loading && distribucionSerie.length > 0 ? (
          <SvgDonutChart title="En taller, verificadas y entregadas" series={distribucionSerie} />
        ) : null}

        <button type="button" className="btn-agregar-equipo btn-volver-reporte" onClick={onVolver}>
          {soloPeriodo ? '← Volver al reporte' : '← Volver'}
        </button>
      </div>
    </div>
  )
}
