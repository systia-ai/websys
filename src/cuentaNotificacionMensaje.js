/** Monto con símbolo $ (500, 225.50). */
function fmtMonto(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '$0'
  return x % 1 === 0 ? `$${Math.round(x)}` : `$${x.toFixed(2)}`
}

function esAnticipoLinea(linea) {
  const texto = `${linea?.concepto ?? ''} ${linea?.descripcion ?? ''}`
  return /anticipo/i.test(texto)
}

/** Cargos en el mismo orden que la lista de la cuenta; descripción exacta. */
function cargosDesdeLineas(lineas) {
  return (lineas ?? [])
    .filter((l) => l.tipo !== 'pago')
    .map((l) => ({
      descripcion: String(l.descripcion ?? 'Concepto').trim() || 'Concepto',
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

/** concepto $monto + concepto $monto - anticipo $monto */
function buildDesgloseCargos(cargos, anticipo, otrosPagos) {
  let texto = cargos.map((c) => `${c.descripcion} ${fmtMonto(c.monto)}`).join(' + ')
  if (anticipo > 0.0001) {
    texto += `${texto ? ' ' : ''}- anticipo ${fmtMonto(anticipo)}`
  }
  if (otrosPagos > 0.0001) {
    texto += `${texto ? ' ' : ''}- pago ${fmtMonto(otrosPagos)}`
  }
  return texto
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
 * @param {{ nombreCliente?: string, lineas?: object[], saldoPendiente?: number, negocio?: string }} p
 */
export function buildMensajeNotificacionCuentaCliente(p) {
  const nombre = String(p?.nombreCliente ?? '').trim() || 'cliente'
  const empresa = String(p?.negocio ?? EMPRESA_NOTIFICACION).trim() || EMPRESA_NOTIFICACION
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

  if (cargos.length === 0) {
    if (saldo > 0.0001) {
      partes.push(`total a pagar ${fmtMonto(saldo)}`)
    } else {
      partes.push('No hay cargos pendientes registrados en esta cuenta.')
    }
    return partes.join(' ')
  }

  partes.push(buildDesgloseCargos(cargos, anticipo, otrosPagos))
  partes.push(`total a pagar ${fmtMonto(saldo)}`)

  if (partes.length <= 2) {
    return `${partes[0]} ${partes[1]}.`
  }

  return `${partes[0]} ${partes.slice(1).join(', ')}.`
}
