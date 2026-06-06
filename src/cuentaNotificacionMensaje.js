function limpiarPrefijoDescripcion(texto) {
  return (
    String(texto ?? '')
      .trim()
      .replace(/^\[(VENTA|REPARACIÓN|REPARACION|CUENTA)\]\s*/i, '')
      .trim() || 'Concepto'
  )
}

function fmtMonto(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return '$0'
  return x % 1 === 0 ? `$${x.toFixed(0)}` : `$${x.toFixed(2)}`
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

function etiquetaCargoPrincipal(cargo) {
  const d = cargo.descripcion
  if (/servicio|reparaci/i.test(d)) return 'un servicio'
  if (cargo.tipo === 'reparacion_cargo' || cargo.tipo === 'reparamov') {
    return d || 'un servicio'
  }
  return d || 'un cargo'
}

function fraseAdicional(desc) {
  const d = desc.trim()
  const low = d.toLowerCase()
  if (/^almohadilla/i.test(d)) return `se le cambiaron las ${low}`
  if (/^(cambio|cambió)/i.test(d)) return `se le ${low}`
  if (/^(refacci|filtro|bater|tinta|cartucho|rodillo)/i.test(d)) return `se le cambiaron ${low}`
  return low
}

/**
 * Redacta mensaje de cobro / entrega para el cliente según líneas de la cuenta.
 *
 * @param {{ nombreCliente?: string, lineas?: object[], saldoPendiente?: number }} p
 */
export function buildMensajeNotificacionCuentaCliente(p) {
  const nombre = String(p?.nombreCliente ?? '').trim() || 'cliente'
  const lineas = p?.lineas ?? []
  const cargos = cargosDesdeLineas(lineas)
  const anticipo = sumAnticipos(lineas)
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

  const partes = [
    `Hola buen día ${nombre}, le informamos que su equipo ya está listo para ser entregado!`,
  ]

  if (cargos.length === 0) {
    if (saldo > 0.0001) {
      partes.push(`Su total a pagar sería de ${fmtMonto(saldo)}`)
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

  let frasePrincipal = `Se le realizó ${etiquetaCargoPrincipal(principal)} con costo de ${fmtMonto(principal.monto)}`
  if (anticipo > 0.0001) {
    const neto = Math.max(0, principal.monto - anticipo)
    frasePrincipal += `, menos anticipo de ${fmtMonto(anticipo)} sería ${fmtMonto(neto)}`
  }
  partes.push(frasePrincipal)

  for (const cargo of adicionales) {
    partes.push(`adicionalmente ${fraseAdicional(cargo.descripcion)} con costo de ${fmtMonto(cargo.monto)}`)
  }

  partes.push(`su total a pagar sería de ${fmtMonto(saldo)}`)

  if (partes.length <= 2) {
    return `${partes[0]} ${partes[1]}.`
  }

  return `${partes[0]} ${partes.slice(1).join(', ')}.`
}
