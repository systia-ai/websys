import { sameId } from './clienteUtils.js'
import { esProductoContable } from './productoUtils.js'

export const LS_PRODUCTOS = 'sistefix_local_productos'
const LS_CUENTAMOV = 'sistefix_local_cuentamov'

function readLs(key, fb) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fb))
  } catch {
    return fb
  }
}

function writeLs(key, v) {
  localStorage.setItem(key, JSON.stringify(v))
}

function parseCantidad(cantidad) {
  const cant = Number(cantidad)
  if (!Number.isFinite(cant) || cant <= 0) {
    throw new Error('La cantidad debe ser mayor a 0')
  }
  return cant
}

async function leerProducto(supabase, productoId) {
  if (supabase) {
    const { data, error } = await supabase.from('productos').select('*').eq('id', productoId).single()
    if (error) throw error
    return data
  }
  const list = readLs(LS_PRODUCTOS, [])
  const p = list.find((x) => sameId(x.id, productoId))
  if (!p) throw new Error('Producto no encontrado en inventario')
  return p
}

/** Lee existencia actual del producto (Supabase o localStorage). */
export async function leerExistencia(supabase, productoId) {
  if (supabase) {
    const { data, error } = await supabase.from('productos').select('existencia').eq('id', productoId).single()
    if (error) throw error
    return Number(data?.existencia ?? 0)
  }
  const list = readLs(LS_PRODUCTOS, [])
  const p = list.find((x) => sameId(x.id, productoId))
  if (!p) throw new Error('Producto no encontrado en inventario')
  return Number(p.existencia ?? 0)
}

/** Resta unidades de `existencia` en inventario (no hace nada si el producto no es contable). */
export async function descontarExistencia(supabase, productoId, cantidad) {
  const cant = parseCantidad(cantidad)
  const producto = await leerProducto(supabase, productoId)
  if (!esProductoContable(producto)) return null

  if (supabase) {
    const actual = await leerExistencia(supabase, productoId)
    if (actual < cant) {
      throw new Error(`Stock insuficiente. Disponible: ${actual}`)
    }
    const nueva = actual - cant
    const { error } = await supabase.from('productos').update({ existencia: nueva }).eq('id', productoId)
    if (error) throw error
    return nueva
  }
  const list = readLs(LS_PRODUCTOS, [])
  const idx = list.findIndex((x) => sameId(x.id, productoId))
  if (idx < 0) throw new Error('Producto no encontrado en inventario')
  const actual = Number(list[idx].existencia ?? 0)
  if (actual < cant) {
    throw new Error(`Stock insuficiente. Disponible: ${actual}`)
  }
  const nueva = actual - cant
  list[idx] = { ...list[idx], existencia: nueva }
  writeLs(LS_PRODUCTOS, list)
  return nueva
}

/** Devuelve unidades a inventario (al eliminar una venta de la cuenta). */
export async function reponerExistencia(supabase, productoId, cantidad) {
  const cant = parseCantidad(cantidad)
  if (!productoId || Number(productoId) <= 0) return null

  const producto = await leerProducto(supabase, productoId)
  if (!esProductoContable(producto)) return null

  if (supabase) {
    const actual = await leerExistencia(supabase, productoId)
    const nueva = actual + cant
    const { error } = await supabase.from('productos').update({ existencia: nueva }).eq('id', productoId)
    if (error) throw error
    return nueva
  }
  const list = readLs(LS_PRODUCTOS, [])
  const idx = list.findIndex((x) => sameId(x.id, productoId))
  if (idx < 0) throw new Error('Producto no encontrado en inventario')
  const actual = Number(list[idx].existencia ?? 0)
  const nueva = actual + cant
  list[idx] = { ...list[idx], existencia: nueva }
  writeLs(LS_PRODUCTOS, list)
  return nueva
}

/**
 * Registra venta en cuentamov y descuenta existencia.
 * Si falla el movimiento, revierte el descuento de stock.
 */
export async function registrarVentaEnCuenta({
  supabase,
  cuentaId,
  productoId,
  descripcion,
  cantidad,
  precio,
  nextLocalId,
}) {
  const cant = parseCantidad(cantidad)
  const precioN = Number(precio)
  if (!Number.isFinite(precioN) || precioN <= 0) {
    throw new Error('El precio unitario debe ser mayor a 0')
  }
  if (!cuentaId) {
    throw new Error('Seleccione o cree una cuenta del cliente')
  }
  if (!productoId) {
    throw new Error('Producto inválido')
  }

  const producto = await leerProducto(supabase, productoId)
  const contable = esProductoContable(producto)
  if (contable) {
    await descontarExistencia(supabase, productoId, cant)
  }

  const movRow = {
    cuenta_id: cuentaId,
    producto_id: productoId,
    cantidad: cant,
    descripcion: String(descripcion ?? '').trim(),
    costo: precioN,
  }

  try {
    if (supabase) {
      const { data, error } = await supabase.from('cuentamov').insert(movRow).select('*').single()
      if (error) throw error
      return { movId: data?.id, movRow: data, contable }
    }
    if (typeof nextLocalId !== 'function') {
      throw new Error('nextLocalId requerido en modo local')
    }
    const nuevoId = nextLocalId()
    const all = readLs(LS_CUENTAMOV, [])
    writeLs(LS_CUENTAMOV, [{ id: nuevoId, ...movRow }, ...all])
    return { movId: nuevoId, movRow: { id: nuevoId, ...movRow }, contable }
  } catch (e) {
    if (contable) {
      await reponerExistencia(supabase, productoId, cant)
    }
    throw e
  }
}
