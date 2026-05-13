import { jsPDF } from 'jspdf'

/** 2 in × 1 in (51 × 25 mm), orientación horizontal tipo etiqueta adhesiva. */
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
 * PDF de etiqueta (mismo aspecto que referencia física): borde negro, nombre a la izquierda en mayúsculas,
 * bloque derecho con “Orden” + número y QR debajo.
 *
 * @param {{ nombre: string, orden: string|number, qrDataUrl: string }} p
 * @returns {object}
 */
export function createEtiquetaPdf(p) {
  const { nombre, orden, qrDataUrl } = p
  const ordStr = String(orden ?? '—')
  const lineasNombre = splitNombreLineas(nombre)

  const pdf = new jsPDF({
    unit: 'mm',
    format: [ETIQUETA_MM_W, ETIQUETA_MM_H],
    orientation: 'landscape',
    compress: true,
  })

  const W = pdf.internal.pageSize.getWidth()
  const H = pdf.internal.pageSize.getHeight()

  /** Marco negro respecto al borde físico de la hoja. */
  const frameM = 0.7
  /** Aire interior entre el trazo del marco y el texto/QR (evita que choque con el borde). */
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
  /** Margen derecho explícito para “Orden” y el QR. */
  const rightInnerRight = contentX + contentW - 0.55
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

  const ordY = contentY + ascenderMm * 0.55 + 1.95
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(5.8)
  const pref = 'Orden '
  const wPref = pdf.getTextWidth(pref)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.2)
  const wNum = pdf.getTextWidth(ordStr)
  const blockW = wPref + wNum
  const xOrd = rightInnerRight - blockW
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(5.8)
  pdf.text(pref, xOrd, ordY)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9.2)
  pdf.text(ordStr, xOrd + wPref, ordY)

  let qrSize = Math.min(14.8, rightInnerRight - rightColLeft - 0.45, contentH - 5.8)
  const qrY = ordY + 2.15
  if (qrY + qrSize > contentY + contentH - 0.55) {
    qrSize = Math.max(8, contentY + contentH - 0.55 - qrY)
  }
  const qrX = rightInnerRight - qrSize
  try {
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize, undefined, 'FAST')
  } catch {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(5)
    pdf.text('QR', qrX + qrSize * 0.35, qrY + qrSize * 0.55)
  }

  return pdf
}

/**
 * Genera y descarga el PDF de la etiqueta.
 * @param {{ nombre: string, orden: string|number, qrDataUrl: string }} p
 */
export function downloadEtiquetaPdf(p) {
  const pdf = createEtiquetaPdf(p)
  pdf.save(buildEtiquetaPdfFilename(p.orden))
}
