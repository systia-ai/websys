import { jsPDF } from 'jspdf'
import {
  SISTEBIT_PDF_FORMAT,
  TEMA,
  drawCampo,
  anchoRecuadroCampo,
  anchoRecuadroCompacto,
  drawEncabezadoSistebit,
  printSistebitPdfDocument,
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
  { key: 'orden', label: 'NO.', width: 11 },
  { key: 'cliente', label: 'CLIENTE', flex: 1 },
  { key: 'estatus', label: 'ESTATUS', width: 24 },
  { key: 'tipo', label: 'TIPO', width: 22 },
  { key: 'fecha', label: 'FECHA', width: 21 },
  { key: 'pago', label: 'PAGO', width: 18, align: 'right', bold: true },
  { key: 'costo', label: 'COSTO', width: 18, align: 'right', bold: true },
]

function drawResumenReporte(pdf, p, x, y, width, pageH) {
  const { periodoTxt, estatusFiltro, resumen, porEstatus } = p
  let cy = y

  cy += drawCampo(pdf, 'Periodo', periodoTxt, x, cy, anchoCampoResumenPdf(pdf, 'Periodo', periodoTxt, width), 9, TEMA.fecha, CAMPO) + PDF_GAP
  const filtroVal = estatusFiltro || 'Todos'
  const sumaVal = `$${resumen.totalCosto.toFixed(2)}`
  const sumaW = Math.min(
    width,
    Math.max(28, anchoRecuadroCompacto(pdf, 'Suma costo', sumaVal, { min: 28, max: 52, pad: 8 })),
  )
  const rowY = cy
  const rowH = drawCamposCompactosFila(
    pdf,
    [
      { label: 'Filtro estatus', value: filtroVal, theme: TEMA.descripcion, minW: 32 },
      { label: 'Total órdenes', value: String(resumen.total), theme: TEMA.orden, minW: 28 },
      { label: 'Activas', value: String(resumen.activas), theme: TEMA.problema, minW: 22 },
      { label: 'Entregadas', value: String(resumen.entregadas), theme: TEMA.pago, minW: 26 },
    ],
    drawCampo,
    anchoRecuadroCompacto,
    CAMPO,
    { x, y: rowY, width: width - sumaW - PDF_GAP },
  )
  const sumaH = drawCampo(pdf, 'Suma costo', sumaVal, x + width - sumaW, rowY, sumaW, 9, TEMA.tipo, CAMPO)
  cy += Math.max(rowH, sumaH) + PDF_GAP

  const estatusRows = Object.entries(porEstatus ?? {})
    .filter(([, n]) => n > 0)
    .map(([k, n]) => ({ estatus: k, cantidad: String(n) }))

  if (estatusRows.length > 0) {
    cy += 1
    cy = drawTituloSeccionPdf(pdf, 'Por estatus', x, cy)
    cy += drawTablaCompactaPdf(pdf, {
      columns: [
        { key: 'estatus', label: 'ESTATUS', flex: 1 },
        { key: 'cantidad', label: 'CANT.', width: 16, align: 'right', bold: true },
      ],
      rows: estatusRows,
      x,
      yStart: cy,
      contentW: width,
      pageH,
      margin: PDF_MARGIN,
      pageFormat: SISTEBIT_PDF_FORMAT,
    })
  }

  return cy - y
}

/**
 * @param {{
 *   periodo: { ini: string, fin: string },
 *   formatearFechaCorta: (ymd: string) => string,
 *   estatusFiltro?: string,
 *   resumen: object,
 *   porEstatus?: Record<string, number>,
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
        resumen: p.resumen,
        porEstatus: p.porEstatus,
      },
      PDF_MARGIN,
      y + 2,
      contentW,
      H,
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
    emptyText: 'Sin órdenes en el periodo',
  })

  return pdf
}

export async function printReporteReparacionesPdf(p) {
  const pdf = createReporteReparacionesPdf(p)
  return printSistebitPdfDocument(pdf, {
    timeoutMsg: 'Tiempo de espera al cargar el reporte para imprimir.',
    iframeTitle: 'Imprimir reporte',
  })
}
