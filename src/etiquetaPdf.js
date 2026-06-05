import { jsPDF } from 'jspdf'

/** Etiqueta adhesiva 2 in (ancho) × 1 in (alto). */
export const ETIQUETA_IN_W = 2
export const ETIQUETA_IN_H = 1
/** Mismas medidas en mm que antes (51 × 25). */
export const ETIQUETA_MM_W = 51
export const ETIQUETA_MM_H = 25

export function buildEtiquetaPdfFilename(orden) {
  const safe = String(orden ?? 'orden').replace(/[^\w.-]+/g, '_')
  return `etiqueta-orden-${safe}.pdf`
}

function splitNombreLineas(nombreRaw) {
  const t = String(nombreRaw ?? '').trim() || '—'
  const words = t.toUpperCase().split(/\s+/).filter(Boolean)
  return words.length ? words : ['—']
}

function wrapLineasPorAncho(pdf, lines, maxW) {
  const out = []
  for (const line of lines) {
    if (pdf.getTextWidth(line) <= maxW) {
      out.push(line)
      continue
    }
    let rest = line
    while (rest.length) {
      let cut = rest.length
      while (cut > 1 && pdf.getTextWidth(rest.slice(0, cut)) > maxW) cut -= 1
      out.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
  }
  return out.length ? out : ['—']
}

/**
 * PDF de etiqueta: borde negro, nombre a la izquierda en mayúsculas, número de orden en recuadro a la derecha.
 *
 * @param {{ nombre: string, orden: string|number }} p
 * @returns {object}
 */
export function createEtiquetaPdf(p) {
  const { nombre, orden } = p
  const ordStr = String(orden ?? '—')
  const lineasNombre = splitNombreLineas(nombre)

  const pdf = new jsPDF({
    unit: 'mm',
    format: [ETIQUETA_MM_W, ETIQUETA_MM_H],
    /** jsPDF: landscape deja 51×25 mm (2″×1″ ancho); portrait lo voltea a vertical. */
    orientation: 'landscape',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()

  /** Marco negro respecto al borde físico de la hoja. */
  const frameM = 0.7
  /** Aire interior entre el trazo del marco y el texto (evita que choque con el borde). */
  const insidePad = 2.15

  const contentX = frameM + insidePad
  const contentY = frameM + insidePad
  const contentW = W - 2 * (frameM + insidePad)
  const contentH = H - 2 * (frameM + insidePad)

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.2)
  const rr = 0.65
  pdf.roundedRect(frameM, frameM, W - 2 * frameM, H - 2 * frameM, rr, rr, 'S')

  const gapCol = 0.85
  const leftColW = contentW * 0.54
  const rightColLeft = contentX + leftColW + gapCol
  const rightColW = contentX + contentW - rightColLeft - 0.55
  const nameLeft = contentX + 0.45
  const maxNameW = leftColW - 0.95

  let fontPt = 10.5
  let lineMm = 1
  let lineas = lineasNombre
  while (fontPt >= 4.8) {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(fontPt)
    lineMm = fontPt * 0.352778 * 1.14
    lineas = wrapLineasPorAncho(pdf, lineasNombre, maxNameW)
    const altura = lineas.length * lineMm
    const cabe = lineas.every((ln) => pdf.getTextWidth(ln) <= maxNameW + 0.01)
    if (cabe && altura <= contentH - 2.4) break
    fontPt -= 0.45
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(fontPt)
  pdf.setTextColor(0, 0, 0)
  /** jsPDF usa Y en baseline: reservar altura de ascendentes (MAYÚSCULAS) para no pegar arriba. */
  const ascenderMm = fontPt * 0.352778 * 0.92
  let yNombre = contentY + ascenderMm + 0.35
  for (const ln of lineas) {
    pdf.text(ln, nameLeft, yNombre)
    yNombre += lineMm
  }

  const boxPad = 0.55
  const boxW = rightColW
  const boxH = Math.min(contentH - 0.5, boxW * 0.92)
  const boxX = rightColLeft
  const boxY = contentY + (contentH - boxH) / 2

  pdf.setDrawColor(0, 0, 0)
  pdf.setLineWidth(0.35)
  pdf.roundedRect(boxX, boxY, boxW, boxH, 1.1, 1.1, 'S')

  const maxNumW = boxW - boxPad * 2
  const labelOrd = 'ORD.'
  const labelPt = 8.2
  const gapLabelNum = 0.65

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(labelPt)
  const labelLineMm = labelPt * 0.352778 * 1.08
  const labelBlockH = labelLineMm + gapLabelNum

  let numPt = 17
  while (numPt >= 10) {
    pdf.setFontSize(numPt)
    const numLineMm = numPt * 0.352778 * 1.05
    const blockH = labelBlockH + numLineMm
    const fitsW = pdf.getTextWidth(ordStr) <= maxNumW
    const fitsH = blockH <= boxH - boxPad * 2
    if (fitsW && fitsH) break
    numPt -= 0.8
  }

  pdf.setFontSize(numPt)
  const numLineMm = numPt * 0.352778 * 1.05
  const blockH = labelBlockH + numLineMm
  const yLabel = boxY + (boxH - blockH) / 2 + labelLineMm
  const yNum = yLabel + gapLabelNum + numLineMm * 0.9
  const cx = boxX + boxW / 2

  pdf.setTextColor(0, 0, 0)
  pdf.setFontSize(labelPt)
  pdf.text(labelOrd, cx, yLabel, { align: 'center' })
  pdf.setFontSize(numPt)
  pdf.text(ordStr, cx, yNum, { align: 'center' })

  return pdf
}

/**
 * Genera y descarga el PDF de la etiqueta.
 * @param {{ nombre: string, orden: string|number }} p
 */
export function downloadEtiquetaPdf(p) {
  const pdf = createEtiquetaPdf(p)
  pdf.save(buildEtiquetaPdfFilename(p.orden))
}

/**
 * Abre el diálogo de impresión con el PDF a tamaño real de etiqueta (2×1 in / 51×25 mm).
 * @param {{ nombre: string, orden: string|number }} p
 * @returns {Promise<void>}
 */
export function printEtiquetaPdf(p) {
  const pdf = createEtiquetaPdf(p)
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
      terminar(false, new Error('Tiempo de espera al cargar la etiqueta para imprimir.'))
    }, 15000)

    /** Ventana con visor PDF: respeta el tamaño de página 51×25 mm como al descargar. */
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

    /** Respaldo: iframe con tamaño físico de etiqueta (no 0×0, que escala mal). */
    const iframe = document.createElement('iframe')
    iframe.setAttribute('title', 'Imprimir etiqueta')
    iframe.style.cssText = `position:fixed;left:0;top:0;width:${ETIQUETA_MM_W}mm;height:${ETIQUETA_MM_H}mm;border:none;opacity:0;pointer-events:none;`
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
      terminar(false, new Error('No se pudo cargar el PDF de la etiqueta.'))
    }

    iframe.src = url
  })
}
