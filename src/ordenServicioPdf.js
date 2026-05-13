import { jsPDF } from 'jspdf'

/** Tamaño carta (216 × 279 mm), orientación vertical. */
export const ORDEN_PDF_FORMAT = 'letter'

export function buildOrdenServicioPdfFilename(orden) {
  const safe = String(orden ?? 'orden').replace(/[^\w.-]+/g, '_')
  return `orden-servicio-${safe}.pdf`
}

function formatFechaHoy() {
  const d = new Date()
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`
}

function dashIfEmpty(v) {
  const s = String(v ?? '').trim()
  return s.length ? s : '—'
}

function drawSectionTitle(pdf, text, x, y, width) {
  pdf.setFillColor(30, 64, 175)
  pdf.rect(x, y, width, 6.8, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10.5)
  pdf.text(text, x + 2.5, y + 4.7)
  pdf.setTextColor(0, 0, 0)
}

/**
 * Dibuja un campo "Etiqueta: valor" en una sola línea (recorta si excede).
 * @returns {number} altura consumida (mm)
 */
function drawField(pdf, label, value, x, y, maxWidth) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(70, 70, 70)
  pdf.text(label, x, y)
  const lblW = pdf.getTextWidth(label)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(0, 0, 0)
  const text = dashIfEmpty(value)
  const lines = pdf.splitTextToSize(text, Math.max(20, maxWidth - lblW - 2))
  pdf.text(lines[0] ?? '—', x + lblW + 2, y)
  return 5.5
}

/**
 * Dibuja un bloque etiqueta arriba + valor multilínea debajo.
 * @returns {number} altura total consumida (mm)
 */
function drawMultilineBlock(pdf, label, value, x, y, width) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(70, 70, 70)
  if (label) pdf.text(label, x, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(0, 0, 0)
  const text = dashIfEmpty(value)
  const lines = pdf.splitTextToSize(text, width)
  const startY = label ? y + 4.5 : y
  pdf.text(lines, x, startY)
  const blockH = lines.length * 4.6
  return (label ? 4.5 : 0) + blockH + 1.5
}

/**
 * Genera el PDF de la orden de servicio.
 *
 * @param {{
 *   orden: string|number,
 *   fechaCreacion?: string,
 *   cliente?: { nombre?: string, telefono?: string, correo?: string, domicilio?: string },
 *   equipo?: { serie?: string, tipo?: string, descripcion?: string },
 *   servicio?: {
 *     tipoReparacion?: string,
 *     estatus?: string,
 *     tecnico?: string,
 *     problemas?: string,
 *     nivelesTinta?: string,
 *   },
 *   solucion?: string,
 * }} p
 */
export function createOrdenServicioPdf(p) {
  const {
    orden,
    fechaCreacion,
    cliente = {},
    equipo = {},
    servicio = {},
    solucion,
  } = p

  const pdf = new jsPDF({
    unit: 'mm',
    format: ORDEN_PDF_FORMAT,
    orientation: 'portrait',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
  const margin = 14
  const contentW = W - 2 * margin
  const halfColW = contentW / 2 - 2

  pdf.setFillColor(30, 64, 175)
  pdf.rect(0, 0, W, 22, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text('ORDEN DE SERVICIO', margin, 13)
  pdf.setFontSize(20)
  pdf.text(`#${String(orden ?? '—')}`, W - margin, 13, { align: 'right' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(`Fecha: ${fechaCreacion || formatFechaHoy()}`, W - margin, 19, { align: 'right' })
  pdf.setTextColor(0, 0, 0)

  let y = 30

  drawSectionTitle(pdf, 'CLIENTE', margin, y, contentW)
  y += 10
  y += drawField(pdf, 'Nombre:', cliente.nombre, margin, y, contentW)
  drawField(pdf, 'Teléfono:', cliente.telefono, margin, y, halfColW)
  y += drawField(pdf, 'Correo:', cliente.correo, margin + contentW / 2 + 2, y, halfColW)
  y += drawField(pdf, 'Domicilio:', cliente.domicilio, margin, y, contentW)
  y += 3

  drawSectionTitle(pdf, 'EQUIPO', margin, y, contentW)
  y += 10
  drawField(pdf, 'Serie:', equipo.serie, margin, y, halfColW)
  y += drawField(pdf, 'Tipo:', equipo.tipo, margin + contentW / 2 + 2, y, halfColW)
  y += drawMultilineBlock(pdf, 'Descripción del equipo:', equipo.descripcion, margin, y, contentW)
  y += 2

  drawSectionTitle(pdf, 'SERVICIO', margin, y, contentW)
  y += 10
  drawField(pdf, 'Tipo reparación:', servicio.tipoReparacion, margin, y, halfColW)
  y += drawField(pdf, 'Estatus:', servicio.estatus, margin + contentW / 2 + 2, y, halfColW)
  y += drawField(pdf, 'Técnico(s):', servicio.tecnico, margin, y, contentW)
  y += drawMultilineBlock(pdf, 'Problemas reportados:', servicio.problemas, margin, y, contentW)
  y += drawField(pdf, 'Niveles de tinta (B/Y/M/C/ML/CL):', servicio.nivelesTinta, margin, y, contentW)
  y += 3

  const solStr = String(solucion ?? '').trim()
  if (solStr) {
    drawSectionTitle(pdf, 'SOLUCIÓN APLICADA', margin, y, contentW)
    y += 10
    y += drawMultilineBlock(pdf, '', solStr, margin, y, contentW)
  }

  const pageH = pdf.internal.pageSize.getHeight()
  const firmaY = Math.max(y + 18, pageH - 38)
  pdf.setDrawColor(120, 120, 120)
  pdf.setLineWidth(0.3)
  pdf.line(margin + 10, firmaY, margin + 70, firmaY)
  pdf.line(W - margin - 70, firmaY, W - margin - 10, firmaY)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.setTextColor(80, 80, 80)
  pdf.text('Firma del cliente', margin + 40, firmaY + 4, { align: 'center' })
  pdf.text('Firma del técnico', W - margin - 40, firmaY + 4, { align: 'center' })

  pdf.setFontSize(7.5)
  pdf.setTextColor(140, 140, 140)
  pdf.text(`Documento generado el ${formatFechaHoy()}`, margin, pageH - 10)

  return pdf
}

/** Genera y descarga el PDF de la orden de servicio. */
export function downloadOrdenServicioPdf(p) {
  const pdf = createOrdenServicioPdf(p)
  pdf.save(buildOrdenServicioPdfFilename(p.orden))
}
