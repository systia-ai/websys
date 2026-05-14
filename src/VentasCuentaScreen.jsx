import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'

const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_CUENTAMOV = 'sistefix_local_cuentamov'
const LS_REP = 'sistefix_local_reparaciones'
const LS_REPARAMOV = 'sistefix_local_reparamov'
const LS_PAGOS = 'sistefix_local_pagosclientes'
const LS_PRODUCTOS = 'sistefix_local_productos'
const LS_CAT = 'sistefix_local_catalogopagos'

let __seq = 1
function nextLocalId() {
  __seq += 1
  return __seq
}

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

function sumSubtotales(lineas) {
  return lineas.reduce((s, L) => s + Number(L.subtotal ?? 0), 0)
}

function buildLineasDesdeServidor({ movs, reps, pagos }) {
  const lineas = []
  for (const m of movs) {
    const cant = Number(m.cantidad ?? 0)
    const costo = Number(m.costo ?? 0)
    lineas.push({
      key: `cuentamov_${m.id}`,
      tipo: 'cuentamov',
      dbId: m.id,
      producto_id: m.producto_id ?? 0,
      cantidad: cant,
      descripcion: `[VENTA] ${m.descripcion ?? 'Sin descripción'}`,
      precioUnitario: costo,
      subtotal: cant * costo,
    })
  }
  for (const r of reps) {
    const cant = Number(r.cantidad ?? 0)
    const costo = Number(r.costo ?? 0)
    lineas.push({
      key: `reparamov_${r.id}`,
      tipo: 'reparamov',
      dbId: r.id,
      producto_id: r.producto_id ?? 0,
      cantidad: cant,
      descripcion: `[REPARACIÓN] ${r.descripcion ?? 'Sin descripción'}`,
      precioUnitario: costo,
      subtotal: cant * costo,
    })
  }
  for (const p of pagos) {
    const monto = Number(p.pago ?? 0)
    lineas.push({
      key: `pago_${p.id}`,
      tipo: 'pago',
      dbId: p.id,
      producto_id: -1,
      cantidad: -1,
      descripcion: `PAGO: ${p.concepto ?? 'Pago'} (${p.forma_pago ?? 'EFECTIVO'})`,
      precioUnitario: monto,
      subtotal: -monto,
    })
  }
  return lineas
}

/**
 * Pantalla Cuentas / Ventas alineada con VentasScreen.kt (lista, total, estatus, pagos, productos, liquidar, comprobante, salir).
 */
