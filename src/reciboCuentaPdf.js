import { LEGAL_ORDEN_SERVICIO } from './ordenServicioPdf.js'
import {
  RECIBO_MM_H,
  TEMA,
  addMediaCartaPage,
  createMediaCartaPdf,
  drawCampo,
  anchoRecuadroCompacto,
  anchoRecuadroCampo,
  drawEncabezadoSistebit,
  drawContactoSistebitPdf,
  measureContactoSistebitPdf,
  printSistebitPdfDocument,
  stampGuiaMediaCartaTodasPaginas,
} from './sistebitPdfCommon.js'

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

const GAP_CAMPOS_RECIBO = 2.5
const ALTURA_CAMPO_RECIBO = 9

/** Cliente, no. de orden y equipo en un mismo renglón (recuadros compactos). */
function drawFilaClienteOrdenEquipo(pdf, p, x, y, totalW) {
  const nombre = String(p.cliente?.nombre ?? '').trim() || '—'
  const ordenStr =
    p.orden != null && String(p.orden).trim() !== '' && String(p.orden).trim() !== '—'
      ? String(p.orden).trim()
      : null
  const equipoStr = String(p.descripcionEquipo ?? '').trim() || null

  const blocks = [{ label: 'Cliente', value: nombre, theme: TEMA.cliente, min: 24, campo: true }]
  if (ordenStr) {
    blocks.push({ label: 'No. de Orden', value: ordenStr, theme: TEMA.orden, min: 20, max: 28, campo: false })
  }
  if (equipoStr) {
    blocks.push({ label: 'Equipo', value: equipoStr, theme: TEMA.descripcion, min: 22, max: 58, campo: false })
  }

  const gapsTotal = GAP_CAMPOS_RECIBO * (blocks.length - 1)
  let widths = blocks.map((b) => {
    if (b.campo) {
      const w = anchoRecuadroCampo(pdf, b.label, b.value, {
        min: b.min,
        maxW: totalW,
        pad: 10,
        labelFontSize: 6.8,
        valueFontSize: CAMPO_RECIBO.valueFontSize,
      })
      return Math.max(b.min, w)
    }
    return Math.min(
      b.max,
      Math.max(b.min, anchoRecuadroCompacto(pdf, b.label, b.value, { min: b.min, max: b.max, pad: 7 })),
    )
  })

  const sumW = widths.reduce((s, w) => s + w, 0)
  if (sumW > totalW - gapsTotal) {
    const scale = (totalW - gapsTotal) / sumW
    widths = widths.map((w, i) => Math.max(blocks[i].min, w * scale))
    const sum2 = widths.reduce((s, w) => s + w, 0)
    if (sum2 > totalW - gapsTotal) {
      const extra = (sum2 - (totalW - gapsTotal)) / blocks.length
      widths = widths.map((w) => w - extra)
    }
  }

  let cx = x
  let maxH = 0
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]
    const opts = { ...CAMPO_RECIBO, padX: 2.4 }
    const h = drawCampo(pdf, b.label, b.value, cx, y, widths[i], ALTURA_CAMPO_RECIBO, b.theme, opts)
    maxH = Math.max(maxH, h)
    cx += widths[i] + GAP_CAMPOS_RECIBO
  }

  return maxH + GAP_RECIBO
}

const GAP_TOTAL_SALDO = 2.5

/** Formato moneda; negativo = anticipo / saldo a favor (ej. -$200.00). */
function formatMontoRecibo(value) {
  const v = Number(value)
  if (!Number.isFinite(v)) return '$0.00'
  const abs = Math.abs(v).toFixed(2)
  if (v < -0.0001) return `-$${abs}`
  return `$${abs}`
}

