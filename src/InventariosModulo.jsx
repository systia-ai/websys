/* eslint-disable react-hooks/set-state-in-effect -- carga inicial de productos (Supabase/local) */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { registrarVentaEnCuenta } from './inventarioStock.js'
import {
  EMOJIS_ELEGIR,
  emojiParaProducto,
  guardarIconoProducto,
  readIconosMap,
  sugerirEmojiPorTexto,
} from './productoEmoji.js'

const LS_PRODUCTOS = 'sistefix_local_productos'
const LS_CLIENTES = 'sistefix_local_clientes'
const LS_CUENTAS = 'sistefix_local_cuentas'

let __movSeq = 1
function nextLocalMovId() {
  __movSeq += 1
  return __movSeq
}

function nextLocalCuentaId(list) {
  const max = list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0)
  return max + 1
}

function readLs(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function writeLs(key, val) {
  localStorage.setItem(key, JSON.stringify(val))
}

function nextLocalProductId(list) {
  const max = list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0)
  return max + 1
}

function toNum(v) {
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function toIntOrNull(v) {
  const n = parseInt(String(v).trim(), 10)
  return Number.isFinite(n) ? n : null
}

/**
 * Inventarios / catálogo de productos (tabla `productos`), flujo tipo pantalla dedicada en Android:
 * lista con búsqueda, alta, edición y baja.
 */
export default function InventariosModulo({ supabase, onHome, onError, onNotice }) {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const [dialogo, setDialogo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [serie, setSerie] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [existencia, setExistencia] = useState('')
  const [precioCompra, setPrecioCompra] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')

  const [eliminar, setEliminar] = useState(null)

  const [venderProducto, setVenderProducto] = useState(null)
  const [clientesVenta, setClientesVenta] = useState([])
  const [busqClienteVenta, setBusqClienteVenta] = useState('')
  const [clienteVentaSel, setClienteVentaSel] = useState(null)
  const [cuentasCliente, setCuentasCliente] = useState([])
  const [cuentaVentaId, setCuentaVentaId] = useState('')
  const [cantVenta, setCantVenta] = useState('1')
  const [precioUnitVenta, setPrecioUnitVenta] = useState('')
  const [vendiendo, setVendiendo] = useState(false)
  const [iconosMap, setIconosMap] = useState(() => readIconosMap())
  const [emojiSel, setEmojiSel] = useState('📦')
  const [emojiManual, setEmojiManual] = useState(false)
  const [menuIconoAbierto, setMenuIconoAbierto] = useState(false)

  const cargarProductos = useCallback(async () => {
    setLoading(true)
    try {
      if (supabase) {
        const { data, error } = await supabase.from('productos').select('*').order('id', { ascending: false })
        if (error) throw error
        setProductos(data ?? [])
      } else {
        setProductos(readLs(LS_PRODUCTOS, []))
      }
    } catch (e) {
      onError?.(`Error al cargar inventario: ${e.message}`)
      setProductos([])
    } finally {
      setIconosMap(readIconosMap())
      setLoading(false)
    }
  }, [supabase, onError])

  useEffect(() => {
    void cargarProductos()
  }, [cargarProductos])

  const filtrados = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    if (!t) return productos
    return productos.filter((p) => {
      const s = String(p.serie ?? '').toLowerCase()
      const d = String(p.descripcion ?? '').toLowerCase()
      return s.includes(t) || d.includes(t)
    })
  }, [productos, busqueda])

  function abrirNuevo() {
    setEditando(null)
    setSerie('')
    setDescripcion('')
    setCantidad('')
    setExistencia('')
    setPrecioCompra('')
    setPrecioVenta('')
    setEmojiSel('📦')
    setEmojiManual(false)
    setMenuIconoAbierto(false)
    setDialogo(true)
  }

  function abrirEditar(p) {
    setEditando(p)
    setSerie(String(p.serie ?? '').toUpperCase())
    setDescripcion(String(p.descripcion ?? '').toUpperCase())
    setCantidad(p.cantidad != null && p.cantidad !== '' ? String(p.cantidad) : '')
    setExistencia(p.existencia != null && p.existencia !== '' ? String(p.existencia) : '')
    setPrecioCompra(p.precio_compra != null && p.precio_compra !== '' ? String(p.precio_compra) : '')
    setPrecioVenta(p.precio_venta != null && p.precio_venta !== '' ? String(p.precio_venta) : '')
    setEmojiSel(emojiParaProducto(p, iconosMap))
    setEmojiManual(false)
    setMenuIconoAbierto(false)
    setDialogo(true)
  }

  function onDescripcionChange(val) {
    setDescripcion(val)
    if (!emojiManual) {
      setEmojiSel(sugerirEmojiPorTexto(serie, val))
    }
  }

  function onSerieChange(val) {
    setSerie(val)
    if (!emojiManual) {
      setEmojiSel(sugerirEmojiPorTexto(val, descripcion))
    }
  }

  async function guardar() {
    const ser = serie.trim().toUpperCase()
    const desc = descripcion.trim().toUpperCase()
    if (!ser) {
      onError?.('La serie es obligatoria')
      return
    }
    if (!desc) {
      onError?.('La descripción es obligatoria')
      return
    }
    const row = {
      serie: ser,
      descripcion: desc,
      cantidad: toIntOrNull(cantidad) ?? 0,
      existencia: toIntOrNull(existencia) ?? 0,
      precio_compra: toNum(precioCompra),
      precio_venta: toNum(precioVenta),
      icono: emojiSel,
    }
    const { icono, ...rowDb } = row
    try {
      if (supabase) {
        if (editando?.id != null) {
          const { error } = await supabase.from('productos').update(rowDb).eq('id', editando.id)
          if (error) throw error
          onNotice?.('Producto actualizado')
        } else {
          const { error } = await supabase.from('productos').insert(rowDb)
          if (error) throw error
          onNotice?.('Producto agregado')
        }
      } else {
        const list = readLs(LS_PRODUCTOS, [])
        if (editando?.id != null) {
          writeLs(
            LS_PRODUCTOS,
            list.map((x) => (sameId(x.id, editando.id) ? { ...x, ...row } : x)),
          )
        } else {
          writeLs(LS_PRODUCTOS, [{ id: nextLocalProductId(list), ...row }, ...list])
        }
        onNotice?.(editando?.id != null ? 'Producto actualizado' : 'Producto agregado')
      }
      setDialogo(false)
      const idGuardado = editando?.id
      setEditando(null)
      await cargarProductos()
      if (idGuardado != null) {
        guardarIconoProducto(idGuardado, icono)
      } else if (supabase) {
        const { data: rows } = await supabase.from('productos').select('id').eq('serie', ser).limit(1)
        const found = rows?.[0]
        if (found?.id != null) guardarIconoProducto(found.id, icono)
      } else {
        const list = readLs(LS_PRODUCTOS, [])
        const found = list.find((x) => String(x.serie ?? '').toUpperCase() === ser)
        if (found?.id != null) guardarIconoProducto(found.id, icono)
      }
      setIconosMap(readIconosMap())
    } catch (e) {
      const msg = e.message ?? String(e)
      if (msg.includes('duplicate') || msg.includes('23505')) {
        onError?.('Ya existe un producto con esa serie.')
      } else {
        onError?.(`Error al guardar: ${msg}`)
      }
    }
  }

  async function abrirVenderACliente(p) {
    const stock = Number(p.existencia ?? 0)
    if (!Number.isFinite(stock) || stock <= 0) {
      onError?.('Sin existencia en inventario para vender')
      return
    }
    setVenderProducto(p)
    setBusqClienteVenta('')
    setClienteVentaSel(null)
    setCuentasCliente([])
    setCuentaVentaId('')
    setCantVenta('1')
    setPrecioUnitVenta(p.precio_venta != null && p.precio_venta !== '' ? String(p.precio_venta) : '')
    try {
      if (supabase) {
        const { data, error } = await supabase.from('clientes').select('*').order('nombre', { ascending: true })
        if (error) throw error
        setClientesVenta((data ?? []).map((r) => normalizeClienteRow(r)))
      } else {
        setClientesVenta(readLs(LS_CLIENTES, []).map((r) => normalizeClienteRow(r)))
      }
    } catch (e) {
      onError?.(`Error al cargar clientes: ${e.message}`)
      setVenderProducto(null)
    }
  }

  function cerrarVenderModal() {
    setVenderProducto(null)
    setClienteVentaSel(null)
    setCuentasCliente([])
    setCuentaVentaId('')
    setVendiendo(false)
  }

  const clientesVentaFiltrados = useMemo(() => {
    const t = busqClienteVenta.trim().toLowerCase()
    if (!t) return clientesVenta.slice(0, 40)
    return clientesVenta
      .filter((c) => {
        const n = String(c.nombre ?? '').toLowerCase()
        const tel = String(c.telefono ?? '').toLowerCase()
        return n.includes(t) || tel.includes(t)
      })
      .slice(0, 40)
  }, [clientesVenta, busqClienteVenta])

  async function elegirClienteVenta(c) {
    setClienteVentaSel(c)
    setCuentaVentaId('')
    try {
      let list = []
      if (supabase) {
        const { data, error } = await supabase.from('cuentas').select('*').eq('cliente_id', c.id).order('id', { ascending: false })
        if (error) throw error
        list = data ?? []
      } else {
        list = readLs(LS_CUENTAS, []).filter((x) => sameId(x.cliente_id, c.id))
      }
      const abiertas = list.filter((cu) => String(cu.estatus ?? '').toUpperCase() !== 'LIQUIDADA')
      setCuentasCliente(abiertas)
      if (abiertas.length === 1) {
        setCuentaVentaId(String(abiertas[0].id))
      }
    } catch (e) {
      onError?.(`Error al cargar cuentas: ${e.message}`)
      setCuentasCliente([])
    }
  }

  async function obtenerOCrearCuentaVenta() {
    if (cuentaVentaId === 'nueva') {
      if (!clienteVentaSel?.id) throw new Error('Seleccione un cliente')
      const row = {
        cliente_id: clienteVentaSel.id,
        total: 0,
        estatus: 'PENDIENTE',
        tipo_pago: 'EFECTIVO',
        repara_id: null,
      }
      if (supabase) {
        const { data, error } = await supabase.from('cuentas').insert(row).select('*').single()
        if (error) throw error
        return data?.id
      }
      const list = readLs(LS_CUENTAS, [])
      const nuevo = { id: nextLocalCuentaId(list), ...row }
      writeLs(LS_CUENTAS, [nuevo, ...list])
      return nuevo.id
    }
    if (!cuentaVentaId) throw new Error('Seleccione una cuenta o cree una nueva')
    return cuentaVentaId
  }

  async function confirmarVentaACliente() {
    if (!venderProducto?.id) return
    if (!clienteVentaSel?.id) {
      onError?.('Seleccione el cliente')
      return
    }
    const cant = Number(cantVenta)
    const precio = Number(precioUnitVenta)
    const stock = Number(venderProducto.existencia ?? 0)
    if (!Number.isFinite(cant) || cant <= 0) {
      onError?.('Cantidad inválida')
      return
    }
    if (cant > stock) {
      onError?.(`Stock insuficiente. Disponible: ${stock}`)
      return
    }
    if (!Number.isFinite(precio) || precio <= 0) {
      onError?.('Precio de venta inválido')
      return
    }
    setVendiendo(true)
    try {
      const cuentaId = await obtenerOCrearCuentaVenta()
      const desc = String(venderProducto.descripcion ?? venderProducto.serie ?? 'PRODUCTO').toUpperCase()
      await registrarVentaEnCuenta({
        supabase,
        cuentaId,
        productoId: venderProducto.id,
        descripcion: desc,
        cantidad: cant,
        precio,
        nextLocalId: nextLocalMovId,
      })
      cerrarVenderModal()
      await cargarProductos()
      onNotice?.(
        `Agregado a cuenta de ${clienteVentaSel.nombre || 'cliente'} · inventario: ${Math.max(0, stock - cant)} en stock`,
      )
    } catch (e) {
      onError?.(`Error al vender: ${e.message}`)
    } finally {
      setVendiendo(false)
    }
  }

  async function confirmarEliminar() {
    const p = eliminar
    if (!p?.id) return
    try {
      if (supabase) {
        const { error } = await supabase.from('productos').delete().eq('id', p.id)
        if (error) throw error
      } else {
        const list = readLs(LS_PRODUCTOS, [])
        writeLs(
          LS_PRODUCTOS,
          list.filter((x) => !sameId(x.id, p.id)),
        )
      }
      setEliminar(null)
      await cargarProductos()
      onNotice?.('Producto eliminado')
    } catch (e) {
      const msg = e.message ?? String(e)
      if (msg.includes('foreign key') || msg.includes('23503')) {
        onError?.('No se puede eliminar: el producto está en movimientos o cuentas.')
      } else {
        onError?.(`Error al eliminar: ${msg}`)
      }
    }
  }

  return (
    <div className="servicios-root inventarios-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onHome} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">📦</span>
          Inventarios
        </h1>
        <span className="servicios-appbar-placeholder" aria-hidden />
      </header>

      <div className="servicios-body">
        <button type="button" className="btn-agregar-equipo btn-agregar-inventario" onClick={abrirNuevo}>
          + AGREGAR PRODUCTO
        </button>

        <div className="servicios-search card-pad">
          <span className="search-ico" aria-hidden>
            🔍
          </span>
          <input
            placeholder="Buscar por serie o descripción…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <div className="empty-card">
            <p>{busqueda.trim() ? 'No se encontraron resultados' : 'No hay productos en inventario'}</p>
          </div>
        ) : (
          <ul className="equipo-list inventario-list">
            {filtrados.map((p) => {
              const icono = emojiParaProducto(p, iconosMap)
              return (
              <li key={p.id} className="equipo-card inventario-card">
                <button type="button" className="equipo-card-main inventario-card-main" onClick={() => abrirEditar(p)}>
                  <span className="inventario-producto-emoji" aria-hidden="true">
                    {icono}
                  </span>
                  <span className="inventario-card-texto">
                  <strong>{p.serie || 'Sin serie'}</strong>
                  <span className="muted">{p.descripcion || '—'}</span>
                  <span className="muted small">
                    Existencia: {p.existencia ?? '—'} · Cantidad: {p.cantidad ?? '—'}
                  </span>
                  <span className="muted small">
                    Compra ${Number(p.precio_compra ?? 0).toFixed(2)} · Venta ${Number(p.precio_venta ?? 0).toFixed(2)}
                  </span>
                  </span>
                </button>
                <div className="equipo-card-actions">
                  <button
                    type="button"
                    className="btn-icon venta"
                    onClick={() => void abrirVenderACliente(p)}
                    title="Vender a cliente"
                    aria-label="Vender a cliente"
                  >
                    🛒
                  </button>
                  <button type="button" className="btn-icon edit" onClick={() => abrirEditar(p)} title="Editar" aria-label="Editar">
                    ✏️
                  </button>
                  <button type="button" className="btn-icon danger" onClick={() => setEliminar(p)} title="Eliminar" aria-label="Eliminar">
                    🗑️
                  </button>
                </div>
              </li>
            )})}
          </ul>
        )}
      </div>

      {dialogo && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDialogo(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editando ? 'Editar producto' : 'Agregar producto'}</h3>
            </div>
            <div className="modal-body form-stack">
              <label>
                Serie
                <input value={serie} onChange={(e) => onSerieChange(e.target.value.toUpperCase())} placeholder="Serie del producto" />
              </label>
              <label>
                Descripción
                <input
                  value={descripcion}
                  onChange={(e) => onDescripcionChange(e.target.value.toUpperCase())}
                  placeholder="Descripción"
                />
              </label>
              <label>
                Cantidad
                <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
              </label>
              <label>
                Existencia
                <input inputMode="numeric" value={existencia} onChange={(e) => setExistencia(e.target.value)} placeholder="0" />
              </label>
              <label>
                Precio compra
                <input inputMode="decimal" value={precioCompra} onChange={(e) => setPrecioCompra(e.target.value)} placeholder="0.00" />
              </label>
              <label>
                Precio venta
                <input inputMode="decimal" value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} placeholder="0.00" />
              </label>

              <div className="inventario-icono-seccion">
                <div className="inventario-icono-row">
                  <span className="inventario-emoji-preview compacto" aria-hidden="true">
                    {emojiSel}
                  </span>
                  <button
                    type="button"
                    className="btn-cambio-icono"
                    onClick={() => setMenuIconoAbierto((v) => !v)}
                    aria-expanded={menuIconoAbierto}
                  >
                    Cambio de icono
                  </button>
                </div>
                {menuIconoAbierto ? (
                  <div className="inventario-emoji-field">
                    <div className="inventario-emoji-picker" role="group" aria-label="Icono del producto">
                      {EMOJIS_ELEGIR.map((e) => (
                        <button
                          key={e}
                          type="button"
                          className={emojiSel === e ? 'inventario-emoji-btn activo' : 'inventario-emoji-btn'}
                          onClick={() => {
                            setEmojiSel(e)
                            setEmojiManual(true)
                          }}
                          aria-label={`Icono ${e}`}
                          aria-pressed={emojiSel === e}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setDialogo(false)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void guardar()}>
                {editando ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {venderProducto && (
        <div className="modal-backdrop" role="presentation" onClick={cerrarVenderModal}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Vender a cliente</h3>
            </div>
            <div className="modal-body form-stack">
              <p className="muted small inventario-vender-resumen">
                <span className="inventario-producto-emoji inline" aria-hidden="true">
                  {emojiParaProducto(venderProducto, iconosMap)}
                </span>
                <strong>{venderProducto.serie}</strong> — {venderProducto.descripcion || '—'} · Existencia:{' '}
                {venderProducto.existencia ?? 0}
              </p>
              {!clienteVentaSel ? (
                <>
                  <label>
                    Buscar cliente
                    <input
                      value={busqClienteVenta}
                      onChange={(e) => setBusqClienteVenta(e.target.value)}
                      placeholder="Nombre o teléfono"
                    />
                  </label>
                  <ul className="inventario-clientes-lista">
                    {clientesVentaFiltrados.length === 0 ? (
                      <li className="muted">Sin resultados</li>
                    ) : (
                      clientesVentaFiltrados.map((c) => (
                        <li key={c.id}>
                          <button type="button" className="inventario-cliente-opcion" onClick={() => void elegirClienteVenta(c)}>
                            {c.nombre || 'Sin nombre'} · {c.telefono || '—'}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </>
              ) : (
                <>
                  <p>
                    Cliente: <strong>{clienteVentaSel.nombre}</strong>{' '}
                    <button type="button" className="link-btn" onClick={() => setClienteVentaSel(null)}>
                      Cambiar
                    </button>
                  </p>
                  <label>
                    Cuenta del cliente
                    <select value={cuentaVentaId} onChange={(e) => setCuentaVentaId(e.target.value)}>
                      <option value="">— Seleccione —</option>
                      {cuentasCliente.map((cu) => (
                        <option key={cu.id} value={String(cu.id)}>
                          Cuenta #{cu.id}
                          {cu.repara_id != null ? ` · Orden ${cu.repara_id}` : ''} · {cu.estatus ?? 'PENDIENTE'}
                        </option>
                      ))}
                      <option value="nueva">+ Nueva cuenta</option>
                    </select>
                  </label>
                  <label>
                    Cantidad
                    <input inputMode="numeric" value={cantVenta} onChange={(e) => setCantVenta(e.target.value)} />
                  </label>
                  <label>
                    Precio unitario
                    <input inputMode="decimal" value={precioUnitVenta} onChange={(e) => setPrecioUnitVenta(e.target.value)} />
                  </label>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={cerrarVenderModal}>
                Cancelar
              </button>
              {clienteVentaSel ? (
                <button type="button" disabled={vendiendo} onClick={() => void confirmarVentaACliente()}>
                  {vendiendo ? 'Guardando…' : 'Agregar a cuenta'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {eliminar && (
        <div className="modal-backdrop" role="presentation" onClick={() => setEliminar(null)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Eliminar producto</h3>
            </div>
            <div className="modal-body">
              <p>
                ¿Eliminar <strong>{eliminar.serie}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setEliminar(null)}>
                Cancelar
              </button>
              <button type="button" className="danger" onClick={() => void confirmarEliminar()}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
