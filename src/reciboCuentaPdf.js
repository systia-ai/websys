import { jsPDF } from 'jspdf'
import { LEGAL_ORDEN_SERVICIO } from './ordenServicioPdf.js'
import {
  RECIBO_PDF_FORMAT_MM,
  RECIBO_PDF_ORIENTATION,
  TEMA,
  drawCampo,
  anchoRecuadroCompacto,
  anchoRecuadroCampo,
  drawEncabezadoSistebit,
  drawContactoSistebitPdf,
  measureContactoSistebitPdf,
  printSistebitPdfDocument,
} from './sistebitPdfCommon.js'

function newReciboPdf() {
  return new jsPDF({
    unit: 'mm',
    format: RECIBO_PDF_FORMAT_MM,
    /** Media carta: 8.5″ ancho × 5.5″ alto (jsPDF requiere landscape si ancho > alto). */
    orientation: RECIBO_PDF_ORIENTATION,
    compress: true,
  })
}

function addReciboPage(pdf) {
  pdf.addPage(RECIBO_PDF_FORMAT_MM, 'l')
}

/** Márgenes compactos para media carta (8.5″ × 5.5″). */
const MARGIN = 6
const GAP_RECIBO = 2
const GAP_DESPUES_CLIENTE = 4
const GAP_DETALLE_TABLA = 5.5
const GAP_ANTES_TOTAL = 5
const GAP_TOTAL_LEYENDA = 9
const GAP_ANTES_LEYENDA = 2
const TOTAL_BOX_H = 9
const GAP_LEYENDA_CONTACTO = 2
const FUENTE_TABLA = 7.2
const FUENTE_TABLA_HDR = 6.2
const FUENTE_LEGAL_RECIBO = 7.2
const LINE_H_LEGAL = 3.5

/** Columnas ajustadas al ancho de media hoja carta. */
const COLS = {
  cant: 11,
  fecha: 20,
  precio: 20,
  subtotal: 24,
}

const CAMPO_RECIBO = { compact: true, valueFontSize: 8 }

function mapLineaRecibo(L) {
  const esPago = L.tipo === 'pago'
  return {
    cant: esPago ? -Math.abs(Number(L.cantidad)) : Number(L.cantidad),
    descripcion: String(L.descripcion ?? ''),
    fecha: esPago ? (L.fechaPago ?? '—') : '—',
    precio: `$${Number(L.precioUnitario).toFixed(2)}`,
    subtotal: `$${Number(L.subtotal).toFixed(2)}`,
    esPago,
  }
}

function measureLeyendaReciboHeight(pdf, contentW) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(FUENTE_LEGAL_RECIBO)
  const legalLines = pdf.splitTextToSize(LEGAL_ORDEN_SERVICIO, contentW - 6)
  return legalLines.length * LINE_H_LEGAL + GAP_LEYENDA_CONTACTO
}

function measurePieReciboHeight(pdf, contentW) {
  return (
    GAP_ANTES_LEYENDA +
    measureLeyendaReciboHeight(pdf, contentW) +
    measureContactoSistebitPdf(pdf, contentW)
  )
}

/** Solo nombre del cliente (sin teléfono); ancho según el nombre. */
function drawClienteRecibo(pdf, p, x, y, width) {
  const nombre = String(p.cliente?.nombre ?? '').trim() || '—'
  const wCliente = anchoRecuadroCampo(pdf, 'Cliente', nombre, {
    min: 42,
    maxW: width,
    pad: 12,
    labelFontSize: 6.8,
    valueFontSize: CAMPO_RECIBO.valueFontSize,
  })
  return drawCampo(pdf, 'Cliente', nombre, x, y, wCliente, 10, TEMA.cliente, CAMPO_RECIBO) + GAP_RECIBO
}

/** Total debajo de la tabla (alineado a la derecha). @returns {number} altura del recuadro en mm */
function drawTotalRecibo(pdf, total, x, y, width) {
  const totalStr = `$${total}`
  const wTotal = Math.min(
    width,
    anchoRecuadroCompacto(pdf, 'Total', totalStr, { min: 28, max: 52, pad: 8 }),
  )
  const xTotal = x + width - wTotal
  return drawCampo(pdf, 'Total', totalStr, xTotal, y, wTotal, TOTAL_BOX_H, TEMA.orden, CAMPO_RECIBO)
}

function drawLeyendaRecibo(pdf, y, contentW, centerX) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(FUENTE_LEGAL_RECIBO)
  pdf.setTextColor(55, 55, 55)
  const legalLines = pdf.splitTextToSize(LEGAL_ORDEN_SERVICIO, contentW - 6)
  pdf.text(legalLines, centerX, y, { align: 'center', maxWidth: contentW - 6 })
  return legalLines.length * LINE_H_LEGAL + GAP_LEYENDA_CONTACTO
}

/** Leyenda y contacto pegados al bloque superior. */
function drawPieRecibo(pdf, y, contentW, centerX) {
  const yLeyenda = y + GAP_ANTES_LEYENDA
  const leyendaH = drawLeyendaRecibo(pdf, yLeyenda, contentW, centerX)
  return GAP_ANTES_LEYENDA + leyendaH + drawContactoSistebitPdf(pdf, yLeyenda + leyendaH, contentW, centerX)
}

function anchosTabla(contentW) {
  const wDesc = contentW - COLS.cant - COLS.fecha - COLS.precio - COLS.subtotal
  return { wDesc, ...COLS }
}

