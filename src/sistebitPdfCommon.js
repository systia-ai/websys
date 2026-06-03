/** Utilidades compartidas para PDFs SISTEBIT (orden de servicio, recibo de cuenta, etc.). */

/** Tamaño carta (216 × 279 mm), orientación vertical. */
export const SISTEBIT_PDF_FORMAT = 'letter'

/** Media hoja carta: 8.5″ × 5.5″ (216 × 140 mm), formato comprobante. */
export const RECIBO_PDF_FORMAT_MM = [216, 140]

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
  pago: { fill: [232, 245, 233], border: [56, 142, 60], label: [27, 94, 32] },
}

export const COMPACT_CAMPO = { compact: true, valueFontSize: 9 }

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
  return y + 10 * scale
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
