/** Utilidades compartidas para PDFs SISTEBIT (orden de servicio, recibo de cuenta, etc.). */

import { jsPDF } from 'jspdf'
import { WHATSAPP_ICON_PNG_BASE64 } from './whatsappIconBase64.js'

/** Tamaño carta (216 × 279 mm), orientación vertical. */
export const SISTEBIT_PDF_FORMAT = 'letter'

/**
 * Comprobante en media hoja carta: PDF tamaño Carta vertical; contenido en la mitad superior (5.5″).
 * Así la impresora usa papel Carta sin forzar orientación horizontal ni tamaño custom.
 */
export const RECIBO_IN_W = 8.5
export const RECIBO_IN_H = 5.5
export const RECIBO_MM_W = 215.9
export const RECIBO_MM_H = 139.7
export const RECIBO_PAGE_FORMAT = SISTEBIT_PDF_FORMAT

/** Crea PDF carta vertical (contenido en mitad superior vía `RECIBO_MM_H`). */
export function createMediaCartaPdf() {
  return new jsPDF({
    unit: 'mm',
    format: RECIBO_PAGE_FORMAT,
    orientation: 'portrait',
    compress: true,
  })
}

export function addMediaCartaPage(pdf) {
  pdf.addPage(RECIBO_PAGE_FORMAT, 'p')
}

/** Y máximo de contenido (mm desde arriba) en media hoja carta. */
export function mediaCartaZonaMaxY(margin = 5) {
  return RECIBO_MM_H - margin
}

/** Mitad inferior de la hoja carta en blanco (para volver a imprimir al reverso). */
export function fillMediaCartaMitadInferiorBlanca(pdf) {
  const W = pdf.internal.pageSize.getWidth()
  const fullH = pdf.internal.pageSize.getHeight()
  if (fullH <= RECIBO_MM_H + 0.5) return
  pdf.setFillColor(255, 255, 255)
  pdf.setDrawColor(255, 255, 255)
  pdf.rect(0, RECIBO_MM_H, W, fullH - RECIBO_MM_H + 1, 'F')
}

/** Línea guía al corte de media hoja (5.5″ desde el borde superior). */
export function drawGuiaMediaCartaPdf(pdf, contentW, margin) {
  const y = RECIBO_MM_H
  pdf.setDrawColor(180, 188, 198)
  pdf.setLineWidth(0.2)
  if (typeof pdf.setLineDashPattern === 'function') {
    pdf.setLineDashPattern([1.2, 1.2], 0)
  }
  pdf.line(margin, y, margin + contentW, y)
  if (typeof pdf.setLineDashPattern === 'function') {
    pdf.setLineDashPattern([], 0)
  }
}

export function stampGuiaMediaCartaTodasPaginas(pdf, contentW, margin) {
  finalizarPaginasMediaCarta(pdf, contentW, margin)
}

/** Blanco en mitad inferior + guía de corte en cada página (impresión 2-up volteando hoja). */
export function finalizarPaginasMediaCarta(pdf, contentW, margin) {
  const n = pdf.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i)
    fillMediaCartaMitadInferiorBlanca(pdf)
    drawGuiaMediaCartaPdf(pdf, contentW, margin)
  }
}

export const GAP_CAMPOS = 3.8

/** Paleta tipo app (rep-block.highlight) y variaciones suaves. */
export const TEMA = {
  orden: { fill: [227, 242, 253], border: [25, 118, 210], label: [21, 101, 192] },
  fecha: { fill: [232, 245, 255], border: [3, 155, 229], label: [13, 71, 161] },
  cliente: { fill: [237, 243, 255], border: [63, 81, 181], label: [48, 63, 159] },
  serie: { fill: [225, 245, 254], border: [2, 136, 209], label: [1, 87, 155] },
  tipo: { fill: [224, 247, 250], border: [0, 151, 167], label: [0, 121, 137] },
  descripcion: { fill: [240, 248, 255], border: [100, 181, 246], label: [30, 136, 229] },
  problema: { fill: [255, 248, 225], border: [255, 167, 38], label: [230, 126, 34] },
  servicio: { fill: [243, 229, 245], border: [142, 36, 170], label: [123, 31, 162] },
  pago: { fill: [232, 245, 233], border: [56, 142, 60], label: [27, 94, 32] },
}

export const COMPACT_CAMPO = { compact: true, valueFontSize: 9 }

const SISTEBIT_DIRECCION = 'Blvd Díaz Ordas 1723, local 15 A, Zona centro.'
const SISTEBIT_TEL = 'Tel 62 6-26-55-55'
const SISTEBIT_WHATSAPP = '462 209 0526'
const SISTEBIT_CIUDAD = 'Irapuato Gto.'

