import { useCallback, useMemo, useState } from 'react'
import {
  AGRUPACIONES_ESTADISTICAS,
  guardarAgrupacionEstadisticas,
  hayDatosConFecha,
  labelDiaCorta,
  labelPeriodoEje,
  leerAgrupacionEstadisticas,
  reparacionesEnRango,
  segmentosAnioEnPeriodo,
  segmentosMesEnPeriodo,
  serieEntregadasActivas,
  serieEstatus,
  serieOrdenesAgrupada,
  serieOrdenesPorDia,
  seriePagosAgrupada,
  seriePagosPorDia,
  tituloAgrupacionOrdenes,
  tituloAgrupacionPagos,
} from './reportesEstadisticas.js'

const W = 640
const H = 220
const PAD = { t: 24, r: 16, b: 44, l: 52 }

function maxValor(series) {
  const m = Math.max(...series.map((d) => d.value), 0)
  return m <= 0 ? 1 : m
}

function SvgLineChart({ title, series, formatY = (v) => String(v), formatXLabel }) {
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const maxY = maxValor(series)
  const n = series.length
  const fmtX = formatXLabel ?? ((l) => l)

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
              {fmtX(p.label)}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  )
}

function SvgBarChart({
  title,
  series,
  formatY = (v) => String(v),
  formatXLabel,
  formatBarValue,
}) {
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const maxY = maxValor(series)
  const n = series.length
  const gap = 12
  const barW = n > 0 ? Math.min(48, (innerW - gap * (n + 1)) / n) : 0
  const fmtX = formatXLabel ?? ((l) => l)

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
          const xLbl = fmtX(d.label)
          const short = xLbl.length > 12 ? `${xLbl.slice(0, 11)}…` : xLbl
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={h} rx={4} className="reportes-chart-bar" />
              <text x={x + barW / 2} y={H - 10} textAnchor="middle" className="reportes-chart-axis-x reportes-chart-axis-x--bar">
                {short}
              </text>
              <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="reportes-chart-bar-val">
                {formatBarValue ? formatBarValue(d.value) : d.value}
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

function formatPagoEje(v) {
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`
}

function GraficasTemporales({ agrupacion, reparaciones, periodoAplicado }) {
  const periodo = periodoAplicado
  const fmtX = useCallback((l) => labelPeriodoEje(l, agrupacion), [agrupacion])

  const ordenesSerie = useMemo(
    () => serieOrdenesAgrupada(reparaciones, periodo, agrupacion),
    [reparaciones, periodo, agrupacion],
  )
  const pagosSerie = useMemo(
    () => seriePagosAgrupada(reparaciones, periodo, agrupacion),
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
  const tituloPagos = tituloAgrupacionPagos(agrupacion)
  const usarBarras = agrupacion === 'semana' || agrupacion === 'mes' || agrupacion === 'anio'

  return (
    <>
      {usarBarras ? (
        <>
          <SvgBarChart title={tituloOrdenes} series={ordenesSerie} formatXLabel={fmtX} />
          <SvgBarChart
            title={tituloPagos}
            series={pagosSerie}
            formatY={formatPagoEje}
            formatBarValue={formatPagoEje}
            formatXLabel={fmtX}
          />
        </>
      ) : (
        <>
          <SvgLineChart title={tituloOrdenes} series={ordenesSerie} formatXLabel={fmtX} />
          <SvgLineChart title={tituloPagos} series={pagosSerie} formatY={formatPagoEje} formatXLabel={fmtX} />
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
            const pagosDia = seriePagosPorDia(repMes, { ini: seg.ini, fin: seg.fin })
            const totalOrdenes = ordenesDia.reduce((s, d) => s + d.value, 0)
            if (totalOrdenes === 0 && pagosDia.every((d) => d.value === 0)) return null
            return (
              <div key={seg.key} className="reportes-mes-detalle card-pad">
                <h3 className="reportes-mes-detalle-nombre">{seg.label}</h3>
                <SvgLineChart
                  title={`Órdenes — ${seg.label}`}
                  series={ordenesDia}
                  formatXLabel={labelDiaCorta}
                />
                <SvgLineChart
                  title={`Ingresos — ${seg.label}`}
                  series={pagosDia}
                  formatY={formatPagoEje}
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
            const pagosMes = seriePagosAgrupada(repAnio, { ini: seg.ini, fin: seg.fin }, 'mes')
            const totalOrdenes = ordenesMes.reduce((s, d) => s + d.value, 0)
            if (totalOrdenes === 0 && pagosMes.every((d) => d.value === 0)) return null
            return (
              <div key={seg.key} className="reportes-mes-detalle card-pad">
                <h3 className="reportes-mes-detalle-nombre">{seg.label}</h3>
                <SvgBarChart title={`Órdenes por mes — ${seg.label}`} series={ordenesMes} formatXLabel={fmtMes} />
                <SvgBarChart
                  title={`Ingresos por mes — ${seg.label}`}
                  series={pagosMes}
                  formatY={formatPagoEje}
                  formatBarValue={formatPagoEje}
                  formatXLabel={fmtMes}
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
}) {
  const [agrupacion, setAgrupacion] = useState(leerAgrupacionEstadisticas)

  const cambiarAgrupacion = (id) => {
    setAgrupacion(id)
    guardarAgrupacionEstadisticas(id)
  }

  const conFecha = useMemo(() => hayDatosConFecha(reparaciones), [reparaciones])
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

        {duplicadasExcluidas > 0 ? (
          <p className="reportes-aviso-duplicadas card-pad" role="status">
            Las gráficas no incluyen <strong>{duplicadasExcluidas}</strong>{' '}
            {duplicadasExcluidas === 1 ? 'orden duplicada' : 'órdenes duplicadas'} del periodo.
          </p>
        ) : null}

        {conFecha && periodoAplicado ? (
          <div
            className="reportes-agrupacion-bar card-pad"
            role="group"
            aria-label="Agrupar gráficas por periodo"
          >
            <span className="reportes-agrupacion-label">Ver gráficas:</span>
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
            No hay fechas en las órdenes de este reporte; las gráficas por periodo no están disponibles.
          </p>
        ) : !loading && conFecha ? (
          <GraficasTemporales
            agrupacion={agrupacion}
            reparaciones={reparaciones}
            periodoAplicado={periodoAplicado}
          />
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
