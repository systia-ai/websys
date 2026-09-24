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
  { key: 'fecha', label: 'FECHA', width: 22 },
  { key: 'folio', label: 'FOLIO FISCAL', flex: 1 },
  { key: 'cliente', label: 'CLIENTE', flex: 1.2 },
  { key: 'cuenta', label: 'CUENTA', width: 16 },
  { key: 'orden', label: 'ORDEN', width: 16 },
  { key: 'total', label: 'TOTAL FACTURA', width: 28, align: 'right' },
  { key: 'estatus', label: 'ESTATUS', width: 22 },
]

function drawResumenReporte(pdf, p, x, y, width) {
  const { criterioTxt, nFacturas, importeTxt } = p
  let cy = y

  cy +=
    drawCampo(
      pdf,
      'Criterio',
      criterioTxt,
      x,
      cy,
      anchoCampoResumenPdf(pdf, 'Criterio', criterioTxt, width),
      9,
      TEMA.fecha,
      CAMPO,
    ) + PDF_GAP

  const kpiCampos = [
    { label: 'Facturas', value: String(nFacturas ?? 0), theme: TEMA.orden, minW: 28 },
    { label: 'Importe', value: String(importeTxt ?? '$0.00'), theme: TEMA.pago, minW: 36 },
  ]
  cy +=
    drawCamposCompactosFila(pdf, kpiCampos, drawCampo, anchoRecuadroCompacto, CAMPO, { x, y: cy, width }) +
    PDF_GAP

  return cy - y
}

/**
 * @param {{
 *   criterioTxt: string,
 *   importeTxt: string,
 *   filas?: object[],
 * }} p
 */
export function createReporteFacturasPdf(p) {
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

  let y = drawEncabezadoSistebit(pdf, 'REPORTE DE FACTURAS', centerX, 8, {
    scale: 0.62,
    subtitleSize: 8,
    titleSize: 12,
  })

  y +=
    drawResumenReporte(
      pdf,
      {
        criterioTxt: p.criterioTxt || '—',
        nFacturas: (p.filas ?? []).length,
        importeTxt: p.importeTxt || '$0.00',
      },
      PDF_MARGIN,
      y + 2,
      contentW,
    ) + 4

  if (y > H - 35) {
    pdf.addPage(SISTEBIT_PDF_FORMAT, 'p')
    y = PDF_MARGIN
  }

  y = drawTituloSeccionPdf(pdf, 'Detalle de facturas', PDF_MARGIN, y + 1)

  drawTablaCompactaPdf(pdf, {
    columns: COLS_DETALLE,
    rows: p.filas ?? [],
    x: PDF_MARGIN,
    yStart: y,
    contentW,
    pageH: H,
    margin: PDF_MARGIN,
    pageFormat: SISTEBIT_PDF_FORMAT,
    emptyText: 'Sin facturas con el criterio seleccionado',
  })

  return pdf
}

export function buildReporteFacturasPdfFilename() {
  const d = new Date()
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `reporte-facturas-${ymd}.pdf`
}

export function abrirReporteFacturasPdf(p) {
  const pdf = createReporteFacturasPdf(p)
  openSistebitPdfDocument(pdf, { filename: buildReporteFacturasPdfFilename() })
}