/** Texto plano (sin icono); pie PDF usa `drawContactoSistebitPdf`. */
export const CONTACTO_SISTEBIT = `${SISTEBIT_DIRECCION} ${SISTEBIT_TEL} ${SISTEBIT_WHATSAPP} ${SISTEBIT_CIUDAD}`

const WHATSAPP_LABEL = 'WhatsApp'
const WHATSAPP_ICON_MM = 3.8
const WHATSAPP_ICON_GAP = 0.9
const WHATSAPP_ICON_DATA_URL = `data:image/png;base64,${WHATSAPP_ICON_PNG_BASE64}`

function whatsappContactoTexto() {
  return `${WHATSAPP_LABEL} ${SISTEBIT_WHATSAPP}`
}

function measureWhatsappBloqueWidth(pdf) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  return WHATSAPP_ICON_MM + WHATSAPP_ICON_GAP + pdf.getTextWidth(whatsappContactoTexto())
}

/** Logo WhatsApp oficial (PNG) + texto en negrita. @returns {number} ancho total en mm */
function drawWhatsappBloque(pdf, x, yBaseline) {
  const size = WHATSAPP_ICON_MM
  const top = yBaseline - size * 0.88
  pdf.addImage(WHATSAPP_ICON_DATA_URL, 'PNG', x, top, size, size, undefined, 'FAST')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  pdf.setTextColor(21, 101, 192)
  pdf.text(whatsappContactoTexto(), x + size + WHATSAPP_ICON_GAP, yBaseline)
  return measureWhatsappBloqueWidth(pdf)
}

export function dashIfEmpty(v) {
  const s = String(v ?? '').trim()
  return s.length ? s : '—'
}

export function temaEstatus(estatus) {
  const st = String(estatus ?? '').trim().toUpperCase()
  if (st === 'ENTREGADO' || st === 'ENTREGADA' || st === 'LIQUIDADA') {
    return { fill: [232, 245, 233], border: [56, 142, 60], label: [27, 94, 32] }
  }
  if (st === 'INGRESADO' || st === 'ACTIVA PAGADA') {
    return { fill: [227, 242, 253], border: [25, 118, 210], label: [21, 101, 192] }
  }
  return { fill: [236, 239, 241], border: [120, 144, 156], label: [69, 90, 100] }
}

/**
 * Logotipo tipográfico SISTEBIT (estilo WordArt).
 * @param {number} [scale=1] Escala (p. ej. 0.55 en media hoja).
 * @returns {number} altura en mm
 */
export function drawSistebitWordArtLogo(pdf, centerX, yTop, scale = 1) {
  const BLUE = [0, 102, 179]
  const BLACK = [28, 28, 28]
  const SHADOW = [175, 175, 175]

  const sizeS = 38 * scale
  const sizeWord = 25 * scale
  const overlap = 1.4 * scale

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(sizeS)
  const wS = pdf.getTextWidth('S')
  pdf.setFontSize(sizeWord)
  const wIstebit = pdf.getTextWidth('ISTEBIT')
  const markW = wS + wIstebit - overlap
  const x0 = centerX - markW / 2
  const baseline = yTop + 11.5 * scale

  const offX = 0.55 * scale
  const offY = 0.45 * scale

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
  pdf.setFontSize(10.5 * scale)
  pdf.setTextColor(...BLUE)
  const taglineY = baseline + 6.2 * scale
  pdf.text('smart Solutions', centerX, taglineY, { align: 'center' })

  return taglineY - yTop + 4 * scale
}

/**
 * Recuadro con etiqueta + valor (similar a inputs de la app).
 * @returns {number} altura del recuadro en mm
 */
export function drawCampo(pdf, label, value, x, y, w, minH, theme, opts = {}) {
  const val = dashIfEmpty(value)
  const padX = opts.padX ?? (opts.compact ? 2.5 : 3)
  const labelBand = opts.compact ? 4.6 : 5.2
  const valueFontSize = opts.valueFontSize ?? 10.5
  const labelFontSize = opts.compact ? 6.8 : 7.2

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(valueFontSize)
  const valLines = pdf.splitTextToSize(val, w - padX * 2)
  const lineH = opts.compact ? 3.9 : 4.4
  const h = Math.max(minH, labelBand + 3.5 + valLines.length * lineH)

  pdf.setFillColor(210, 218, 226)
  pdf.roundedRect(x + 0.45, y + 0.45, w, h, 2.8, 2.8, 'F')

  pdf.setFillColor(...theme.fill)
  pdf.setDrawColor(...theme.border)
  pdf.setLineWidth(0.65)
  pdf.roundedRect(x, y, w, h, 2.8, 2.8, 'FD')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(labelFontSize)
  pdf.setTextColor(...theme.label)
  pdf.text(String(label).toUpperCase(), x + padX, y + (opts.compact ? 3.2 : 3.6))

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(valueFontSize)
  pdf.setTextColor(26, 32, 44)
  pdf.text(valLines, x + padX, y + labelBand + (opts.compact ? 3.2 : 3.8))

  return h
}

