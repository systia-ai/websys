import { claveCanonicaTipoServicio, formatFechaLegibleEsMx } from './reparacionUtils.js'
import {
  RECIBO_MM_H,
  RECIBO_PAGE_FORMAT,
  TEMA,
  COMPACT_CAMPO,
  dashIfEmpty,
  drawCampo,
  anchoRecuadroCompacto,
  anchoRecuadroCampo,
  drawEncabezadoSistebit,
  drawContactoSistebitPdf,
  measureContactoSistebitPdf,
  createMediaCartaPdf,
  addMediaCartaPage,
  stampGuiaMediaCartaTodasPaginas,
  printSistebitPdfDocument,
} from './sistebitPdfCommon.js'

/** @deprecated Use RECIBO_PAGE_FORMAT (Carta vertical, media hoja arriba) */
export const ORDEN_PDF_FORMAT = RECIBO_PAGE_FORMAT

export const LEGAL_ORDEN_SERVICIO =
  'Toda revisión tiene un costo. Garantía del servicio 15 días sobre la misma falla. Cuenta con 30 días para recoger su equipo una vez que se le informó del diagnóstico de su equipo. Todo Servicio, Limpieza y drenado del cabezal consume tinta del mismo equipo. Nuestro horario es de Lunes a Viernes de 10:00 AM a 6:00 PM y sábados de 9:00 AM a 2:00 PM'

const MARGIN = 6
const GAP_ORDEN_CAMPOS = 3
const GAP_ANTES_PIE = 4
const GAP_ANTES_LEYENDA = 2
const GAP_LEYENDA_CONTACTO = 2
const FUENTE_LEGAL_ORDEN = 7.2
const LINE_H_LEGAL = 3.5

export function buildOrdenServicioPdfFilename(orden) {
  const safe = String(orden ?? 'orden').replace(/[^\w.-]+/g, '_')
  return `orden-servicio-${safe}.pdf`
}

function formatFechaOrdenPdf(fechaCreacion) {
  return formatFechaLegibleEsMx(fechaCreacion, { day: 'numeric', month: 'long', year: 'numeric' })
}

function measureLeyendaOrdenHeight(pdf, contentW) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(FUENTE_LEGAL_ORDEN)
  const legalLines = pdf.splitTextToSize(LEGAL_ORDEN_SERVICIO, contentW - 6)
  return legalLines.length * LINE_H_LEGAL + GAP_LEYENDA_CONTACTO
}

function measurePieOrdenHeight(pdf, contentW) {
  return GAP_ANTES_LEYENDA + measureLeyendaOrdenHeight(pdf, contentW) + measureContactoSistebitPdf(pdf, contentW)
}

function drawLeyendaOrden(pdf, y, contentW, centerX) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(FUENTE_LEGAL_ORDEN)
  pdf.setTextColor(55, 55, 55)
  const legalLines = pdf.splitTextToSize(LEGAL_ORDEN_SERVICIO, contentW - 6)
  pdf.text(legalLines, centerX, y, { align: 'center', maxWidth: contentW - 6 })
  return legalLines.length * LINE_H_LEGAL + GAP_LEYENDA_CONTACTO
}

function drawPieOrden(pdf, y, contentW, centerX) {
  const yLeyenda = y + GAP_ANTES_LEYENDA
  const leyendaH = drawLeyendaOrden(pdf, yLeyenda, contentW, centerX)
  return GAP_ANTES_LEYENDA + leyendaH + drawContactoSistebitPdf(pdf, yLeyenda + leyendaH, contentW, centerX)
}

function labelTipoServicioPdf(raw) {
  const canon = claveCanonicaTipoServicio(raw)
  if (canon) return canon
  const t = String(raw ?? '').trim()
  return t || '—'
}

