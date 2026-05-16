import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { buildEtiquetaQrPlainText } from './etiquetaLink.js'

/** Tamaño carta (216 × 279 mm), orientación vertical. */
export const ORDEN_PDF_FORMAT = 'letter'

const LEGAL_ORDEN_SERVICIO =
  'Revisión $200.00. Garantía del servicio 15 días sobre la misma falla. Cuenta con 30 días para recoger su equipo una vez que se le informó del diagnóstico de su equipo. Todo Servicio, Limpieza y drenado del cabezal consume tinta del mismo equipo. Nuestro horario es de Lunes a Viernes de 10:00 AM a 6:00 PM y sábados de 9:00 AM a 2:00 PM'

const GAP_CAMPOS = 3.8

/** Paleta tipo app (rep-block.highlight) y variaciones suaves. */
const TEMA = {
  orden: { fill: [227, 242, 253], border: [25, 118, 210], label: [21, 101, 192] },
  fecha: { fill: [232, 245, 255], border: [3, 155, 229], label: [13, 71, 161] },
  cliente: { fill: [237, 243, 255], border: [63, 81, 181], label: [48, 63, 159] },
  serie: { fill: [225, 245, 254], border: [2, 136, 209], label: [1, 87, 155] },
  tipo: { fill: [224, 247, 250], border: [0, 151, 167], label: [0, 121, 137] },
  descripcion: { fill: [240, 248, 255], border: [100, 181, 246], label: [30, 136, 229] },
  problema: { fill: [255, 248, 225], border: [255, 167, 38], label: [230, 126, 34] },
}

export function buildOrdenServicioPdfFilename(orden) {
  const safe = String(orden ?? 'orden').replace(/[^\w.-]+/g, '_')
  return `orden-servicio-${safe}.pdf`
}

function dashIfEmpty(v) {
  const s = String(v ?? '').trim()
  return s.length ? s : '—'
}

function formatFechaOrdenPdf(fechaCreacion) {
  if (fechaCreacion == null || fechaCreacion === '') {
    return new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const d = fechaCreacion instanceof Date ? fechaCreacion : new Date(String(fechaCreacion))
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
}

function temaEstatus(estatus) {
  const st = String(estatus ?? '').trim().toUpperCase()
  if (st === 'ENTREGADO' || st === 'ENTREGADA') {
    return { fill: [232, 245, 233], border: [56, 142, 60], label: [27, 94, 32] }
  }
  if (st === 'INGRESADO') {
    return { fill: [227, 242, 253], border: [25, 118, 210], label: [21, 101, 192] }
  }
  return { fill: [236, 239, 241], border: [120, 144, 156], label: [69, 90, 100] }
}

/**
 * Logotipo tipográfico SISTEBIT (estilo WordArt).
 * @returns {number} altura en mm
 */
function drawSistebitWordArtLogo(pdf, centerX, yTop) {
  const BLUE = [0, 102, 179]
  const BLACK = [28, 28, 28]
  const SHADOW = [175, 175, 175]

  const sizeS = 38
  const sizeWord = 25
  const overlap = 1.4

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(sizeS)
  const wS = pdf.getTextWidth('S')
  pdf.setFontSize(sizeWord)
  const wIstebit = pdf.getTextWidth('ISTEBIT')
  const markW = wS + wIstebit - overlap
  const x0 = centerX - markW / 2
  const baseline = yTop + 11.5

  const offX = 0.55
  const offY = 0.45

  pdf.setFontSize(sizeS)
  pdf.setTextColor(...SHADOW)
  pdf.text('S', x0 + offX, baseline + offY)
  pdf.setFontSize(sizeWord)
  pdf.text('ISTEBIT', x0 + wS - overlap + offX, baseline + offY)

  pdf.setFontSize(sizeS)
  pdf.setTextColor(...BLUE)
  pdf.text('S', x0, baseline)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(sizeWord)
  pdf.setTextColor(...BLACK)
  pdf.text('ISTEBIT', x0 + wS - overlap, baseline)

  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(10.5)
  pdf.setTextColor(...BLUE)
  const taglineY = baseline + 6.2
  pdf.text('smart Solutions', centerX, taglineY, { align: 'center' })

  return taglineY - yTop + 4
}

/**
 * Recuadro con etiqueta + valor (similar a inputs de la app).
 * @returns {number} altura del recuadro en mm
 */
function drawCampo(pdf, label, value, x, y, w, minH, theme) {
  const val = dashIfEmpty(value)
  const padX = 3
  const labelBand = 5.2

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10.5)
  const valLines = pdf.splitTextToSize(val, w - padX * 2)
  const h = Math.max(minH, labelBand + 4 + valLines.length * 4.4)

  pdf.setFillColor(210, 218, 226)
  pdf.roundedRect(x + 0.45, y + 0.45, w, h, 2.8, 2.8, 'F')

  pdf.setFillColor(...theme.fill)
  pdf.setDrawColor(...theme.border)
  pdf.setLineWidth(0.65)
  pdf.roundedRect(x, y, w, h, 2.8, 2.8, 'FD')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.2)
  pdf.setTextColor(...theme.label)
  pdf.text(String(label).toUpperCase(), x + padX, y + 3.6)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10.5)
  pdf.setTextColor(26, 32, 44)
  pdf.text(valLines, x + padX, y + labelBand + 3.8)

  return h
}

