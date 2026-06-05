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
  { key: 'concepto', label: 'CONCEPTO', flex: 1 },
  { key: 'cliente', label: 'CLIENTE', width: 34 },
  { key: 'cuenta', label: 'CTA', width: 12 },
  { key: 'forma', label: 'FORMA', width: 20 },
  { key: 'fecha', label: 'FECHA', width: 21 },
  { key: 'monto', label: 'MONTO', width: 20, align: 'right', bold: true },
]

function drawResumenCorte(pdf, p, x, y, width) {
  const { periodoTxt, resumen, etiquetaTotal } = p
  let cy = y

  cy += drawCampo(pdf, 'Periodo', periodoTxt, x, cy, anchoCampoResumenPdf(pdf, 'Periodo', periodoTxt, width), 9, TEMA.fecha, CAMPO) + PDF_GAP

  const camposResumen = [
    { label: etiquetaTotal, value: `$${resumen.totalIngresos.toFixed(2)}`, theme: TEMA.pago, minW: 36 },
    { label: 'Cantidad pagos', value: String(resumen.cantidadPagos), theme: TEMA.orden, minW: 30 },
    { label: 'Efectivo', value: `$${resumen.porForma.EFECTIVO.toFixed(2)}`, theme: TEMA.pago, minW: 28 },
    { label: 'Transferencia', value: `$${resumen.porForma.TRANSFERENCIA.toFixed(2)}`, theme: TEMA.fecha, minW: 32 },
    { label: 'Tarjeta', value: `$${resumen.porForma.TARJETA.toFixed(2)}`, theme: TEMA.tipo, minW: 26 },
  ]
  if (resumen.porForma.OTRO > 0.0001) {
    camposResumen.push({
      label: 'Otras formas',
      value: `$${resumen.porForma.OTRO.toFixed(2)}`,
      theme: TEMA.problema,
      minW: 30,
    })
  }

  cy += drawCamposCompactosFila(pdf, camposResumen, drawCampo, anchoRecuadroCompacto, CAMPO, { x, y: cy, width })

  return cy - y
}

/**
 * @param {{
 *   periodo: { ini: string, fin: string },
 *   formatearFechaCorta: (ymd: string) => string,
 *   etiquetaTotal: string,
 *   resumen: { totalIngresos: number, cantidadPagos: number, porForma: object },
 *   filas?: object[],
 * }} p
 */
export function createCorteCajaPdf(p) {
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

  let y = drawEncabezadoSistebit(pdf, 'CORTE DE CAJA', centerX, 8, {
    scale: 0.62,
    subtitleSize: 8,
    titleSize: 12,
  })

  y +=
    drawResumenCorte(
      pdf,
      { periodoTxt, resumen: p.resumen, etiquetaTotal: p.etiquetaTotal },
      PDF_MARGIN,
      y + 2,
      contentW,
    ) + 4

  if (y > H - 35) {
    pdf.addPage(SISTEBIT_PDF_FORMAT, 'p')
    y = PDF_MARGIN
  }

  y = drawTituloSeccionPdf(pdf, 'Detalle de pagos', PDF_MARGIN, y + 1)

  drawTablaCompactaPdf(pdf, {
    columns: COLS_DETALLE,
    rows: p.filas ?? [],
    x: PDF_MARGIN,
    yStart: y,
    contentW,
    pageH: H,
    margin: PDF_MARGIN,
    pageFormat: SISTEBIT_PDF_FORMAT,
    emptyText: 'Sin movimientos en el periodo',
  })

  return pdf
}

export async function printCorteCajaPdf(p) {
  const pdf = createCorteCajaPdf(p)
  return printSistebitPdfDocument(pdf, {
    timeoutMsg: 'Tiempo de espera al cargar el corte para imprimir.',
    iframeTitle: 'Imprimir corte de caja',
  })
}
