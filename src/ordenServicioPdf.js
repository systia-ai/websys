import { jsPDF } from 'jspdf'
import { formatFechaLegibleEsMx } from './reparacionUtils.js'
import {
  SISTEBIT_PDF_FORMAT,
  GAP_CAMPOS,
  TEMA,
  COMPACT_CAMPO,
  dashIfEmpty,
  drawCampo,
  anchoRecuadroCompacto,
  anchoRecuadroCampo,
  drawEncabezadoSistebit,
  drawContactoSistebitPdf,
  printSistebitPdfDocument,
} from './sistebitPdfCommon.js'

/** @deprecated Use SISTEBIT_PDF_FORMAT */
export const ORDEN_PDF_FORMAT = SISTEBIT_PDF_FORMAT

export const LEGAL_ORDEN_SERVICIO =
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

/** Serie, tipo y descripción en una fila (recuadros compactos). */
function drawFilaSerieTipoDescripcion(pdf, equipo, x, y, totalW) {
  const gap = 3.5
  const hMin = 11
  const items = [
    { label: 'Serie del Equipo', value: dashIfEmpty(equipo.serie), theme: TEMA.serie, min: 30, max: 56 },
    { label: 'Tipo de Equipo', value: dashIfEmpty(equipo.tipo), theme: TEMA.tipo, min: 28, max: 46 },
    { label: 'Descripción', value: dashIfEmpty(equipo.descripcion), theme: TEMA.descripcion, min: 28, max: 56 },
  ]

  const gapsTotal = gap * (items.length - 1)
  let widths = items.map((it) =>
    Math.min(
      it.max,
      Math.max(it.min, anchoRecuadroCompacto(pdf, it.label, it.value, { min: it.min, max: it.max, pad: 7 })),
    ),
  )
  const sumW = widths.reduce((s, w) => s + w, 0)
  if (sumW > totalW - gapsTotal) {
    const scale = (totalW - gapsTotal) / sumW
    widths = widths.map((w, i) => Math.max(items[i].min, w * scale))
    const sum2 = widths.reduce((s, w) => s + w, 0)
    if (sum2 > totalW - gapsTotal) {
      const extra = (sum2 - (totalW - gapsTotal)) / items.length
      widths = widths.map((w) => w - extra)
    }
  }

  let cx = x
  let maxH = 0
  for (let i = 0; i < items.length; i++) {
    const h = drawCampo(pdf, items[i].label, items[i].value, cx, y, widths[i], hMin, items[i].theme, COMPACT_CAMPO)
    maxH = Math.max(maxH, h)
    cx += widths[i] + gap
  }
  return maxH
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

  const nombreCliente = dashIfEmpty(cliente.nombre)
  const wCliente = anchoRecuadroCampo(pdf, 'Cliente', nombreCliente, {
    min: 48,
    maxW: width,
    pad: 14,
    valueFontSize: 10.5,
  })
  cy += drawCampo(pdf, 'Cliente', nombreCliente, x, cy, wCliente, 14, TEMA.cliente) + GAP_CAMPOS
  cy += drawFilaSerieTipoDescripcion(pdf, equipo, x, cy, width) + GAP_CAMPOS
  cy += drawCampo(pdf, 'Problema Reportado', dashIfEmpty(servicio.problemas), x, cy, width, 18, TEMA.problema)

  return cy - y
}

/**
 * Genera el PDF de la orden de servicio (estilo comprobante SISTEBIT).
 */
export function createOrdenServicioPdf(p) {
  const pdf = new jsPDF({
    unit: 'mm',
    format: SISTEBIT_PDF_FORMAT,
    orientation: 'portrait',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
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
  y += legalH + 3
  drawContactoSistebitPdf(pdf, y, contentW, centerX)

  return pdf
}

/** Genera y descarga el PDF de la orden de servicio. */
export function downloadOrdenServicioPdf(p) {
  const pdf = createOrdenServicioPdf(p)
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
  const pdf = createOrdenServicioPdf(p)
  return printOrdenServicioPdfDocument(pdf)
}

/** Descarga el PDF y abre el diálogo de impresión (un solo documento generado). */
export async function downloadAndPrintOrdenServicioPdf(p) {
  const pdf = createOrdenServicioPdf(p)
  pdf.save(buildOrdenServicioPdfFilename(p.orden))
  return printOrdenServicioPdfDocument(pdf)
}
