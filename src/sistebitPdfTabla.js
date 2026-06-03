/**
 * Tablas compactas estilo recibo SISTEBIT (jsPDF).
 */
import { TEMA } from './sistebitPdfCommon.js'

export const PDF_MARGIN = 8
export const PDF_GAP = 2.5
export const PDF_FUENTE_TABLA = 7.2
export const PDF_FUENTE_TABLA_HDR = 6.2

function resolveColumnWidths(columns, contentW) {
  let fixed = 0
  let flexCount = 0
  for (const c of columns) {
    if (c.flex) flexCount += 1
    else fixed += Number(c.width ?? 0)
  }
  const flexW = flexCount > 0 ? Math.max(12, (contentW - fixed) / flexCount) : 0
  return columns.map((c) => (c.flex ? flexW : Number(c.width ?? 0)))
}

function cellText(row, col, colIdx) {
  if (typeof col.accessor === 'function') return String(col.accessor(row, colIdx) ?? '—')
  if (col.key != null && row && typeof row === 'object' && !Array.isArray(row)) {
    return String(row[col.key] ?? '—')
  }
  return String(Array.isArray(row) ? (row[colIdx] ?? '—') : '—')
}

function calcRowHeight(pdf, row, columns, widths) {
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(PDF_FUENTE_TABLA)
  let maxLines = 1
  columns.forEach((col, i) => {
    const pad = col.pad ?? 2
    const text = cellText(row, col, i)
    const lines = pdf.splitTextToSize(text, Math.max(4, widths[i] - pad))
    maxLines = Math.max(maxLines, lines.length)
  })
  return Math.max(6.2, maxLines * 3.15 + 2.5)
}

function drawTableHeader(pdf, columns, widths, x, y, contentW) {
  const h = 6.5
  pdf.setFillColor(...TEMA.orden.fill)
  pdf.setDrawColor(...TEMA.orden.border)
  pdf.setLineWidth(0.45)
  pdf.roundedRect(x, y, contentW, h, 1.5, 1.5, 'FD')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(PDF_FUENTE_TABLA_HDR)
  pdf.setTextColor(...TEMA.orden.label)

  let cx = x + 1.5
  const ty = y + 4.3
  columns.forEach((col, i) => {
    pdf.text(String(col.label ?? ''), cx, ty)
    cx += widths[i]
  })
  return h
}

function drawTableRow(pdf, row, columns, widths, x, y, idx, accent) {
  const rowH = calcRowHeight(pdf, row, columns, widths)

  if (accent) pdf.setFillColor(...TEMA.pago.fill)
  else if (idx % 2 === 1) pdf.setFillColor(248, 250, 252)
  else pdf.setFillColor(255, 255, 255)

  pdf.setDrawColor(210, 218, 226)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(x, y, widths.reduce((s, w) => s + w, 0), rowH, 1.2, 1.2, 'FD')

  pdf.setTextColor(26, 32, 44)
  const ty = y + 4.1
  let cx = x + 1.5

  columns.forEach((col, i) => {
    const pad = col.pad ?? 2
    const text = cellText(row, col, i)
    const lines = pdf.splitTextToSize(text, Math.max(4, widths[i] - pad))
    pdf.setFont('helvetica', col.bold ? 'bold' : 'normal')
    pdf.setFontSize(PDF_FUENTE_TABLA)
    const align = col.align ?? 'left'
    if (align === 'right') {
      pdf.text(lines, cx + widths[i] - 1.5, ty, { align: 'right' })
    } else {
      pdf.text(lines, cx, ty)
    }
    cx += widths[i]
  })

  return rowH
}

/**
 * Dibuja tabla compacta con paginación.
 * @returns {number} altura total consumida desde yStart
 */
export function drawTablaCompactaPdf(
  pdf,
  {
    columns,
    rows = [],
    x,
    yStart,
    contentW,
    pageH,
    margin = PDF_MARGIN,
    pageFormat,
    emptyText = 'Sin registros',
    accentRow = null,
  },
) {
  const widths = resolveColumnWidths(columns, contentW)
  let y = yStart
  let totalH = 0

  const addHeader = () => {
    const h = drawTableHeader(pdf, columns, widths, x, y, contentW)
    y += h + 1
    totalH += h + 1
  }

  addHeader()

  if (!rows.length) {
    const h = 8
    pdf.setFillColor(248, 250, 252)
    pdf.setDrawColor(210, 218, 226)
    pdf.roundedRect(x, y, contentW, h, 1.5, 1.5, 'FD')
    pdf.setFont('helvetica', 'italic')
    pdf.setFontSize(PDF_FUENTE_TABLA)
    pdf.setTextColor(120, 130, 140)
    pdf.text(emptyText, x + contentW / 2, y + 5, { align: 'center' })
    return totalH + h
  }

  for (let i = 0; i < rows.length; i++) {
    const rowH = calcRowHeight(pdf, rows[i], columns, widths)
    if (y + rowH > pageH - margin - 4) {
      pdf.addPage(pageFormat, 'p')
      y = margin
      totalH = y - yStart
      addHeader()
    }
    const accent = accentRow ? accentRow(rows[i], i) : false
    const h = drawTableRow(pdf, rows[i], columns, widths, x, y, i, accent)
    y += h + 0.85
    totalH += h + 0.85
  }

  return totalH
}

/** Título de sección azul (p. ej. DETALLE DE MOVIMIENTOS). */
export function drawTituloSeccionPdf(pdf, titulo, x, y) {
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(25, 118, 210)
  pdf.text(String(titulo).toUpperCase(), x, y)
  return y + 5
}

/**
 * Fila de recuadros compactos (wrap automático).
 * @param {Array<{ label: string, value: string, theme: object, minW?: number, maxW?: number }>} campos
 */
export function drawCamposCompactosFila(
  pdf,
  campos,
  drawCampo,
  anchoRecuadroCompacto,
  COMPACT_CAMPO,
  { x, y, width, gap = 3, hMin = 9 },
) {
  let cx = x
  let cy = y
  let rowH = 0
  let maxRowH = 0

  for (const c of campos) {
    const val = String(c.value ?? '—')
    const w = Math.min(
      c.maxW ?? width,
      Math.max(c.minW ?? 22, anchoRecuadroCompacto(pdf, c.label, val, { min: c.minW ?? 22, max: c.maxW ?? 52, pad: 8 })),
    )
    if (cx + w > x + width + 0.1) {
      cy += maxRowH + PDF_GAP
      cx = x
      rowH += maxRowH + PDF_GAP
      maxRowH = 0
    }
    const h = drawCampo(pdf, c.label, val, cx, cy, w, hMin, c.theme, COMPACT_CAMPO)
    maxRowH = Math.max(maxRowH, h)
    cx += w + gap
  }
  rowH += maxRowH
  return rowH
}
