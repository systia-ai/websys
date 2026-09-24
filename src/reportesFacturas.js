import { sameId } from './clienteUtils.js'
import {
  cuentaMarcadaParaFactura,
  folioFacturaDeCuenta,
  totalFacturaDeCuenta,
} from './cuentaFacturaUtils.js'
import { aYmdLocalDesdeRaw } from './reparacionUtils.js'

export const MODOS_REPORTE_FACTURAS = [
  { id: 'rango', label: 'Rango de fechas' },
  { id: 'folio', label: 'Folio fiscal' },
]

export function fechaCuentaFacturaYmd(cuenta) {
  return aYmdLocalDesdeRaw(cuenta?.created_at ?? cuenta?.updated_at ?? cuenta?.fecha_liquidada ?? '')
}

export function nombreClienteDeCuenta(cuenta, clientes = []) {
  const cli = (clientes ?? []).find((c) => sameId(c.id, cuenta?.cliente_id))
  return String(cli?.nombre ?? '').trim()
}

export function importeFacturaDeCuenta(cuenta) {
  const capturado = totalFacturaDeCuenta(cuenta)
  if (capturado != null) return capturado
  const t = Number(cuenta?.total ?? 0)
  return Number.isFinite(t) ? t : 0
}

function textoNorm(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
}

/**
 * Filtra cuentas marcadas para factura según el criterio elegido.
 * @param {'rango'|'folio'} modo
 */
export function filtrarCuentasParaReporteFacturas(cuentas, _clientes, opts = {}) {
  const modo = String(opts.modo ?? 'rango').trim().toLowerCase()
  const ini = String(opts.ini ?? '').slice(0, 10)
  const fin = String(opts.fin ?? '').slice(0, 10)
  const folioQ = textoNorm(opts.folio)
  const lista = (cuentas ?? []).filter((c) => cuentaMarcadaParaFactura(c))

  return lista.filter((cuenta) => {
    if (modo === 'folio') {
      if (!folioQ) return false
      const folio = textoNorm(folioFacturaDeCuenta(cuenta))
      return folio.includes(folioQ)
    }
    const ymd = fechaCuentaFacturaYmd(cuenta)
    if (!ymd) return false
    if (ini && ymd < ini) return false
    if (fin && ymd > fin) return false
    return true
  })
}

export function ordenarCuentasFacturaPorFolio(cuentas = []) {
  return [...(cuentas ?? [])].sort((a, b) => {
    const fa = String(folioFacturaDeCuenta(a) ?? a?._folio ?? '').trim()
    const fb = String(folioFacturaDeCuenta(b) ?? b?._folio ?? '').trim()
    const faVacio = !fa || fa === '—'
    const fbVacio = !fb || fb === '—'
    if (faVacio && fbVacio) return Number(a.id ?? 0) - Number(b.id ?? 0)
    if (faVacio) return 1
    if (fbVacio) return -1
    const cmp = fa.localeCompare(fb, 'es', { numeric: true, sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return Number(a.id ?? 0) - Number(b.id ?? 0)
  })
}

export function validarCriterioReporteFacturas(opts = {}) {
  const modo = String(opts.modo ?? 'rango').trim().toLowerCase()
  if (modo === 'folio') {
    if (!String(opts.folio ?? '').trim()) return 'Escriba el folio fiscal para generar el reporte.'
    return null
  }
  const ini = String(opts.ini ?? '').slice(0, 10)
  const fin = String(opts.fin ?? '').slice(0, 10)
  if (!ini || !fin) return 'Indique el rango de fechas.'
  if (ini > fin) return 'La fecha inicial no puede ser mayor que la final.'
  return null
}

export function etiquetaCriterioReporteFacturas(opts = {}) {
  const modo = String(opts.modo ?? 'rango').trim().toLowerCase()
  if (modo === 'folio') return `Folio fiscal: ${String(opts.folio ?? '').trim() || '—'}`
  const ini = String(opts.ini ?? '').slice(0, 10)
  const fin = String(opts.fin ?? '').slice(0, 10)
  return `Periodo: ${ini || '—'} — ${fin || '—'}`
}

export function resumenTotalesReporteFacturas(cuentas = []) {
  let importe = 0
  for (const c of cuentas) importe += importeFacturaDeCuenta(c)
  return { cantidad: cuentas.length, importe }
}