export default function VentasCuentaScreen({ supabase, context, onSalir, onError, onNotice }) {
  const cliente = useMemo(() => normalizeClienteRow(context?.cliente ?? {}), [context?.cliente])
  const cuentaInicial = context?.cuenta

  const [loading, setLoading] = useState(true)
  const [cuentaInfo, setCuentaInfo] = useState(null)
  const [reparaIdCuenta, setReparaIdCuenta] = useState(null)
  const [lineas, setLineas] = useState([])
  const [mostrarCamposProducto, setMostrarCamposProducto] = useState(false)
  const [modalPago, setModalPago] = useState(false)
  const [modalProductos, setModalProductos] = useState(false)
  const [catalogo, setCatalogo] = useState([])
  const [busqCat, setBusqCat] = useState('')
  const [selCat, setSelCat] = useState(null)
  const [cantPago, setCantPago] = useState('1')
  const [valorPago, setValorPago] = useState('')
  const [formaPago, setFormaPago] = useState('EFECTIVO')
  const [todosProductos, setTodosProductos] = useState([])
  const [busqProd, setBusqProd] = useState('')
  const [serieProd, setSerieProd] = useState('')
  const [descProd, setDescProd] = useState('')
  const [existencia, setExistencia] = useState('')
  const [cantProd, setCantProd] = useState('')
  const [precioProd, setPrecioProd] = useState('')
  const [productoIdSel, setProductoIdSel] = useState(0)
  const [modalFormaPagoTotal, setModalFormaPagoTotal] = useState(false)
  const [pagandoAdeudoTotal, setPagandoAdeudoTotal] = useState(false)
  const pagandoAdeudoRef = useRef(false)

  const cuentaId = cuentaInfo?.id ?? cuentaInicial?.id ?? null
  const esCuentaExistente = cuentaId != null && Number(cuentaId) > 0
  const cuentaEstatus = String(cuentaInfo?.estatus ?? cuentaInicial?.estatus ?? '')
  const totalVenta = useMemo(() => sumSubtotales(lineas), [lineas])
  const totalStr = totalVenta.toFixed(2)
  const subtotalProdV = useMemo(() => {
    const c = Number(cantProd)
    const p = Number(precioProd)
    if (Number.isFinite(c) && Number.isFinite(p) && c > 0 && p > 0) return (c * p).toFixed(2)
    return ''
  }, [cantProd, precioProd])

  const productosFiltrados = useMemo(() => {
    const t = busqProd.trim().toLowerCase()
    if (!t) return todosProductos
    return todosProductos.filter(
      (p) =>
        String(p.serie ?? '')
          .toLowerCase()
          .includes(t) || String(p.descripcion ?? '').toLowerCase().includes(t),
    )
  }, [todosProductos, busqProd])

  const catFiltrado = useMemo(() => {
    const t = busqCat.trim().toLowerCase()
    if (!t) return catalogo
    return catalogo.filter((c) => String(c.concepto ?? '').toLowerCase().includes(t))
  }, [catalogo, busqCat])

  const cargarTodo = useCallback(
    async (cid, reparaBoot) => {
      setLoading(true)
      try {
        let cuentaRow = null
        if (cid != null) {
          if (supabase) {
            const { data, error } = await supabase.from('cuentas').select('*').eq('id', cid).maybeSingle()
            if (error) throw error
            cuentaRow = data
          } else {
            cuentaRow = readLs(LS_CUENTAS, []).find((c) => sameId(c.id, cid)) ?? null
          }
        }
        setCuentaInfo(cuentaRow)
        const ridRaw = cuentaRow?.repara_id ?? reparaBoot ?? null
        const rid = ridRaw != null && ridRaw !== '' ? ridRaw : null
        setReparaIdCuenta(rid)

        let movs = []
        if (cid != null) {
          if (supabase) {
            const r1 = await supabase.from('cuentamov').select('*').eq('cuenta_id', cid)
            if (!r1.error) movs = r1.data ?? []
          } else {
            movs = readLs(LS_CUENTAMOV, []).filter((m) => sameId(m.cuenta_id, cid))
          }
        }

        let reps = []
        if (rid != null) {
          if (supabase) {
            const r2 = await supabase.from('reparamov').select('*').eq('repara_id', rid)
            if (!r2.error) reps = r2.data ?? []
          } else {
            reps = readLs(LS_REPARAMOV, []).filter((x) => sameId(x.repara_id, rid))
          }
        }

        let pagos = []
        if (cid != null) {
          if (supabase) {
            const r3 = await supabase.from('pagosclientes').select('*').eq('cuenta_id', cid)
            if (!r3.error) pagos = r3.data ?? []
          } else {
            pagos = readLs(LS_PAGOS, []).filter((p) => sameId(p.cuenta_id, cid))
          }
        }

        const built = buildLineasDesdeServidor({ movs, reps, pagos })
        setLineas(built)
      } catch (e) {
        onError?.(`Error al cargar cuenta: ${e.message}`)
        setLineas([])
      } finally {
        setLoading(false)
      }
    },
    [supabase, onError],
  )

  /* Sincronizar líneas con cuenta (Supabase/local); mismo rol que LaunchedEffect en Android. */
  /* eslint-disable react-hooks/set-state-in-effect -- carga asíncrona + reset al cambiar cuenta */
  useEffect(() => {
    const cid = cuentaInicial?.id
    const rb = cuentaInicial?.repara_id
    if (cid != null) {
      void cargarTodo(cid, rb)
    } else {
      setCuentaInfo(null)
      const rbNorm = rb != null && rb !== '' ? rb : null
      setReparaIdCuenta(rbNorm)
      setLineas([])
      setLoading(false)
    }
  }, [cuentaInicial?.id, cuentaInicial?.repara_id, cargarTodo])
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistirTotalCuenta = useCallback(async () => {
    if (cuentaId == null || Number(cuentaId) <= 0) return
    try {
      if (supabase) {
        const { error } = await supabase.from('cuentas').update({ total: totalVenta }).eq('id', cuentaId)
        if (error) throw error
      } else {
        const list = readLs(LS_CUENTAS, [])
        writeLs(
          LS_CUENTAS,
          list.map((c) => (sameId(c.id, cuentaId) ? { ...c, total: totalVenta } : c)),
        )
      }
      setCuentaInfo((prev) => (prev ? { ...prev, total: totalVenta } : prev))
    } catch (e) {
      onError?.(`Error al guardar total: ${e.message}`)
    }
  }, [supabase, cuentaId, totalVenta, onError])

  useEffect(() => {
    if (!esCuentaExistente || loading) return
    const t = setTimeout(() => void persistirTotalCuenta(), 600)
    return () => clearTimeout(t)
  }, [totalVenta, esCuentaExistente, loading, persistirTotalCuenta])

  async function crearCuentaVacia() {
    if (!cliente.id) {
      onError?.('Cliente sin ID válido')
      return
    }
    const row = {
      cliente_id: cliente.id,
      total: 0,
      estatus: 'PENDIENTE',
      tipo_pago: 'EFECTIVO',
      repara_id: null,
    }
    try {
      if (supabase) {
        const { data, error } = await supabase.from('cuentas').insert(row).select('*').single()
        if (error) throw error
        setCuentaInfo(data)
        setReparaIdCuenta(data?.repara_id ?? null)
      } else {
        const nuevo = { id: nextLocalId(), ...row }
        const list = readLs(LS_CUENTAS, [])
        writeLs(LS_CUENTAS, [nuevo, ...list])
        setCuentaInfo(nuevo)
        setReparaIdCuenta(null)
      }
      onNotice?.('Cuenta creada: ya puede agregar pagos o productos')
    } catch (e) {
      onError?.(`Error al crear cuenta: ${e.message}`)
    }
  }

  async function abrirModalPago() {
    if (!cuentaId) {
      onError?.('Cree la cuenta con «Crear cuenta» antes de agregar pagos')
      return
    }
    try {
      if (supabase) {
        const { data, error } = await supabase.from('catalogopagos').select('*')
        if (error) throw error
        setCatalogo(data ?? [])
      } else {
        setCatalogo(readLs(LS_CAT, []))
      }
      setBusqCat('')
      setSelCat(null)
      setModalPago(true)
    } catch (e) {
      onError?.(`Error al cargar catálogo: ${e.message}`)
    }
  }

  function pagarAdeudoTotalCuenta() {
    if (!cuentaId) {
      onError?.('No hay cuenta para liquidar')
      return
    }
    const monto = Number(totalVenta)
    if (!Number.isFinite(monto) || monto <= 0.0001) {
      onError?.('No hay adeudo pendiente en esta cuenta')
      return
    }
    setModalFormaPagoTotal(true)
  }

  async function ejecutarPagoAdeudoTotal(formaPagoElegida) {
    if (pagandoAdeudoRef.current) return
    if (!cuentaId) {
      onError?.('No hay cuenta para liquidar')
      return
    }
    const monto = Number(totalVenta)
    if (!Number.isFinite(monto) || monto <= 0.0001) {
      onError?.('No hay adeudo pendiente en esta cuenta')
      return
    }
    pagandoAdeudoRef.current = true
    setPagandoAdeudoTotal(true)
    const row = {
      cliente_id: cliente.id,
      cuenta_id: cuentaId,
      pago: monto,
      concepto: 'Pago adeudo total',
      forma_pago: formaPagoElegida,
    }
    try {
      let nuevoId
      if (supabase) {
        const { data, error } = await supabase.from('pagosclientes').insert(row).select('*').single()
        if (error) throw error
        nuevoId = data?.id
        const { error: eCu } = await supabase
          .from('cuentas')
          .update({ total: 0, estatus: 'LIQUIDADA' })
          .eq('id', cuentaId)
        if (eCu) throw eCu
        if (reparaIdCuenta != null) {
          await supabase.from('reparaciones').update({ estatus: 'ENTREGADA' }).eq('id', reparaIdCuenta)
        }
      } else {
        nuevoId = nextLocalId()
        const allP = readLs(LS_PAGOS, [])
        writeLs(LS_PAGOS, [{ id: nuevoId, ...row }, ...allP])
        const lc = readLs(LS_CUENTAS, [])
        writeLs(
          LS_CUENTAS,
          lc.map((c) => (sameId(c.id, cuentaId) ? { ...c, total: 0, estatus: 'LIQUIDADA' } : c)),
        )
        if (reparaIdCuenta != null) {
          const lr = readLs(LS_REP, [])
          writeLs(
            LS_REP,
            lr.map((r) => (sameId(r.id, reparaIdCuenta) ? { ...r, estatus: 'ENTREGADA' } : r)),
          )
        }
      }
      setLineas((prev) => [
        ...prev,
        {
          key: `pago_${nuevoId}`,
          tipo: 'pago',
          dbId: nuevoId,
          producto_id: -1,
          cantidad: -1,
          descripcion: `PAGO: ${row.concepto} (${row.forma_pago})`,
          precioUnitario: monto,
          subtotal: -monto,
        },
      ])
      setCuentaInfo((prev) =>
        prev ? { ...prev, total: 0, estatus: 'LIQUIDADA' } : { total: 0, estatus: 'LIQUIDADA' },
      )
      setModalFormaPagoTotal(false)
      setModalPago(false)
      onNotice?.(`Adeudo total liquidado ($${monto.toFixed(2)}) — ${formaPagoElegida}`)
    } catch (e) {
      onError?.(`Error al pagar adeudo total: ${e.message}`)
    } finally {
      pagandoAdeudoRef.current = false
      setPagandoAdeudoTotal(false)
    }
  }

  async function registrarPago() {
    if (!selCat || !cuentaId) {
      onError?.('Seleccione concepto de pago')
      return
    }
    const cant = Number(cantPago)
    const val = Number(valorPago)
    if (!Number.isFinite(cant) || !Number.isFinite(val)) {
      onError?.('Cantidad y valor numéricos requeridos')
      return
    }
    const monto = cant * val
    const row = {
      cliente_id: cliente.id,
      cuenta_id: cuentaId,
      pago: monto,
      concepto: selCat.concepto ?? 'Pago',
      forma_pago: formaPago,
    }
    try {
      let nuevoId
      if (supabase) {
        const { data, error } = await supabase.from('pagosclientes').insert(row).select('*').single()
        if (error) throw error
        nuevoId = data?.id
      } else {
        nuevoId = nextLocalId()
        const all = readLs(LS_PAGOS, [])
        writeLs(LS_PAGOS, [{ id: nuevoId, ...row }, ...all])
      }
      const montoN = Number(monto)
      setLineas((prev) => [
        ...prev,
        {
          key: `pago_${nuevoId}`,
          tipo: 'pago',
          dbId: nuevoId,
          producto_id: -1,
          cantidad: -1,
          descripcion: `PAGO: ${row.concepto} (${row.forma_pago})`,
          precioUnitario: montoN,
          subtotal: -montoN,
        },
      ])
      setModalPago(false)
      onNotice?.('Pago agregado')
    } catch (e) {
      onError?.(`Error al registrar pago: ${e.message}`)
    }
  }

  async function abrirSelectorProductos() {
    if (!cuentaId) {
      onError?.('Cree la cuenta con «Crear cuenta» antes de agregar productos')
      return
    }
    try {
      if (supabase) {
        const { data, error } = await supabase.from('productos').select('*')
        if (error) throw error
        setTodosProductos(data ?? [])
      } else {
        setTodosProductos(readLs(LS_PRODUCTOS, []))
      }
      setBusqProd('')
      setModalProductos(true)
    } catch (e) {
      onError?.(`Error al cargar productos: ${e.message}`)
    }
  }

  function seleccionarProducto(p) {
    setProductoIdSel(Number(p.id) || 0)
    setSerieProd(String(p.serie ?? '').toUpperCase())
    setDescProd(String(p.descripcion ?? '').toUpperCase())
    setExistencia(String(p.existencia ?? ''))
    setPrecioProd(String(p.precio_venta ?? ''))
    setCantProd('')
    setModalProductos(false)
    setMostrarCamposProducto(true)
  }

  async function agregarProductoLinea() {
    if (!serieProd.trim()) {
      onError?.('La serie del producto es requerida')
      return
    }
    if (!descProd.trim()) {
      onError?.('La descripción del producto es requerida')
      return
    }
    if (!productoIdSel) {
      onError?.('Seleccione un producto del catálogo')
      return
    }
    const cant = Number(cantProd)
    const precio = Number(precioProd)
    if (!Number.isFinite(cant) || cant <= 0) {
      onError?.('La cantidad debe ser mayor a 0')
      return
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      onError?.('El precio unitario debe ser mayor a 0')
      return
    }
    const sub = cant * precio
    if (!cuentaId) {
      onError?.('Genere o seleccione una cuenta antes de agregar productos')
      return
    }
    const movRow = {
      cuenta_id: cuentaId,
      producto_id: productoIdSel,
      cantidad: cant,
      descripcion: descProd.trim(),
      costo: precio,
    }
    try {
      let nuevoId
      if (supabase) {
        const { data, error } = await supabase.from('cuentamov').insert(movRow).select('*').single()
        if (error) throw error
        nuevoId = data?.id
      } else {
        nuevoId = nextLocalId()
        const all = readLs(LS_CUENTAMOV, [])
        writeLs(LS_CUENTAMOV, [{ id: nuevoId, ...movRow }, ...all])
      }
      setLineas((prev) => [
        ...prev,
        {
          key: `cuentamov_${nuevoId}`,
          tipo: 'cuentamov',
          dbId: nuevoId,
          producto_id: productoIdSel,
          cantidad: cant,
          descripcion: `[VENTA] ${descProd.trim()}`,
          precioUnitario: precio,
          subtotal: sub,
        },
      ])
      setSerieProd('')
      setDescProd('')
      setExistencia('')
      setCantProd('')
      setPrecioProd('')
      setProductoIdSel(0)
      setMostrarCamposProducto(false)
      onNotice?.('Producto agregado')
    } catch (e) {
      onError?.(`Error al agregar línea: ${e.message}`)
    }
  }

  async function eliminarLinea(L) {
    if (!confirm('¿Eliminar este elemento de la lista?')) return
    try {
      if (L.tipo === 'reparamov' && L.dbId != null) {
        if (supabase) {
          const { error } = await supabase.from('reparamov').delete().eq('id', L.dbId)
          if (error) throw error
        } else {
          writeLs(
            LS_REPARAMOV,
            readLs(LS_REPARAMOV, []).filter((x) => !sameId(x.id, L.dbId)),
          )
        }
      } else if (L.tipo === 'cuentamov' && L.dbId != null) {
        if (supabase) {
          const { error } = await supabase.from('cuentamov').delete().eq('id', L.dbId)
          if (error) throw error
        } else {
          writeLs(
            LS_CUENTAMOV,
            readLs(LS_CUENTAMOV, []).filter((x) => !sameId(x.id, L.dbId)),
          )
        }
      } else if (L.tipo === 'pago' && L.dbId != null) {
        if (supabase) {
          const { error } = await supabase.from('pagosclientes').delete().eq('id', L.dbId)
          if (error) throw error
        } else {
          writeLs(
            LS_PAGOS,
            readLs(LS_PAGOS, []).filter((x) => !sameId(x.id, L.dbId)),
          )
        }
      }
      setLineas((prev) => prev.filter((x) => x.key !== L.key))
      onNotice?.('Eliminado')
    } catch (e) {
      onError?.(`Error al eliminar: ${e.message}`)
    }
  }

  async function liquidarCuenta() {
    if (Math.abs(totalVenta) > 0.0001) {
      onError?.(`No se puede liquidar. El total debe ser $0.00. Total actual: $${totalStr}`)
      return
    }
    if (!cuentaId) return
    try {
      if (supabase) {
        const { error } = await supabase.from('cuentas').update({ estatus: 'LIQUIDADA' }).eq('id', cuentaId)
        if (error) throw error
        if (reparaIdCuenta != null) {
          await supabase.from('reparaciones').update({ estatus: 'ENTREGADA' }).eq('id', reparaIdCuenta)
        }
      } else {
        const list = readLs(LS_CUENTAS, [])
        writeLs(
          LS_CUENTAS,
          list.map((c) => (sameId(c.id, cuentaId) ? { ...c, estatus: 'LIQUIDADA' } : c)),
        )
        if (reparaIdCuenta != null) {
          const lr = readLs(LS_REP, [])
          writeLs(
            LS_REP,
            lr.map((r) => (sameId(r.id, reparaIdCuenta) ? { ...r, estatus: 'ENTREGADA' } : r)),
          )
        }
      }
      setCuentaInfo((prev) => (prev ? { ...prev, estatus: 'LIQUIDADA' } : { estatus: 'LIQUIDADA' }))
      onNotice?.('Cuenta liquidada')
    } catch (e) {
      onError?.(`Error al liquidar: ${e.message}`)
    }
  }

  function enviarComprobante() {
    if (!cliente.telefono?.trim()) {
      onError?.('El teléfono del cliente es requerido para el comprobante')
      return
    }
    const rows = lineas
      .map(
        (L) =>
          `<tr><td>${L.tipo === 'pago' ? -Number(L.cantidad) : Number(L.cantidad)}</td><td>${escapeHtml(L.descripcion)}</td><td>$${Number(L.precioUnitario).toFixed(2)}</td><td>$${Number(L.subtotal).toFixed(2)}</td></tr>`,
      )
      .join('')
    const html = `<h1>Comprobante</h1><p><strong>Cliente:</strong> ${escapeHtml(cliente.nombre)} — ${escapeHtml(cliente.telefono)}</p><p><strong>Total:</strong> $${totalStr} — <strong>Estatus:</strong> ${escapeHtml(cuentaEstatus || '—')}</p><table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><thead><tr><th>Cant</th><th>Descripción</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${rows}</tbody></table>`
    const w = window.open('', '_blank')
    if (!w) {
      onError?.('Permita ventanas emergentes para imprimir.')
      return
    }
    w.document.write(
      `<!DOCTYPE html><html><head><title>Comprobante</title><style>body{font-family:Arial;padding:16px}</style></head><body>${html}<p>Imprima o guarde como PDF y compártalo por WhatsApp.</p></body></html>`,
    )
    w.document.close()
    w.focus()
    w.print()
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  return (
    <div className="ventas-cuenta-root">
      <header className="ventas-cuenta-header">
        <h1>Cuentas</h1>
      </header>

      <div className="ventas-cuenta-body">
        <section className="ventas-cliente-card card-pad">
          <h2 className="ventas-cliente-nombre">{cliente.nombre || 'Cliente'}</h2>
          <p className="muted">Tel: {cliente.telefono || '—'}</p>
          {cliente.domicilio ? <p className="muted small">{cliente.domicilio}</p> : null}
          {cuentaId ? (
            <p className="muted small">
              Cuenta #{cuentaId}
              {reparaIdCuenta != null ? ` · No de Orden: ${reparaIdCuenta}` : ''}
            </p>
          ) : (
            <div className="ventas-nueva-cuenta-row">
              <p className="muted small">Nueva cuenta — cree el registro antes de agregar líneas.</p>
              <button type="button" className="btn-crear-cuenta-ventas" onClick={() => void crearCuentaVacia()}>
                Crear cuenta
              </button>
            </div>
          )}
        </section>

        <section className="ventas-seccion">
          <h3 className="ventas-seccion-titulo">Lista de Productos (Ventas + Reparaciones)</h3>
          {loading ? (
            <p className="center">Cargando…</p>
          ) : (
            <div className="ventas-tabla-wrap">
              <div className="ventas-tabla-head">
                <span>Cant</span>
                <span>Descripción</span>
                <span>Precio</span>
                <span>Subtotal</span>
                <span />
              </div>
              {lineas.length === 0 ? (
                <div className="ventas-tabla-vacia">Los productos agregados aparecerán aquí</div>
              ) : (
                <ul className="ventas-tabla-lista">
                  {lineas.map((L, idx) => {
                    const esPago = L.tipo === 'pago'
                    const cantDisp = esPago ? Math.abs(Number(L.cantidad)) : Number(L.cantidad)
                    return (
                      <li
                        key={L.key}
                        className={`ventas-tabla-fila ${esPago ? 'es-pago' : ''} ${idx % 2 ? 'stripe' : ''}`}
                      >
                        <span>{cantDisp}</span>
                        <span>{L.descripcion}</span>
                        <span>${Number(L.precioUnitario).toFixed(2)}</span>
                        <span>${Number(L.subtotal).toFixed(2)}</span>
                        <button type="button" className="btn-elim-linea" onClick={() => void eliminarLinea(L)} aria-label="Eliminar">
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </section>

        <button type="button" className="btn-agregar-pago-ventas" onClick={() => void abrirModalPago()}>
          💰 AGREGAR PAGO
        </button>

        <button
          type="button"
          className={mostrarCamposProducto ? 'btn-agregar-prod-ventas abierto' : 'btn-agregar-prod-ventas'}
          onClick={() => {
            if (mostrarCamposProducto) setMostrarCamposProducto(false)
            else void abrirSelectorProductos()
          }}
        >
          Agregar Producto/Servicio
        </button>

        {mostrarCamposProducto ? (
          <div className="ventas-form-producto form-stack card-pad">
            <label>
              Serie
              <input value={serieProd} onChange={(e) => setSerieProd(e.target.value.toUpperCase())} />
            </label>
            <label>
              Descripcion
              <input value={descProd} onChange={(e) => setDescProd(e.target.value.toUpperCase())} />
            </label>
            <label>
              Existencia
              <input value={existencia} onChange={(e) => setExistencia(e.target.value)} readOnly />
            </label>
            <label>
              Cantidad
              <input value={cantProd} onChange={(e) => setCantProd(e.target.value)} />
            </label>
            <label>
              Precio Unitario
              <input value={precioProd} onChange={(e) => setPrecioProd(e.target.value)} />
            </label>
            <label>
              Subtotal
              <input value={subtotalProdV} readOnly />
            </label>
            <button type="button" className="btn-primary-ventas" onClick={() => void agregarProductoLinea()}>
              ➕ AGREGAR PRODUCTO
            </button>
          </div>
        ) : null}

        <label className="ventas-total-block">
          <span>Total</span>
          <input value={totalStr} readOnly />
        </label>

        <label className="ventas-total-block">
          <span>Estatus de la Cuenta</span>
          <input value={cuentaEstatus || '—'} readOnly className="readonly-field" />
        </label>

        <div className="ventas-acciones">
          {esCuentaExistente && cuentaEstatus.toUpperCase() !== 'LIQUIDADA' ? (
            <button type="button" className="btn-liquidar-cuenta" onClick={() => void liquidarCuenta()}>
              ✅ LIQUIDAR CUENTA
            </button>
          ) : null}
          <button type="button" className="btn-comprobante-ventas" onClick={enviarComprobante}>
            📧 ENVIAR COMPROBANTE
          </button>
          <button type="button" className="btn-salir-ventas" onClick={onSalir}>
            ❌ SALIR
          </button>
        </div>
      </div>

      {modalPago && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalPago(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Agregar pago</h3>
            </div>
            <div className="modal-body">
              <button
                type="button"
                className="btn-pagar-adeudo-total"
                onClick={pagarAdeudoTotalCuenta}
                disabled={!esCuentaExistente || Math.abs(totalVenta) <= 0.0001 || pagandoAdeudoTotal}
                title={
                  totalVenta > 0.0001
                    ? 'Registrar pago por el saldo total y liquidar la cuenta'
                    : 'No hay adeudo pendiente en esta cuenta'
                }
              >
                <span aria-hidden="true">💵</span>
                <span>
                  Pagar adeudo total
                  {totalVenta > 0.0001 ? <> · <strong>${totalVenta.toFixed(2)}</strong></> : null}
                </span>
              </button>
              <input className="full" placeholder="Buscar concepto…" value={busqCat} onChange={(e) => setBusqCat(e.target.value)} />
              <ul className="cat-pago-list">
                {catFiltrado.map((c) => (
                  <li key={c.id ?? c.concepto}>
                    <button
                      type="button"
                      className={`rep-card ${selCat === c ? 'selected' : ''}`}
                      onClick={() => {
                        setSelCat(c)
                        setValorPago(String(c.cantidad ?? ''))
                      }}
                    >
                      <strong>{c.concepto}</strong>
                      <span>${Number(c.cantidad ?? 0).toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {selCat ? (
                <div className="pago-row">
                  <label>
                    Cantidad
                    <input value={cantPago} onChange={(e) => setCantPago(e.target.value)} />
                  </label>
                  <label>
                    Valor
                    <input value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
                  </label>
                  <label>
                    Forma pago
                    <select value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
                      <option value="EFECTIVO">EFECTIVO</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                      <option value="TARJETA">TARJETA</option>
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModalPago(false)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void registrarPago()} disabled={!selCat}>
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFormaPagoTotal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !pagandoAdeudoTotal && setModalFormaPagoTotal(false)}
        >
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💵 ¿Cómo se realizará el pago?</h3>
              <p className="muted small" style={{ margin: '4px 0 0' }}>
                Selecciona la forma de pago para liquidar el adeudo total de{' '}
                <strong>${Number(totalVenta).toFixed(2)}</strong>.
              </p>
            </div>
            <div className="modal-body forma-pago-opciones">
              <button
                type="button"
                className="btn-forma-pago"
                onClick={() => void ejecutarPagoAdeudoTotal('EFECTIVO')}
                disabled={pagandoAdeudoTotal}
              >
                <span aria-hidden="true">💵</span>
                <span>Efectivo</span>
              </button>
              <button
                type="button"
                className="btn-forma-pago"
                onClick={() => void ejecutarPagoAdeudoTotal('TRANSFERENCIA')}
                disabled={pagandoAdeudoTotal}
              >
                <span aria-hidden="true">🏦</span>
                <span>Transferencia</span>
              </button>
              <button
                type="button"
                className="btn-forma-pago"
                onClick={() => void ejecutarPagoAdeudoTotal('TARJETA')}
                disabled={pagandoAdeudoTotal}
              >
                <span aria-hidden="true">💳</span>
                <span>Tarjeta de crédito o débito</span>
              </button>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setModalFormaPagoTotal(false)}
                disabled={pagandoAdeudoTotal}
              >
                Cancelar
              </button>
              {pagandoAdeudoTotal ? (
                <span className="muted small">Procesando pago…</span>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {modalProductos && (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalProductos(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Seleccionar Producto</h3>
            </div>
            <div className="modal-body">
              <input
                className="full"
                placeholder="Buscar por serie o descripción…"
                value={busqProd}
                onChange={(e) => setBusqProd(e.target.value)}
              />
              <ul className="orden-resultados-list">
                {productosFiltrados.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="orden-resultado-card" onClick={() => seleccionarProducto(p)}>
                      <strong>{p.serie}</strong>
                      <span className="muted small">{p.descripcion}</span>
                      <span className="muted small">Existencia: {p.existencia ?? '—'}</span>
                      <span className="muted small">${Number(p.precio_venta ?? 0).toFixed(2)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModalProductos(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
