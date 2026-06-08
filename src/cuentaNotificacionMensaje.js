import { claveCanonicaTipoServicio } from './reparacionUtils.js'

function limpiarPrefijoDescripcion(texto) {
  return (
    String(texto ?? '')
      .trim()
      .replace(/^\[(VENTA|REPARACIÓN|REPARACION|CUENTA)\]\s*/i, '')
      .trim() || 'Concepto'
  )
}


/** Monto sin símbolo $ para el desglose compacto (500, 225.50). */
function fmtNumeroCompacto(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '0'
  return x % 1 === 0 ? String(Math.round(x)) : x.toFixed(2)
}

function esAnticipoLinea(linea) {
  const texto = `${linea?.concepto ?? ''} ${linea?.descripcion ?? ''}`
  return /anticipo/i.test(texto)
}

function cargosDesdeLineas(lineas) {
  return (lineas ?? [])
    .filter((l) => l.tipo !== 'pago')
    .map((l) => ({
      tipo: l.tipo,
      descripcion: limpiarPrefijoDescripcion(l.descripcion),
      monto: Number(l.subtotal ?? 0),
    }))
    .filter((c) => c.monto > 0.0001)
}

function sumAnticipos(lineas) {
  return (lineas ?? [])
    .filter((l) => l.tipo === 'pago' && esAnticipoLinea(l))
    .reduce((s, l) => s + Math.abs(Number(l.subtotal ?? l.precioUnitario ?? 0)), 0)
}

function sumOtrosPagos(lineas) {
  return (lineas ?? [])
    .filter((l) => l.tipo === 'pago' && !esAnticipoLinea(l))
    .reduce((s, l) => s + Math.abs(Number(l.subtotal ?? l.precioUnitario ?? 0)), 0)
}

function necesitaDesgloseDetallado(principal, adicionales, anticipo, otrosPagos) {
  return (
    anticipo > 0.0001 ||
    otrosPagos > 0.0001 ||
    adicionales.length > 0
  )
}

function etiquetaTipoServicioMensaje(tipoCanon) {
  if (tipoCanon === 'SERVICIO') return 'SERVICIO'
  if (tipoCanon === 'GARANTIA EPSON') return 'GARANTÍA EPSON'
  if (tipoCanon === 'GARANTIA SISTEBIT') return 'GARANTÍA SISTEBIT'
  return null
}

function fraseTipoAtencion(tipoCanon) {
  const label = etiquetaTipoServicioMensaje(tipoCanon)
  return label ? `Tipo de atención: ${label}` : null
}

function etiquetaCargoCorto(cargo, tipoCanon) {
  const tipo = etiquetaTipoServicioMensaje(tipoCanon)
  if (tipo === 'SERVICIO') return 'servicio'
  if (tipo === 'GARANTÍA EPSON') return 'garantía EPSON'
  if (tipo === 'GARANTÍA SISTEBIT') return 'garantía SISTEBIT'
  const d = cargo.descripcion.trim()
  if (/servicio|reparaci/i.test(d)) return 'servicio'
  return d.toLowerCase()
}

/** Desglose compacto: servicio 500 - 200 anticipo + 225 tinta amarilla */
function buildDesgloseCompacto(principal, adicionales, anticipo, otrosPagos, tipoCanon) {
  const segmentos = [`${etiquetaCargoCorto(principal, tipoCanon)} ${fmtNumeroCompacto(principal.monto)}`]
  if (anticipo > 0.0001) {
    segmentos.push(`- ${fmtNumeroCompacto(anticipo)} anticipo`)
  }
  for (const cargo of adicionales) {
    segmentos.push(`+ ${fmtNumeroCompacto(cargo.monto)} ${cargo.descripcion.trim().toLowerCase()}`)
  }
  if (otrosPagos > 0.0001) {
    segmentos.push(`- ${fmtNumeroCompacto(otrosPagos)} pago`)
  }
  return segmentos.join(' ')
}

const EMPRESA_NOTIFICACION = 'SISTEBIT'

function saludoNotificacionCliente(nombre, empresa = EMPRESA_NOTIFICACION) {
  const variantes = [
    (n, e) =>
      `Hola buen día ${n}, me comunico de ${e} y le informamos que su equipo ya está listo para ser entregado!`,
    (n, e) =>
      `Hola buen día ${n}, de parte de ${e} le comunico que su equipo ya está listo para ser entregado!`,
  ]
  const idx = Math.floor(Math.random() * variantes.length)
  return variantes[idx](nombre, empresa)
}

/**
 * Redacta mensaje de cobro / entrega para el cliente según líneas de la cuenta.
 *
 * @param {{ nombreCliente?: string, lineas?: object[], saldoPendiente?: number, negocio?: string, tipoServicio?: string, tipoReparacion?: string }} p
 */
export function buildMensajeNotificacionCuentaCliente(p) {
  const nombre = String(p?.nombreCliente ?? '').trim() || 'cliente'
  const empresa = String(p?.negocio ?? EMPRESA_NOTIFICACION).trim() || EMPRESA_NOTIFICACION
  const tipoCanon = claveCanonicaTipoServicio(p?.tipoServicio ?? p?.tipoReparacion)
  const lineas = p?.lineas ?? []
  const cargos = cargosDesdeLineas(lineas)
  const anticipo = sumAnticipos(lineas)
  const otrosPagos = sumOtrosPagos(lineas)
  const saldo =
    p?.saldoPendiente != null
      ? Math.max(0, Number(p.saldoPendiente))
      : Math.max(
          0,
          cargos.reduce((s, c) => s + c.monto, 0) -
            (lineas ?? [])
              .filter((l) => l.tipo === 'pago')
              .reduce((s, l) => s + Math.abs(Number(l.subtotal ?? 0)), 0),
        )

  const partes = [saludoNotificacionCliente(nombre, empresa)]
  const tipoAtencion = fraseTipoAtencion(tipoCanon)
  if (tipoAtencion) partes.push(tipoAtencion)

  if (cargos.length === 0) {
    if (saldo > 0.0001) {
      partes.push(`total a pagar ${fmtNumeroCompacto(saldo)}`)
    } else {
      partes.push('No hay cargos pendientes registrados en esta cuenta.')
    }
    return partes.join(' ')
  }

  const idxPrincipal = cargos.findIndex((c) => c.tipo === 'reparamov' || c.tipo === 'reparacion_cargo')
  const principal = idxPrincipal >= 0 ? cargos[idxPrincipal] : cargos[0]
  const adicionales =
    idxPrincipal >= 0
      ? [...cargos.slice(0, idxPrincipal), ...cargos.slice(idxPrincipal + 1)]
      : cargos.slice(1)

  if (necesitaDesgloseDetallado(principal, adicionales, anticipo, otrosPagos)) {
    partes.push(buildDesgloseCompacto(principal, adicionales, anticipo, otrosPagos, tipoCanon))
  }

  partes.push(`total a pagar ${fmtNumeroCompacto(saldo)}`)

  if (partes.length <= 2) {
    return `${partes[0]} ${partes[1]}.`
  }

  return `${partes[0]} ${partes.slice(1).join(', ')}.`
}
