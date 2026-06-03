import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import { buildEtiquetaQrPlainText } from './etiquetaLink.js'
import { formatFechaLegibleEsMx } from './reparacionUtils.js'
import {
  SISTEBIT_PDF_FORMAT,
  GAP_CAMPOS,
  TEMA,
  COMPACT_CAMPO,
  dashIfEmpty,
  temaEstatus,
  drawCampo,
  anchoRecuadroCompacto,
  drawEncabezadoSistebit,
  printSistebitPdfDocument,
} from './sistebitPdfCommon.js'

/** @deprecated Use SISTEBIT_PDF_FORMAT */
export const ORDEN_PDF_FORMAT = SISTEBIT_PDF_FORMAT

const LEGAL_ORDEN_SERVICIO =
  'Toda revisión tiene un costo. Garantía del servicio 15 días sobre la misma falla. Cuenta con 30 días para recoger su equipo una vez que se le informó del diagnóstico de su equipo. Todo Servicio, Limpieza y drenado del cabezal consume tinta del mismo equipo. Nuestro horario es de Lunes a Viernes de 10:00 AM a 6:00 PM y sábados de 9:00 AM a 2:00 PM'

export function buildOrdenServicioPdfFilename(orden) {
  const safe = String(orden ?? 'orden').replace(/[^\w.-]+/g, '_')
  return `orden-servicio-${safe}.pdf`
}

function formatFechaOrdenPdf(fechaCreacion) {
  return formatFechaLegibleEsMx(fechaCreacion, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Fila superior: dos recuadros pequeños (orden + fecha), alineados a la izquierda. */
function drawFilaOrdenYFecha(pdf, orden, fecha, x, y, totalW) {
  void totalW
  const gap = 3.5
  const ordenStr = String(orden ?? '—')
  const fechaStr = dashIfEmpty(fecha)

  const wOrden = anchoRecuadroCompacto(pdf, 'No. de Orden', ordenStr, { min: 24, max: 32, pad: 10 })
  const wFecha = anchoRecuadroCompacto(pdf, 'Fecha', fechaStr, { min: 36, max: 50, pad: 8 })

  const h = 11
  drawCampo(pdf, 'No. de Orden', ordenStr, x, y, wOrden, h, TEMA.orden, { ...COMPACT_CAMPO, padX: 3.2 })
  drawCampo(pdf, 'Fecha', fechaStr, x + wOrden + gap, y, wFecha, h, TEMA.fecha, COMPACT_CAMPO)
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
    format: SISTEBIT_PDF_FORMAT,
    orientation: 'portrait',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()
  const margin = 16
  const contentW = W - 2 * margin
  const centerX = W / 2

  let y = drawEncabezadoSistebit(pdf, 'ORDEN DE SERVICIO', centerX, 10)

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

/** @deprecated Use printSistebitPdfDocument from sistebitPdfCommon.js */
export function printOrdenServicioPdfDocument(pdf) {
  return printSistebitPdfDocument(pdf, {
    timeoutMsg: 'Tiempo de espera al cargar la orden para imprimir.',
    iframeTitle: 'Imprimir orden de servicio',
  })
}

/** Genera el PDF y abre el diálogo de impresión. */
export async function printOrdenServicioPdf(p) {
  const pdf = await createOrdenServicioPdf(p)
  return printOrdenServicioPdfDocument(pdf)
}

/** Descarga el PDF y abre el diálogo de impresión (un solo documento generado). */
export async function downloadAndPrintOrdenServicioPdf(p) {
  const pdf = await createOrdenServicioPdf(p)
  pdf.save(buildOrdenServicioPdfFilename(p.orden))
  return printOrdenServicioPdfDocument(pdf)
}
