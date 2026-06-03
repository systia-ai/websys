import { jsPDF } from 'jspdf'
import {
  RECIBO_PDF_FORMAT_MM,
  TEMA,
  COMPACT_CAMPO,
  temaEstatus,
  drawCampo,
  anchoRecuadroCompacto,
  drawEncabezadoSistebit,
  printSistebitPdfDocument,
} from './sistebitPdfCommon.js'

const MARGIN = 8
const GAP_RECIBO = 2.5
const FUENTE_TABLA = 7.2
const FUENTE_TABLA_HDR = 6.2

/** Columnas ajustadas al ancho de media hoja (216 mm). */
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

/** Cliente, total y estatus (misma información que el comprobante HTML anterior). */
function drawResumenRecibo(pdf, p, x, y, width) {
  const { cliente = {}, total, estatus } = p
  const clienteStr = [cliente.nombre, cliente.telefono].filter((s) => String(s ?? '').trim()).join(' — ') || '—'
  const totalStr = `$${total}`
  let cy = y

  cy += drawCampo(pdf, 'Cliente', clienteStr, x, cy, width, 10, TEMA.cliente, CAMPO_RECIBO) + GAP_RECIBO

  const gap = 3
  const wTotal = anchoRecuadroCompacto(pdf, 'Total', totalStr, { min: 24, max: 40, pad: 8 })
  const wEst = Math.min(width - wTotal - gap, anchoRecuadroCompacto(pdf, 'Estatus', estatus, { min: 32, max: 85, pad: 7 }))
  const h = 9
  drawCampo(pdf, 'Total', totalStr, x, cy, wTotal, h, TEMA.orden, CAMPO_RECIBO)
  drawCampo(pdf, 'Estatus', estatus, x + wTotal + gap, cy, wEst, h, temaEstatus(estatus), CAMPO_RECIBO)
  cy += h

  return cy - y
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

function drawTablaDetalle(pdf, lineas, x, yStart, contentW, pageH, margin) {
  let y = yStart
  y += drawEncabezadoTabla(pdf, x, y, contentW) + 1

  const rows = (lineas ?? []).map(mapLineaRecibo)
  if (rows.length === 0) {
    const h = 8
    pdf.setFillColor(248, 250, 252)
    pdf.setDrawColor(210, 218, 226)
    pdf.roundedRect(x, y, contentW, h, 1.5, 1.5, 'FD')
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(FUENTE_TABLA)
    pdf.setTextColor(120, 130, 140)
    pdf.text('Sin movimientos registrados', x + contentW / 2, y + 5, { align: 'center' })
    return y + h - yStart
  }

  for (let i = 0; i < rows.length; i++) {
    const rowH = calcAlturaFila(pdf, rows[i], contentW)
    if (y + rowH > pageH - margin - 4) {
      pdf.addPage(RECIBO_PDF_FORMAT_MM, 'p')
      y = margin
      y += drawEncabezadoTabla(pdf, x, y, contentW) + 1
    }
    const h = drawFilaTabla(pdf, rows[i], x, y, contentW, i)
    y += h + 0.9
  }

  return y - yStart
}

/**
 * Genera el PDF del comprobante de cuenta (media hoja 216×140 mm).
 * @param {{ cliente: { nombre?: string, telefono?: string }, total: string, estatus: string, lineas: object[] }} p
 */
export function createReciboCuentaPdf(p) {
  const pdf = new jsPDF({
    unit: 'mm',
    format: RECIBO_PDF_FORMAT_MM,
    orientation: 'portrait',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const contentW = W - 2 * MARGIN
  const centerX = W / 2

  let y = drawEncabezadoSistebit(pdf, 'COMPROBANTE', centerX, 5, {
    scale: 0.55,
    subtitleSize: 7.5,
    titleSize: 11,
  })
  y += drawResumenRecibo(pdf, p, MARGIN, y, contentW) + 3

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(25, 118, 210)
  pdf.text('DETALLE DE MOVIMIENTOS', MARGIN, y)
  y += 4

  drawTablaDetalle(pdf, p.lineas, MARGIN, y, contentW, H, MARGIN)

  return pdf
}

/** Genera el comprobante y abre el diálogo de impresión. */
export async function printReciboCuentaPdf(p) {
  const pdf = createReciboCuentaPdf(p)
  return printSistebitPdfDocument(pdf, {
    timeoutMsg: 'Tiempo de espera al cargar el recibo para imprimir.',
    iframeTitle: 'Imprimir recibo',
  })
}