/** Fila: No. orden (recuadro chico) + fecha (al lado). */
function drawFilaOrdenYFecha(pdf, orden, fecha, x, y, totalW) {
  const gap = 4
  const h = 15
  const wOrden = totalW * 0.36
  const wFecha = totalW - wOrden - gap
  drawCampo(pdf, 'No. de Orden', orden, x, y, wOrden, h, TEMA.orden)
  drawCampo(pdf, 'Fecha', fecha, x + wOrden + gap, y, wFecha, h, TEMA.fecha)
  return h
}

/**
 * Bloques apilados de datos de la orden.
 * @returns {number} altura total en mm
 */
function drawCamposOrden(pdf, p, x, y, width) {
  const { orden, fechaCreacion, cliente = {}, equipo = {}, servicio = {} } = p
  const fecha = formatFechaOrdenPdf(fechaCreacion)

  let cy = y
  cy += drawFilaOrdenYFecha(pdf, String(orden ?? '—'), fecha, x, cy, width) + GAP_CAMPOS

  const campos = [
    ['Cliente', cliente.nombre, TEMA.cliente, 14],
    ['Serie del Equipo', equipo.serie, TEMA.serie, 13],
    ['Tipo de Equipo', equipo.tipo, TEMA.tipo, 13],
    ['Descripción', equipo.descripcion, TEMA.descripcion, 16],
    ['Problema Reportado', servicio.problemas, TEMA.problema, 18],
    ['Estatus', servicio.estatus, temaEstatus(servicio.estatus), 13],
  ]

  for (const [label, value, theme, minH] of campos) {
    const h = drawCampo(pdf, label, value, x, cy, width, minH, theme)
    cy += h + GAP_CAMPOS
  }

  return cy - y
}

function textoEquipoQr(equipo = {}) {
  const parts = []
  if (equipo.tipo) parts.push(String(equipo.tipo).trim())
  if (equipo.descripcion) parts.push(String(equipo.descripcion).trim())
  if (equipo.serie) parts.push(`Serie: ${String(equipo.serie).trim()}`)
  return parts.length ? parts.join(' — ') : '—'
}

/**
 * Genera el PDF de la orden de servicio (estilo comprobante SISTEBIT).
 */
export async function createOrdenServicioPdf(p) {
  const { cliente = {}, equipo = {} } = p

  const pdf = new jsPDF({
    unit: 'mm',
    format: ORDEN_PDF_FORMAT,
    orientation: 'portrait',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const margin = 16
  const contentW = W - 2 * margin
  const centerX = W / 2

  let y = 10
  y += drawSistebitWordArtLogo(pdf, centerX, y) + 2

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9.5)
  pdf.setTextColor(60, 60, 60)
  pdf.text('Centro de Servicio Autorizado EPSON', centerX, y, { align: 'center' })
  y += 7

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14.5)
  pdf.setTextColor(25, 118, 210)
  pdf.text('ORDEN DE SERVICIO', centerX, y, { align: 'center' })
  y += 10

  const camposH = drawCamposOrden(pdf, p, margin, y, contentW)
  y += camposH + 6

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.3)
  pdf.setTextColor(55, 55, 55)
  const legalLines = pdf.splitTextToSize(LEGAL_ORDEN_SERVICIO, contentW - 6)
  const legalH = legalLines.length * 4.1
  pdf.text(legalLines, centerX, y, { align: 'center', maxWidth: contentW - 6 })
  y += legalH + 10

  const qrText = buildEtiquetaQrPlainText({
    nombre: cliente.nombre,
    orden: p.orden,
    equipo: textoEquipoQr(equipo),
  })
  const qrDataUrl = await QRCode.toDataURL(qrText, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const qrSize = 36
  const qrY = Math.min(y, H - margin - qrSize - 2)
  pdf.addImage(qrDataUrl, 'PNG', centerX - qrSize / 2, qrY, qrSize, qrSize, undefined, 'FAST')

  return pdf
}

/** Genera y descarga el PDF de la orden de servicio. */
export async function downloadOrdenServicioPdf(p) {
  const pdf = await createOrdenServicioPdf(p)
  pdf.save(buildOrdenServicioPdfFilename(p.orden))
}