/** Total y saldo debajo de la tabla (alineados a la derecha). @returns {number} altura en mm */
function drawTotalesRecibo(pdf, total, saldo, x, y, width) {
  const totalVal = formatMontoRecibo(total)
  const saldoNum = Number(saldo)
  const saldoVal = formatMontoRecibo(saldoNum)
  const wTotal = Math.min(
    width * 0.5,
    anchoRecuadroCompacto(pdf, 'Total', totalVal, { min: 26, max: 46, pad: 8 }),
  )
  const wSaldo = Math.min(
    width * 0.5,
    anchoRecuadroCompacto(pdf, 'Saldo', saldoVal, { min: 26, max: 50, pad: 8 }),
  )
  const rowW = wSaldo + GAP_TOTAL_SALDO + wTotal
  let xCur = x + width - rowW
  const temaSaldo = saldoNum < -0.0001 ? TEMA.pago : TEMA.orden
  const hSaldo = drawCampo(pdf, 'Saldo', saldoVal, xCur, y, wSaldo, TOTAL_BOX_H, temaSaldo, CAMPO_RECIBO)
  xCur += wSaldo + GAP_TOTAL_SALDO
  const hTotal = drawCampo(pdf, 'Total', totalVal, xCur, y, wTotal, TOTAL_BOX_H, TEMA.orden, CAMPO_RECIBO)
  return Math.max(hTotal, hSaldo)
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

/**
 * @param {number} zonaMaxY Límite inferior de la media hoja (mm desde arriba).
 * @returns {number} posición Y final tras la tabla
 */
function drawTablaDetalle(pdf, lineas, x, yStart, contentW, zonaMaxY) {
  let y = yStart
  y += drawEncabezadoTabla(pdf, x, y, contentW) + 1
  const maxY = zonaMaxY - MARGIN - 2

  const rows = (lineas ?? []).map(mapLineaRecibo)
  if (rows.length === 0) {
    const h = 8
    if (y + h > maxY) {
      addMediaCartaPage(pdf)
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
      addMediaCartaPage(pdf)
      y = MARGIN
      y += drawEncabezadoTabla(pdf, x, y, contentW) + 1
    }
    const h = drawFilaTabla(pdf, rows[i], x, y, contentW, i)
    y += h + 0.9
  }

  return y
}

/**
 * Genera el comprobante: hoja Carta vertical, contenido en la mitad superior (8.5″ × 5.5″).
 * @param {{ cliente: { nombre?: string, telefono?: string }, orden?: string|number, descripcionEquipo?: string, total: string, saldo: string|number, estatus: string, lineas: object[] }} p
 */
export function createReciboCuentaPdf(p) {
  const pdf = createMediaCartaPdf()

  const W = pdf.internal.pageSize.getWidth()
  const contentW = W - 2 * MARGIN
  const centerX = W / 2
  const zonaBottom = RECIBO_MM_H - MARGIN

  let y = drawEncabezadoSistebit(pdf, 'COMPROBANTE', centerX, 4, {
    scale: 0.5,
    subtitleSize: 7.2,
    titleSize: 10.5,
  })
  y += drawFilaClienteOrdenEquipo(pdf, p, MARGIN, y, contentW) + GAP_DESPUES_CLIENTE

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.8)
  pdf.setTextColor(25, 118, 210)
  pdf.text('DETALLE DE MOVIMIENTOS', MARGIN, y + 3.2)
  y += GAP_DETALLE_TABLA + 3.2

  y = drawTablaDetalle(pdf, p.lineas, MARGIN, y, contentW, RECIBO_MM_H)

  const bloqueFinalH = GAP_ANTES_TOTAL + TOTAL_BOX_H + GAP_TOTAL_LEYENDA + measurePieReciboHeight(pdf, contentW)
  if (y + bloqueFinalH > zonaBottom) {
    addMediaCartaPage(pdf)
    y = MARGIN
  }

  y += GAP_ANTES_TOTAL
  const totalesH = drawTotalesRecibo(pdf, p.total, p.saldo ?? 0, MARGIN, y, contentW)
  y += totalesH + GAP_TOTAL_LEYENDA
  drawPieRecibo(pdf, y, contentW, centerX)

  stampGuiaMediaCartaTodasPaginas(pdf, contentW, MARGIN)

  return pdf
}

/** Imprime comprobante (papel Carta, orientación vertical, contenido en media hoja). */
export async function printReciboCuentaPdf(p) {
  const pdf = createReciboCuentaPdf(p)
  return printSistebitPdfDocument(pdf, {
    timeoutMsg: 'Tiempo de espera al cargar el recibo para imprimir.',
    iframeTitle: 'Imprimir comprobante — Carta vertical, media hoja arriba',
  })
}

/** Texto breve para mostrar al usuario al imprimir. */
export const RECIBO_PRINT_HINT =
  'Impresión: papel Carta, orientación Vertical, escala 100 %. El comprobante sale en la mitad superior (5.5″); puede cortar o usar media hoja precortada.'