/** Cliente, no. de orden y tipo de servicio a la izquierda; fecha al final derecho. */
function drawFilaClienteOrdenFecha(pdf, clienteNombre, orden, fecha, tipoServicio, x, y, totalW) {
  const gap = 3
  const hMin = 10
  const nombre = dashIfEmpty(clienteNombre)
  const ordenStr = String(orden ?? '—')
  const fechaStr = dashIfEmpty(fecha)
  const tipoStr = labelTipoServicioPdf(tipoServicio)

  const blocksLeft = [
    { label: 'Cliente', value: nombre, theme: TEMA.cliente, min: 20, campo: true },
    { label: 'No. de Orden', value: ordenStr, theme: TEMA.orden, min: 20, max: 28, campo: false },
    { label: 'Tipo servicio', value: tipoStr, theme: TEMA.servicio, min: 22, max: 38, campo: false },
  ]
  const blockFecha = {
    label: 'Fecha',
    value: fechaStr,
    theme: TEMA.fecha,
    min: 26,
    max: 46,
    campo: false,
  }

  const wFecha = Math.min(
    blockFecha.max,
    Math.max(
      blockFecha.min,
      anchoRecuadroCompacto(pdf, blockFecha.label, blockFecha.value, {
        min: blockFecha.min,
        max: blockFecha.max,
        pad: 7,
      }),
    ),
  )
  const anchoIzq = totalW - wFecha - gap

  const gapsLeft = gap * (blocksLeft.length - 1)
  let widthsLeft = blocksLeft.map((b) => {
    if (b.campo) {
      const w = anchoRecuadroCampo(pdf, b.label, b.value, {
        min: b.min,
        maxW: anchoIzq,
        pad: 10,
        labelFontSize: 6.8,
        valueFontSize: 9,
      })
      return Math.max(b.min, w)
    }
    return Math.min(
      b.max,
      Math.max(b.min, anchoRecuadroCompacto(pdf, b.label, b.value, { min: b.min, max: b.max, pad: 7 })),
    )
  })

  const sumLeft = widthsLeft.reduce((s, w) => s + w, 0)
  if (sumLeft > anchoIzq - gapsLeft) {
    const scale = (anchoIzq - gapsLeft) / sumLeft
    widthsLeft = widthsLeft.map((w, i) => Math.max(blocksLeft[i].min * 0.85, w * scale))
    const sum2 = widthsLeft.reduce((s, w) => s + w, 0)
    if (sum2 > anchoIzq - gapsLeft) {
      const extra = (sum2 - (anchoIzq - gapsLeft)) / blocksLeft.length
      widthsLeft = widthsLeft.map((w) => w - extra)
    }
  }

  let cx = x
  let maxH = 0
  for (let i = 0; i < blocksLeft.length; i++) {
    const b = blocksLeft[i]
    const opts = b.campo ? { ...COMPACT_CAMPO, padX: 2.4 } : { ...COMPACT_CAMPO, padX: 3.2 }
    const h = drawCampo(pdf, b.label, b.value, cx, y, widthsLeft[i], hMin, b.theme, opts)
    maxH = Math.max(maxH, h)
    cx += widthsLeft[i] + gap
  }

  const xFecha = x + totalW - wFecha
  const hFecha = drawCampo(pdf, blockFecha.label, blockFecha.value, xFecha, y, wFecha, hMin, blockFecha.theme, {
    ...COMPACT_CAMPO,
    padX: 3.2,
  })
  return Math.max(maxH, hFecha)
}

/** Serie, tipo y descripción en una fila (recuadros compactos). */
function drawFilaSerieTipoDescripcion(pdf, equipo, x, y, totalW) {
  const gap = 3.5
  const hMin = 10
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
 * @param {number} [maxY] Si el siguiente bloque pasaría este Y, nueva página.
 * @returns {number} altura total en mm
 */
function drawCamposOrden(pdf, p, x, y, width, maxY) {
  const { orden, fechaCreacion, cliente = {}, equipo = {}, servicio = {} } = p
  const fecha = formatFechaOrdenPdf(fechaCreacion)

  let cy = y
  const gap = GAP_ORDEN_CAMPOS

  function ensureSpace(needMm) {
    if (maxY != null && cy + needMm > maxY) {
      addMediaCartaPage(pdf)
      cy = MARGIN
    }
  }

  ensureSpace(11 + gap)
  const tipoServ = servicio.tipoReparacion ?? servicio.tipo ?? p.tipoReparacion
  cy += drawFilaClienteOrdenFecha(pdf, cliente.nombre, orden, fecha, tipoServ, x, cy, width) + gap

  ensureSpace(11 + gap)
  cy += drawFilaSerieTipoDescripcion(pdf, equipo, x, cy, width) + gap

  ensureSpace(14)
  cy += drawCampo(pdf, 'Problema Reportado', dashIfEmpty(servicio.problemas), x, cy, width, 12, TEMA.problema, {
    ...COMPACT_CAMPO,
    valueFontSize: 8.5,
  })

  return cy - y
}

/**
 * Genera la orden: hoja Carta vertical, contenido en la mitad superior (8.5″ × 5.5″).
 */
export function createOrdenServicioPdf(p) {
  const pdf = createMediaCartaPdf()

  const W = pdf.internal.pageSize.getWidth()
  const contentW = W - 2 * MARGIN
  const centerX = W / 2
  const zonaBottom = RECIBO_MM_H - MARGIN

  let y = drawEncabezadoSistebit(pdf, 'ORDEN DE SERVICIO', centerX, 4, {
    scale: 0.5,
    subtitleSize: 7.2,
    titleSize: 10.5,
  })

  y += drawCamposOrden(pdf, p, MARGIN, y, contentW, zonaBottom) + GAP_ANTES_PIE

  const pieH = measurePieOrdenHeight(pdf, contentW)
  if (y + pieH > zonaBottom) {
    addMediaCartaPage(pdf)
    y = MARGIN
  }

  drawPieOrden(pdf, y, contentW, centerX)

  stampGuiaMediaCartaTodasPaginas(pdf, contentW, MARGIN)

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
    iframeTitle: 'Imprimir orden — Carta vertical, media hoja arriba',
  })
}

/** Genera el PDF y abre el diálogo de impresión. */
export async function printOrdenServicioPdf(p) {
  const pdf = createOrdenServicioPdf(p)
  return printOrdenServicioPdfDocument(pdf)
}

export const ORDEN_PRINT_HINT =
  'Impresión: papel Carta, orientación Vertical, escala 100 %. La orden sale en la mitad superior (5.5″); puede cortar o usar media hoja precortada.'

/** Descarga el PDF y abre el diálogo de impresión (un solo documento generado). */
export async function downloadAndPrintOrdenServicioPdf(p) {
  const pdf = createOrdenServicioPdf(p)
  pdf.save(buildOrdenServicioPdfFilename(p.orden))
  return printOrdenServicioPdfDocument(pdf)
}
