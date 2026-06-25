import { printReciboCuentaPdf } from './reciboCuentaPdf.js'
import { lineasCotizacionParaReciboPdf } from './cotizacionUtils.js'

/** Imprime cotización con el mismo formato Sistebit que los recibos de cuenta. */
export async function printCotizacionPdf({
  cliente,
  cotizacionId,
  lineas,
  total,
  notas = null,
}) {
  const subtituloParts = []
  if (cotizacionId != null) subtituloParts.push(`No. ${cotizacionId}`)
  if (notas?.trim()) subtituloParts.push(String(notas).trim())

  return printReciboCuentaPdf({
    cliente: { nombre: cliente?.nombre, telefono: cliente?.telefono },
    orden: null,
    descripcionEquipo: null,
    total,
    saldo: 0,
    estatus: 'COTIZACIÓN',
    lineas: lineasCotizacionParaReciboPdf(lineas),
    tituloDocumento: 'COTIZACIÓN',
    subtitulo: subtituloParts.length ? subtituloParts.join(' · ') : null,
    labelTotal: 'Total cotización',
    ocultarSaldo: true,
  })
}