/** Ancho de recuadro compacto: el mayor entre etiqueta, valor y mínimo, + margen horizontal. */
export function anchoRecuadroCompacto(pdf, label, value, { min = 22, max = 52, pad = 9 } = {}) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.8)
  const wLabel = pdf.getTextWidth(String(label).toUpperCase())
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(COMPACT_CAMPO.valueFontSize)
  const wVal = pdf.getTextWidth(dashIfEmpty(value))
  const w = Math.max(wLabel, wVal) + pad
  return Math.min(Math.max(w, min), max)
}

/**
 * Ancho de recuadro según contenido (p. ej. nombre de cliente).
 * Si el texto es largo, usa hasta `maxW` y el valor hace salto de línea dentro de drawCampo.
 */
export function anchoRecuadroCampo(
  pdf,
  label,
  value,
  { min = 40, maxW = 180, pad = 12, labelFontSize = 7.2, valueFontSize = 10.5 } = {},
) {
  const val = dashIfEmpty(value)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(labelFontSize)
  const wLabel = pdf.getTextWidth(String(label).toUpperCase())
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(valueFontSize)
  const inner = Math.max(24, maxW - pad * 2)
  const lines = pdf.splitTextToSize(val, inner)
  let wVal = 0
  for (const line of lines) {
    wVal = Math.max(wVal, pdf.getTextWidth(line))
  }
  const w = Math.max(wLabel, wVal) + pad
  return Math.min(Math.max(w, min), maxW)
}

/**
 * Encabezado estándar SISTEBIT + título del documento.
 * @param {{ scale?: number, subtitleSize?: number, titleSize?: number }} [opts]
 * @returns {number} nueva Y
 */
export function drawEncabezadoSistebit(pdf, titulo, centerX, yStart, opts = {}) {
  const scale = opts.scale ?? 1
  const subtitleSize = opts.subtitleSize ?? 9.5
  const titleSize = opts.titleSize ?? 14.5

  let y = yStart
  y += drawSistebitWordArtLogo(pdf, centerX, y, scale) + 2 * scale

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(subtitleSize)
  pdf.setTextColor(60, 60, 60)
  pdf.text('Centro de Servicio Autorizado EPSON', centerX, y, { align: 'center' })
  y += 7 * scale

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(titleSize)
  pdf.setTextColor(25, 118, 210)
  pdf.text(titulo, centerX, y, { align: 'center' })
  return y + (opts.compactFooter ? 6 : 7) * scale
}

/** Altura en mm del bloque de contacto (misma lógica que `drawContactoSistebitPdf`). */
export function measureContactoSistebitPdf(pdf, contentW, { compact = false } = {}) {
  const fontSize = compact ? 6.8 : 7.5
  const lineH = compact ? 3.15 : 3.6
  const maxW = contentW - 6
  const seg = '  '

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(fontSize)
  const addrLines = pdf.splitTextToSize(SISTEBIT_DIRECCION, maxW)
  let h = addrLines.length * lineH

  pdf.setFontSize(fontSize)
  const wTel = pdf.getTextWidth(SISTEBIT_TEL)
  const wSeg = pdf.getTextWidth(seg)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(fontSize)
  const wWa = measureWhatsappBloqueWidth(pdf)
  pdf.setFont('helvetica', 'normal')
  const wCiudad = pdf.getTextWidth(`${seg}${SISTEBIT_CIUDAD}`)
  const filaW = wTel + wSeg + wWa + wCiudad
  h += filaW <= maxW ? lineH : lineH * 2
  return h
}