function drawEncabezadoTabla(pdf, x, y, contentW) {
  const { wDesc, cant, fecha, precio } = anchosTabla(contentW)
  const h = 6.5

  pdf.setFillColor(...TEMA.orden.fill)
  pdf.setDrawColor(...TEMA.orden.border)
  pdf.setLineWidth(0.45)
  pdf.roundedRect(x, y, contentW, h, 1.5, 1.5, 'FD')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(FUENTE_TABLA_HDR)
  pdf.setTextColor(...TEMA.orden.label)

  let cx = x + 1.5
  const ty = y + 4.3
  pdf.text('CANT', cx, ty)
  cx += cant
  pdf.text('DESCRIPCIÓN', cx, ty)
  cx += wDesc
  pdf.text('FECHA', cx, ty)
  cx += fecha
  pdf.text('PRECIO', cx, ty)
  cx += precio
  pdf.text('SUBTOTAL', cx, ty)

  return h
}

function calcAlturaFila(pdf, row, contentW) {
  const { wDesc } = anchosTabla(contentW)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(FUENTE_TABLA)
  const descLines = pdf.splitTextToSize(row.descripcion, wDesc - 3)
  return Math.max(6.2, descLines.length * 3.2 + 2.5)
}

function drawFilaTabla(pdf, row, x, y, contentW, idx) {
  const { wDesc, cant, fecha, precio } = anchosTabla(contentW)
  const rowH = calcAlturaFila(pdf, row, contentW)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(FUENTE_TABLA)
  const descLines = pdf.splitTextToSize(row.descripcion, wDesc - 3)

  if (row.esPago) pdf.setFillColor(...TEMA.pago.fill)
  else if (idx % 2 === 1) pdf.setFillColor(248, 250, 252)
  else pdf.setFillColor(255, 255, 255)

  pdf.setDrawColor(210, 218, 226)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(x, y, contentW, rowH, 1.2, 1.2, 'FD')

  pdf.setTextColor(26, 32, 44)
  const ty = y + 4.1
  let cx = x + 1.5

  pdf.setFont('helvetica', 'bold')
  pdf.text(String(row.cant), cx, ty)
  cx += cant

  pdf.setFont('helvetica', 'normal')
  pdf.text(descLines, cx, ty)
  cx += wDesc

  pdf.text(row.fecha, cx, ty)
  cx += fecha

  pdf.text(row.precio, cx, ty)
  cx += precio

  pdf.setFont('helvetica', 'bold')
  pdf.text(row.subtotal, cx, ty)

  return rowH
}

/** @returns {number} posición Y final tras la tabla */
function drawTablaDetalle(pdf, lineas, x, yStart, contentW, pageH) {
  let y = yStart
  y += drawEncabezadoTabla(pdf, x, y, contentW) + 1
  const maxY = pageH - MARGIN - 2

  const rows = (lineas ?? []).map(mapLineaRecibo)
  if (rows.length === 0) {
    const h = 8
    if (y + h > maxY) {
      addReciboPage(pdf)
      y = MARGIN
      y += drawEncabezadoTabla(pdf, x, y, contentW) + 1
    }
    pdf.setFillColor(248, 250, 252)
    pdf.setDrawColor(210, 218, 226)
    pdf.roundedRect(x, y, contentW, h, 1.5, 1.5, 'FD')
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(FUENTE_TABLA)
    pdf.setTextColor(120, 130, 140)
    pdf.text('Sin movimientos registrados', x + contentW / 2, y + 5, { align: 'center' })
    return y + h
  }

  for (let i = 0; i < rows.length; i++) {
    const rowH = calcAlturaFila(pdf, rows[i], contentW)
    if (y + rowH > maxY) {
      addReciboPage(pdf)
      y = MARGIN
      y += drawEncabezadoTabla(pdf, x, y, contentW) + 1
    }
    const h = drawFilaTabla(pdf, rows[i], x, y, contentW, i)
    y += h + 0.9
  }

  return y
}

/**
 * Genera el PDF del comprobante (media hoja carta: 8.5″ × 5.5″).
 * @param {{ cliente: { nombre?: string, telefono?: string }, total: string, estatus: string, lineas: object[] }} p
 */
export function createReciboCuentaPdf(p) {
  const pdf = newReciboPdf()

  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const contentW = W - 2 * MARGIN
  const centerX = W / 2
  const pageBottom = H - MARGIN

  let y = drawEncabezadoSistebit(pdf, 'COMPROBANTE', centerX, 4, {
    scale: 0.5,
    subtitleSize: 7.2,
    titleSize: 10.5,
  })
  y += drawClienteRecibo(pdf, p, MARGIN, y, contentW) + GAP_DESPUES_CLIENTE

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.8)
  pdf.setTextColor(25, 118, 210)
  pdf.text('DETALLE DE MOVIMIENTOS', MARGIN, y + 3.2)
  y += GAP_DETALLE_TABLA + 3.2

  y = drawTablaDetalle(pdf, p.lineas, MARGIN, y, contentW, H)

  const bloqueFinalH = GAP_ANTES_TOTAL + TOTAL_BOX_H + GAP_TOTAL_LEYENDA + measurePieReciboHeight(pdf, contentW)
  if (y + bloqueFinalH > pageBottom) {
    addReciboPage(pdf)
    y = MARGIN
  }

  y += GAP_ANTES_TOTAL
  const totalH = drawTotalRecibo(pdf, p.total, MARGIN, y, contentW)
  y += totalH + GAP_TOTAL_LEYENDA
  drawPieRecibo(pdf, y, contentW, centerX)

  return pdf
}

/** Genera el comprobante y abre el diálogo de impresión (papel media carta). */
export async function printReciboCuentaPdf(p) {
  const pdf = createReciboCuentaPdf(p)
  return printSistebitPdfDocument(pdf, {
    timeoutMsg: 'Tiempo de espera al cargar el recibo para imprimir.',
    iframeTitle: 'Imprimir recibo (media carta)',
  })
}
