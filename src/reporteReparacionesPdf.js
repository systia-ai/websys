
import { jsPDF } from 'jspdf'
import {
  SISTEBIT_PDF_FORMAT,
  TEMA,
  drawCampo,
  anchoRecuadroCampo,
  anchoRecuadroCompacto,
  drawEncabezadoSistebit,
  openSistebitPdfDocument,
} from './sistebitPdfCommon.js'
import {
  PDF_MARGIN,
  PDF_GAP,
  drawTablaCompactaPdf,
  drawTituloSeccionPdf,
  drawCamposCompactosFila,
} from './sistebitPdfTabla.js'

const CAMPO = { compact: true, valueFontSize: 8 }

function anchoCampoResumenPdf(pdf, label, value, maxW) {
  return anchoRecuadroCampo(pdf, label, value, {
    min: 38,
    maxW,
    pad: 10,
    labelFontSize: 6.8,
    valueFontSize: CAMPO.valueFontSize,
  })
}

const COLS_DETALLE = [
  { key: 'ingreso', label: 'INGRESO', width: 18 },
  { key: 'salida', label: 'ENT/BAJA', width: 18 },
  { key: 'dias', label: 'DÍAS', width: 10, align: 'right' },
  { key: 'orden', label: 'NO.', width: 12 },
  { key: 'cliente', label: 'CLIENTE', flex: 1 },
  { key: 'equipo', label: 'EQUIPO', width: 16 },
  { key: 'servicio', label: 'SERVICIO', width: 18 },
  { key: 'descripcion', label: 'DESCRIPCIÓN', flex: 1 },
  { key: 'problema', label: 'PROBLEMA', flex: 1 },
  { key: 'tecnico', label: 'TÉCNICO', width: 16 },
  { key: 'estatus', label: 'ESTATUS', width: 22 },
]

function temaKpiPdf(id) {
  if (id === 'ingreso') return TEMA.orden
  if (id === 'entrega') return TEMA.pago
  if (String(id ?? '').startsWith('estatus-')) return TEMA.servicio
  return TEMA.descripcion
}

function drawResumenReporte(pdf, p, x, y, width) {
  const { periodoTxt, estatusFiltro, kpis, nOrdenes } = p
  let cy = y

  cy += drawCampo(pdf, 'Periodo', periodoTxt, x, cy, anchoCampoResumenPdf(pdf, 'Periodo', periodoTxt, width), 9, TEMA.fecha, CAMPO) + PDF_GAP
  const filtroVal = estatusFiltro || 'Ninguno'
  cy +=
    drawCampo(
      pdf,
      'Filtros',
      filtroVal,
      x,
      cy,
      anchoCampoResumenPdf(pdf, 'Filtros', filtroVal, width),
      9,
      TEMA.descripcion,
      CAMPO,
    ) + PDF_GAP

  if (nOrdenes != null) {
    const nTxt = String(nOrdenes)
    cy +=
      drawCampo(
        pdf,
        'Órdenes encontradas',
        nTxt,
        x,
        cy,
        anchoCampoResumenPdf(pdf, 'Órdenes encontradas', nTxt, 48),
        9,
        TEMA.orden,
        CAMPO,
      ) + PDF_GAP
  }

  const kpiCampos = (kpis ?? []).map((k) => ({
    label: k.label,
    value: String(k.value ?? 0),
    theme: temaKpiPdf(k.id),
    minW: 28,
  }))
  if (kpiCampos.length > 0) {
    cy +=
      drawCamposCompactosFila(pdf, kpiCampos, drawCampo, anchoRecuadroCompacto, CAMPO, { x, y: cy, width }) +
      PDF_GAP
  }

  return cy - y
}

/**
 * @param {{
 *   periodo: { ini: string, fin: string },
 *   formatearFechaCorta: (ymd: string) => string,
 *   estatusFiltro?: string,
 *   kpis?: { id?: string, label: string, value: number|string }[],
 *   filas?: object[],
 * }} p
 */
export function createReporteReparacionesPdf(p) {
  const pdf = new jsPDF({
    unit: 'mm',
    format: SISTEBIT_PDF_FORMAT,
    orientation: 'portrait',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const contentW = W - 2 * PDF_MARGIN
  const centerX = W / 2
  const periodoTxt = `${p.formatearFechaCorta(p.periodo.ini)} — ${p.formatearFechaCorta(p.periodo.fin)}`

  let y = drawEncabezadoSistebit(pdf, 'REPORTE DE REPARACIONES', centerX, 8, {
    scale: 0.62,
    subtitleSize: 8,
    titleSize: 12,
  })

  y +=
    drawResumenReporte(
      pdf,
      {
        periodoTxt,
        estatusFiltro: p.estatusFiltro,
        kpis: p.kpis,
        nOrdenes: (p.filas ?? []).length,
      },
      PDF_MARGIN,
      y + 2,
      contentW,
    ) + 4

  if (y > H - 35) {
    pdf.addPage(SISTEBIT_PDF_FORMAT, 'p')
    y = PDF_MARGIN
  }

  y = drawTituloSeccionPdf(pdf, 'Detalle de órdenes', PDF_MARGIN, y + 1)

  drawTablaCompactaPdf(pdf, {
    columns: COLS_DETALLE,
    rows: p.filas ?? [],
    x: PDF_MARGIN,
    yStart: y,
    contentW,
    pageH: H,
    margin: PDF_MARGIN,
    pageFormat: SISTEBIT_PDF_FORMAT,
    emptyText: 'Sin órdenes con los filtros seleccionados',
  })

  return pdf
}

export function buildReporteReparacionesPdfFilename(periodo) {
  const ini = String(periodo?.ini ?? '').slice(0, 10) || 'inicio'
  const fin = String(periodo?.fin ?? '').slice(0, 10) || 'fin'
  return `reporte-reparaciones-${ini}_${fin}.pdf`
}

export function abrirReporteReparacionesPdf(p) {
  const pdf = createReporteReparacionesPdf(p)
  openSistebitPdfDocument(pdf, { filename: buildReporteReparacionesPdfFilename(p.periodo) })
}

/** @deprecated Use abrirReporteReparacionesPdf — el reporte se visualiza, no se imprime. */
export function printReporteReparacionesPdf(p) {
  return abrirReporteReparacionesPdf(p)
}