/** Datos de contacto SISTEBIT centrados (pie de PDF). */
export function drawContactoSistebitPdf(pdf, y, contentW, centerX, { compact = false } = {}) {
  const fontSize = compact ? 6.8 : 7.5
  const lineH = compact ? 3.15 : 3.6
  const iconMm = compact ? 3.2 : WHATSAPP_ICON_MM
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(fontSize)
  pdf.setTextColor(21, 101, 192)
  const maxW = contentW - 6
  const seg = '  '

  let yCur = y
  const addrLines = pdf.splitTextToSize(SISTEBIT_DIRECCION, maxW)
  pdf.text(addrLines, centerX, yCur, { align: 'center', maxWidth: maxW })
  yCur += addrLines.length * lineH

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(fontSize)
  const wTel = pdf.getTextWidth(SISTEBIT_TEL)
  const wSeg = pdf.getTextWidth(seg)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(fontSize)
  const waText = `${WHATSAPP_LABEL} ${SISTEBIT_WHATSAPP}`
  const wWa = iconMm + WHATSAPP_ICON_GAP + pdf.getTextWidth(waText)
  pdf.setFont('helvetica', 'normal')
  const ciudadText = `${seg}${SISTEBIT_CIUDAD}`
  const wCiudad = pdf.getTextWidth(ciudadText)
  const filaW = wTel + wSeg + wWa + wCiudad

  if (filaW <= maxW) {
    let x = centerX - filaW / 2
    pdf.text(SISTEBIT_TEL, x, yCur)
    x += wTel + wSeg
    const top = yCur - iconMm * 0.88
    pdf.addImage(WHATSAPP_ICON_DATA_URL, 'PNG', x, top, iconMm, iconMm, undefined, 'FAST')
    pdf.setFont('helvetica', 'bold')
    pdf.text(waText, x + iconMm + WHATSAPP_ICON_GAP, yCur)
    x += wWa
    pdf.setFont('helvetica', 'normal')
    pdf.text(ciudadText, x, yCur)
    return yCur - y + lineH
  }

  pdf.text(SISTEBIT_TEL, centerX, yCur, { align: 'center' })
  yCur += lineH
  const fila2W = wWa + wCiudad
  let x2 = centerX - fila2W / 2
  const top2 = yCur - iconMm * 0.88
  pdf.addImage(WHATSAPP_ICON_DATA_URL, 'PNG', x2, top2, iconMm, iconMm, undefined, 'FAST')
  pdf.setFont('helvetica', 'bold')
  pdf.text(waText, x2 + iconMm + WHATSAPP_ICON_GAP, yCur)
  x2 += wWa
  pdf.setFont('helvetica', 'normal')
  pdf.text(ciudadText, x2, yCur)
  return yCur - y + lineH
}

/**
 * Abre el diálogo de impresión de un documento jsPDF.
 * @param {import('jspdf').jsPDF} pdf
 * @param {{ timeoutMsg?: string, iframeTitle?: string }} [opts]
 * @returns {Promise<void>}
 */
export function printSistebitPdfDocument(pdf, opts = {}) {
  const timeoutMsg = opts.timeoutMsg ?? 'Tiempo de espera al cargar el documento para imprimir.'
  const iframeTitle = opts.iframeTitle ?? 'Imprimir documento'
  const url = pdf.output('bloburl')

  return new Promise((resolve, reject) => {
    let settled = false

    function terminar(ok, err) {
      if (settled) return
      settled = true
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* ignore */
        }
      }, 60000)
      if (ok) resolve()
      else reject(err instanceof Error ? err : new Error(String(err)))
    }

    const timer = window.setTimeout(() => {
      terminar(false, new Error(timeoutMsg))
    }, 15000)

    const printWin = window.open(url, '_blank', 'noopener,noreferrer')
    if (printWin) {
      let printLanzado = false
      const lanzarPrint = () => {
        if (printLanzado) return
        printLanzado = true
        window.clearTimeout(timer)
        try {
          printWin.focus()
          printWin.print()
          terminar(true)
        } catch (e) {
          terminar(false, e)
        }
      }
      printWin.addEventListener('load', lanzarPrint, { once: true })
      window.setTimeout(lanzarPrint, 900)
      return
    }

    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', iframeTitle)
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:100%;height:100%;border:none;opacity:0;pointer-events:none;'
    document.body.appendChild(iframe)

    function quitarIframe() {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    }

    iframe.onload = () => {
      window.clearTimeout(timer)
      try {
        const win = iframe.contentWindow
        if (!win) throw new Error('No se pudo acceder al visor de impresión.')
        win.focus()
        win.print()
        terminar(true)
        window.setTimeout(quitarIframe, 1500)
      } catch (e) {
        quitarIframe()
        terminar(false, e)
      }
    }

    iframe.onerror = () => {
      window.clearTimeout(timer)
      quitarIframe()
      terminar(false, new Error('No se pudo cargar el PDF.'))
    }

    iframe.src = url
  })
}
