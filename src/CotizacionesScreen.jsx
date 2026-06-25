import { useCallback, useEffect, useMemo, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import { esProductoContable, etiquetaExistencia } from './productoUtils.js'
import {
  cotizacionEditable,
  eliminarLineaCotizacion,
  etiquetaEstatusCotizacion,
  finalizarCotizacion,
  formatoTotalCotizacion,
  insertarLineaCotizacion,
  lineaCotizacionDesdeMov,
  listarSurtidoPendienteCotizacion,
  marcarCotizacionAceptada,
  mensajeSurtidoPendiente,
  numeroCotizacionVisible,
  surtidoPendienteDesdeProducto,
  totalCotizacionDesdeLineas,
  convertirCotizacionACuenta,
  actualizarCotizacion,
  eliminarCotizacionCompleta,
  LS_COTIZACIONES,
  LS_COTIZACIONMOV,
} from './cotizacionUtils.js'
import { printCotizacionPdf, COTIZACION_PRINT_HINT } from './reciboCotizacionPdf.js'

const LS_PRODUCTOS = 'sistefix_local_productos'
const LS_CUENTAS = 'sistefix_local_cuentas'
const LS_CUENTAMOV = 'sistefix_local_cuentamov'

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

function nextMaxId(list) {
  return list.reduce((m, r) => {
    const id = Number(r.id)
    return Number.isFinite(id) && id > m ? id : m
  }, 0) + 1
}

export default function CotizacionesScreen({
  supabase,
  context,
  onSalir,
  onError,
  onNotice,
  onAbrirCuenta,
  puedeEliminar = false,
}) {
  const { alertaPermiso, mostrarSinPermiso } = usePermisoEliminar(puedeEliminar)
  const cliente = useMemo(() => normalizeClienteRow(context?.cliente ?? {}), [context?.cliente])
  const cotizacionInicial = context?.cotizacion

  const [loading, setLoading] = useState(true)
  const [cotizacionInfo, setCotizacionInfo] = useState(null)
  const [lineas, setLineas] = useState([])
  const [todosProductos, setTodosProductos] = useState([])
  const [modalProductos, setModalProductos] = useState(false)
  const [busqProd, setBusqProd] = useState('')
  const [mostrarCaptura, setMostrarCaptura] = useState(false)
  const [serieProd, setSerieProd] = useState('')
  const [descProd, setDescProd] = useState('')
  const [cantProd, setCantProd] = useState('')
  const [precioProd, setPrecioProd] = useState('')
  const [productoIdSel, setProductoIdSel] = useState(0)
  const [productoSel, setProductoSel] = useState(null)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [modalConvertir, setModalConvertir] = useState(false)
  const [cuentasCliente, setCuentasCliente] = useState([])
  const [cuentaDestinoId, setCuentaDestinoId] = useState('')
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [eliminarConfirmAbierto, setEliminarConfirmAbierto] = useState(false)
  const [eliminandoCotizacion, setEliminandoCotizacion] = useState(false)

  const cotizacionId = cotizacionInfo?.id ?? cotizacionInicial?.id ?? null
  const numeroCotizacion = numeroCotizacionVisible(cotizacionInfo ?? cotizacionInicial)
  const estatus = String(cotizacionInfo?.estatus ?? cotizacionInicial?.estatus ?? 'BORRADOR').toUpperCase()
  const editable = cotizacionEditable(estatus)
  /** Crear, editar y convertir cotizaciones requiere el mismo permiso que eliminar (solo ADMIN por defecto). */
  const puedeGestionar = puedeEliminar
  const editableEnPantalla = editable && puedeGestionar
  const total = useMemo(() => totalCotizacionDesdeLineas(lineas), [lineas])
  const totalStr = formatoTotalCotizacion(total)

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

  const productosPorId = useMemo(() => {
    const m = new Map()
    for (const p of todosProductos) {
      if (p?.id != null) m.set(String(p.id), p)
    }
    return m
  }, [todosProductos])

  const surtidoPendiente = useMemo(
    () => listarSurtidoPendienteCotizacion(lineas, productosPorId),
    [lineas, productosPorId],
  )

  const avisoCantidadCaptura = useMemo(() => {
    if (!productoSel || !cantProd.trim()) return null
    const cant = Number(cantProd)
    if (!Number.isFinite(cant) || cant <= 0) return null
    const item = surtidoPendienteDesdeProducto(productoSel, cant)
    return item ? mensajeSurtidoPendiente(item) : null
  }, [productoSel, cantProd])

  const cargarTodo = useCallback(async () => {
    setLoading(true)
    try {
      let cotRow = null
      const cid = cotizacionInicial?.id
      if (cid != null) {
        if (supabase) {
          const { data, error } = await supabase.from('cotizaciones').select('*').eq('id', cid).maybeSingle()
          if (error) throw error
          cotRow = data
        } else {
          cotRow = readLs(LS_COTIZACIONES, []).find((c) => sameId(c.id, cid)) ?? null
        }
      }
      setCotizacionInfo(cotRow)
      setNotas(cotRow?.notas ?? '')

      let movs = []
      if (cotRow?.id != null) {
        if (supabase) {
          const { data, error } = await supabase.from('cotizacionmov').select('*').eq('cotizacion_id', cotRow.id)
          if (error) throw error
          movs = data ?? []
        } else {
          movs = readLs(LS_COTIZACIONMOV, []).filter((m) => sameId(m.cotizacion_id, cotRow.id))
        }
      }
      setLineas(movs.map(lineaCotizacionDesdeMov))

      if (supabase) {
        const { data: prods, error: eP } = await supabase.from('productos').select('*').order('descripcion')
        if (eP) throw eP
        setTodosProductos(prods ?? [])
      } else {
        setTodosProductos(readLs(LS_PRODUCTOS, []))
      }
    } catch (e) {
      onError?.(`Error al cargar cotización: ${e.message}`)
      setLineas([])
    } finally {
      setLoading(false)
    }
  }, [supabase, cotizacionInicial?.id, onError])

  useEffect(() => {
    void cargarTodo()
  }, [cargarTodo])

  function limpiarCaptura() {
    setSerieProd('')
    setDescProd('')
    setCantProd('')
    setPrecioProd('')
    setProductoIdSel(0)
    setProductoSel(null)
  }

  function seleccionarProducto(p) {
    setProductoSel(p)
    setProductoIdSel(Number(p.id) || 0)
    setSerieProd(String(p.serie ?? '').toUpperCase())
    setDescProd(String(p.descripcion ?? '').toUpperCase())
    setPrecioProd(String(p.precio_venta ?? ''))
    setCantProd('')
    setModalProductos(false)
    setMostrarCaptura(true)
  }

  function requiereGestionar() {
    if (!puedeGestionar) {
      mostrarSinPermiso()
      return false
    }
    return true
  }

  async function agregarLinea() {
    if (!requiereGestionar()) return
    if (!editable) {
      onError?.('La cotización ya no se puede editar')
      return
    }
    if (!cotizacionId) {
      onError?.('Cotización sin ID')
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
    try {
      const { linea } = await insertarLineaCotizacion({
        supabase,
        cotizacionId,
        productoId: productoIdSel,
        descripcion: descProd.trim(),
        cantidad: cant,
        precio,
        nextLocalId,
      })
      setLineas((prev) => [...prev, linea])
      setCotizacionInfo((prev) => (prev ? { ...prev, total: totalCotizacionDesdeLineas([...lineas, linea]) } : prev))
      setMostrarCaptura(false)
      const pendiente = productoSel ? surtidoPendienteDesdeProducto(productoSel, cant) : null
      limpiarCaptura()
      if (pendiente) {
        onNotice?.(mensajeSurtidoPendiente(pendiente))
      } else {
        onNotice?.('Línea agregada a la cotización')
      }
    } catch (e) {
      onError?.(`Error al agregar: ${e.message}`)
    }
  }

  async function eliminarLinea(L) {
    if (!editableEnPantalla) return
    if (!requiereGestionar()) return
    if (!window.confirm('¿Eliminar esta línea de la cotización?')) return
    const restantes = lineas.filter((x) => x.key !== L.key)
    try {
      await eliminarLineaCotizacion(supabase, L, cotizacionId, restantes)
      setLineas(restantes)
      setCotizacionInfo((prev) => (prev ? { ...prev, total: totalCotizacionDesdeLineas(restantes) } : prev))
      onNotice?.('Línea eliminada')
    } catch (e) {
      onError?.(`Error al eliminar: ${e.message}`)
    }
  }

  async function guardarNotas() {
    if (!requiereGestionar()) return
    if (!cotizacionId) return
    setGuardando(true)
    try {
      const data = await actualizarCotizacion(supabase, cotizacionId, {
        notas: notas.trim() || null,
      })
      setCotizacionInfo(data)
      onNotice?.('Cotización guardada')
    } catch (e) {
      onError?.(`Error al guardar: ${e.message}`)
    } finally {
      setGuardando(false)
    }
  }

  async function finalizar() {
    if (!requiereGestionar()) return
    if (!cotizacionId) return
    if (!window.confirm('¿Finalizar esta cotización? Ya no podrá agregar líneas.')) return
    if (surtidoPendiente.length > 0) {
      const resumen = surtidoPendiente
        .map((s) => `· ${mensajeSurtidoPendiente(s)}`)
        .join('\n')
      const ok = window.confirm(
        `Hay productos por surtir para completar esta cotización:\n\n${resumen}\n\n¿Finalizar de todos modos? El inventario no se modifica hasta pasarla a cuenta.`,
      )
      if (!ok) return
    }
    setGuardando(true)
    try {
      await actualizarCotizacion(supabase, cotizacionId, {
        notas: notas.trim() || null,
      })
      const data = await finalizarCotizacion(supabase, cotizacionId, lineas)
      setCotizacionInfo(data)
      onNotice?.('Cotización finalizada. Ya puede imprimirla o enviarla al cliente.')
    } catch (e) {
      onError?.(e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function marcarAceptada() {
    if (!requiereGestionar()) return
    if (!cotizacionId) return
    if (!window.confirm('¿El cliente aceptó esta cotización?')) return
    try {
      const data = await marcarCotizacionAceptada(supabase, cotizacionId)
      setCotizacionInfo(data)
      onNotice?.('Cotización marcada como aceptada')
    } catch (e) {
      onError?.(e.message)
    }
  }

  async function imprimir() {
    if (lineas.length === 0) {
      onError?.('No hay líneas para imprimir')
      return
    }
    try {
      await printCotizacionPdf({
        cliente,
        cotizacionId: numeroCotizacion,
        lineas,
        total,
        notas,
      })
    } catch (e) {
      onError?.(`Error al imprimir: ${e.message}`)
    }
  }

  async function abrirModalConvertir() {
    if (!requiereGestionar()) return
    if (estatus !== 'ACEPTADA' && estatus !== 'FINALIZADA') {
      onError?.('Finalice o marque como aceptada la cotización antes de pasarla a cuenta')
      return
    }
    try {
      let cuentas = []
      if (supabase) {
        const { data, error } = await supabase
          .from('cuentas')
          .select('*')
          .eq('cliente_id', cliente.id)
          .neq('estatus', 'LIQUIDADA')
          .order('id', { ascending: false })
        if (error) throw error
        cuentas = data ?? []
      } else {
        cuentas = readLs(LS_CUENTAS, []).filter(
          (c) => sameId(c.cliente_id, cliente.id) && String(c.estatus).toUpperCase() !== 'LIQUIDADA',
        )
      }
      setCuentasCliente(cuentas)
      setCuentaDestinoId('')
      setModalConvertir(true)
    } catch (e) {
      onError?.(`Error al cargar cuentas: ${e.message}`)
    }
  }

  async function ejecutarConversion(crearNueva) {
    if (!requiereGestionar()) return
    if (!cotizacionId || !cotizacionInfo) return
    setConvirtiendo(true)
    try {
      const { cuentaId } = await convertirCotizacionACuenta({
        supabase,
        cotizacion: cotizacionInfo,
        lineas,
        cuentaDestinoId: crearNueva ? null : cuentaDestinoId || null,
        crearNuevaCuenta: crearNueva,
        nextLocalCuentaIdFn: (list) => nextMaxId(list),
        nextLocalCuentamovIdFn: (list) => nextMaxId(list),
      })
      setModalConvertir(false)
      onNotice?.(`Cotización convertida a cuenta #${cuentaId}`)
      const cuenta = {
        id: cuentaId,
        total,
        saldo: total,
        estatus: 'PENDIENTE',
        repara_id: null,
      }
      onAbrirCuenta?.({ cliente, cuenta })
    } catch (e) {
      onError?.(`Error al convertir: ${e.message}`)
    } finally {
      setConvirtiendo(false)
    }
  }

  function solicitarEliminarCotizacion() {
    if (!requiereGestionar()) return
    if (!cotizacionId) return
    if (estatus === 'CONVERTIDA') {
      onError?.('No se puede eliminar una cotización ya convertida a cuenta')
      return
    }
    setEliminarConfirmAbierto(true)
  }

  async function confirmarEliminarCotizacion() {
    if (!requiereGestionar()) return
    if (!cotizacionId || eliminandoCotizacion) return
    setEliminandoCotizacion(true)
    try {
      await eliminarCotizacionCompleta(supabase, cotizacionId)
      setEliminarConfirmAbierto(false)
      onNotice?.(`Cotización #${numeroCotizacion ?? cotizacionId} eliminada`)
      onSalir?.()
    } catch (e) {
      onError?.(`Error al eliminar cotización: ${e.message}`)
    } finally {
      setEliminandoCotizacion(false)
    }
  }

  return (
    <div className="servicios-root ventas-cuenta-root cotizaciones-screen-root">
      <header className="servicios-appbar">
        <button type="button" className="icon-back" onClick={onSalir} aria-label="Atrás">
          ←
        </button>
        <h1 className="servicios-appbar-title">
          <span className="appbar-title-emoji" aria-hidden="true">
            📋
          </span>
          Cotización {numeroCotizacion != null ? `#${numeroCotizacion}` : ''}
        </h1>
        <span className="servicios-appbar-placeholder" aria-hidden />
      </header>

      <div className="servicios-body ventas-cuenta-body">
        <AlertaPermiso mensaje={alertaPermiso} />
        {loading ? (
          <p className="muted center">Cargando…</p>
        ) : (
          <>
            <div className="ventas-cuenta-cliente-bar card-pad">
              <strong>{cliente.nombre || 'Cliente'}</strong>
              {cliente.telefono ? <span className="muted"> · {cliente.telefono}</span> : null}
            </div>

            <section className="ventas-seccion">
              <h3 className="ventas-seccion-titulo">Detalle de la cotización</h3>
              {lineas.length === 0 ? (
                <div className="ventas-tabla-wrap">
                  <div className="ventas-tabla-vacia">Los productos y servicios agregados aparecerán aquí</div>
                </div>
              ) : (
                <TablaScrollSuperior
                  ariaLabel="Líneas de cotización"
                  classNameWrap="ventas-tabla-scroll-outer"
                  syncDeps={[lineas, loading]}
                >
                  <div className="ventas-tabla-wrap">
                    <div className="ventas-tabla-head ventas-tabla-head--cotizacion">
                      <span>Cant</span>
                      <span>Descripción</span>
                      <span>Precio</span>
                      <span>Subtotal</span>
                      <span />
                    </div>
                    <ul className="ventas-tabla-lista">
                      {lineas.map((L, idx) => (
                        <li key={L.key} className={`ventas-tabla-fila ventas-tabla-fila--cotizacion ${idx % 2 ? 'stripe' : ''}`}>
                          <span>{L.cantidad}</span>
                          <span>{L.descripcion}</span>
                          <span>${Number(L.precioUnitario).toFixed(2)}</span>
                          <span>${Number(L.subtotal).toFixed(2)}</span>
                          {editableEnPantalla ? (
                            <button
                              type="button"
                              className="btn-elim-linea"
                              onClick={() => void eliminarLinea(L)}
                              aria-label="Eliminar"
                            >
                              ×
                            </button>
                          ) : (
                            <span />
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </TablaScrollSuperior>
              )}
            </section>

            {surtidoPendiente.length > 0 ? (
              <div className="ventas-cotizacion-surtido-aviso" role="status" aria-live="polite">
                <p className="ventas-cotizacion-surtido-aviso-titulo">
                  <span aria-hidden="true">📦</span> Surtido pendiente para completar la cotización
                </p>
                <p className="ventas-cotizacion-surtido-aviso-lead muted small">
                  El precio total incluye todas las unidades cotizadas. El inventario no se descuenta hasta pasar la
                  cotización a una cuenta.
                </p>
                <ul className="ventas-cotizacion-surtido-lista">
                  {surtidoPendiente.map((s) => (
                    <li key={String(s.productoId)}>{mensajeSurtidoPendiente(s)}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {editableEnPantalla ? (
              <>
                <button
                  type="button"
                  className={mostrarCaptura || modalProductos ? 'btn-agregar-prod-ventas abierto' : 'btn-agregar-prod-ventas'}
                  onClick={() => setModalProductos(true)}
                >
                  📦 AGREGAR PRODUCTO/SERVICIO
                </button>
                {mostrarCaptura ? (
                  <div className="ventas-cotizacion-captura card-pad">
                    <p className="ventas-cotizacion-captura-titulo">
                      <strong>{serieProd}</strong> · {descProd}
                    </p>
                    {productoSel ? (
                      <p className="ventas-cotizacion-stock-hint muted small">
                        {esProductoContable(productoSel) ? (
                          <>
                            En stock: <strong>{productoSel.existencia ?? 0}</strong>
                          </>
                        ) : (
                          etiquetaExistencia(productoSel)
                        )}
                      </p>
                    ) : null}
                    <div className="ventas-cotizacion-captura-campos">
                      <label className="ventas-cotizacion-campo">
                        <span>Cantidad</span>
                        <input inputMode="numeric" value={cantProd} onChange={(e) => setCantProd(e.target.value)} />
                      </label>
                      <label className="ventas-cotizacion-campo">
                        <span>Precio unitario</span>
                        <input inputMode="decimal" value={precioProd} onChange={(e) => setPrecioProd(e.target.value)} />
                      </label>
                    </div>
                    {avisoCantidadCaptura ? (
                      <p className="ventas-cotizacion-surtido-inline" role="status">
                        {avisoCantidadCaptura}
                      </p>
                    ) : null}
                    <div className="ventas-cotizacion-captura-acciones">
                      <button
                        type="button"
                        className="secondary ventas-cotizacion-btn-sec"
                        onClick={() => {
                          setMostrarCaptura(false)
                          limpiarCaptura()
                        }}
                      >
                        Cancelar
                      </button>
                      <button type="button" className="btn-primary-ventas ventas-cotizacion-btn-prim" onClick={() => void agregarLinea()}>
                        Agregar
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="ventas-cuenta-resumen" role="group" aria-label="Total cotización">
              <div className="ventas-cuenta-recuadro ventas-cuenta-recuadro--total">
                <span className="ventas-cuenta-recuadro-etiqueta">Total cotización</span>
                <span className="ventas-cuenta-recuadro-monto">{totalStr}</span>
              </div>
              <div className="ventas-cuenta-recuadro ventas-cuenta-recuadro--saldo">
                <span className="ventas-cuenta-recuadro-etiqueta">Estatus</span>
                <span className="ventas-cuenta-recuadro-monto ventas-cuenta-recuadro-monto--texto">
                  {etiquetaEstatusCotizacion(estatus)}
                </span>
              </div>
            </div>

            {notas || puedeGestionar ? (
              <label className="ventas-total-block ventas-cotizacion-notas-block">
                <span>Notas (opcional)</span>
                <textarea
                  className={`ventas-cotizacion-notas${!puedeGestionar ? ' readonly-field' : ''}`}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  rows={2}
                  placeholder="Observaciones para el cliente…"
                  readOnly={!puedeGestionar}
                  disabled={!puedeGestionar || estatus === 'CONVERTIDA'}
                />
              </label>
            ) : null}

            <div className="ventas-acciones ventas-acciones--cotizacion">
              {puedeGestionar ? (
                <button
                  type="button"
                  className="btn-primary-ventas"
                  onClick={() => void guardarNotas()}
                  disabled={guardando || estatus === 'CONVERTIDA'}
                >
                  {guardando ? 'Guardando…' : '💾 GUARDAR'}
                </button>
              ) : null}
              {editableEnPantalla ? (
                <button type="button" className="btn-liquidar-cuenta" onClick={() => void finalizar()} disabled={guardando}>
                  ✓ FINALIZAR COTIZACIÓN
                </button>
              ) : null}
              {puedeGestionar && estatus === 'FINALIZADA' ? (
                <button type="button" className="btn-notificar-cliente" onClick={() => void marcarAceptada()}>
                  ✓ CLIENTE ACEPTÓ
                </button>
              ) : null}
              <button
                type="button"
                className="btn-comprobante-ventas"
                onClick={() => void imprimir()}
                disabled={lineas.length === 0}
              >
                🖨️ IMPRIMIR COTIZACIÓN
              </button>
              {puedeGestionar && (estatus === 'ACEPTADA' || estatus === 'FINALIZADA') && estatus !== 'CONVERTIDA' ? (
                <button type="button" className="btn-cuentas" onClick={() => void abrirModalConvertir()}>
                  PASAR A CUENTA
                </button>
              ) : null}
              {puedeGestionar && estatus !== 'CONVERTIDA' ? (
                <button
                  type="button"
                  className="btn-eliminar-orden btn-eliminar-cotizacion"
                  onClick={() => solicitarEliminarCotizacion()}
                  disabled={eliminandoCotizacion}
                >
                  🗑️ ELIMINAR COTIZACIÓN
                </button>
              ) : null}
            </div>
            <p className="muted small ventas-recibo-hint">{COTIZACION_PRINT_HINT}</p>
          </>
        )}
      </div>

      {modalProductos ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setModalProductos(false)}>
          <div className="modal modal-wide" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Seleccionar producto / servicio</h3>
            </div>
            <div className="modal-body modal-body--ordenes-cliente">
              <input
                className="full"
                placeholder="Buscar por serie o descripción…"
                value={busqProd}
                onChange={(e) => setBusqProd(e.target.value)}
              />
              <ul className="inventario-clientes-lista inventarios-surtido-lista">
                {productosFiltrados.length === 0 ? (
                  <li>
                    <p className="muted small">Sin resultados</p>
                  </li>
                ) : (
                  productosFiltrados.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="inventario-cliente-opcion" onClick={() => seleccionarProducto(p)}>
                        <strong>{p.serie || '—'}</strong> · {p.descripcion || '—'}
                        <span className="muted small">
                          {' '}
                          · {esProductoContable(p) ? `Stock: ${p.existencia ?? 0}` : etiquetaExistencia(p)}
                        </span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
            <div className="modal-footer">
              <button type="button" className="secondary" onClick={() => setModalProductos(false)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalConvertir ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !convirtiendo && setModalConvertir(false)}>
          <div className="modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pasar cotización a cuenta</h3>
              <p className="muted small">Elija una cuenta existente del cliente o cree una nueva.</p>
            </div>
            <div className="modal-body form-stack">
              {cuentasCliente.length > 0 ? (
                <label>
                  Cuenta existente (pendiente / activa)
                  <select value={cuentaDestinoId} onChange={(e) => setCuentaDestinoId(e.target.value)}>
                    <option value="">— Seleccione —</option>
                    {cuentasCliente.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        Cuenta #{c.id} · {String(c.estatus ?? '—')} · ${Number(c.total ?? 0).toFixed(2)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="muted">No hay cuentas abiertas. Se creará una cuenta nueva.</p>
              )}
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button type="button" className="secondary" onClick={() => setModalConvertir(false)} disabled={convirtiendo}>
                Cancelar
              </button>
              {cuentasCliente.length > 0 && cuentaDestinoId ? (
                <button type="button" onClick={() => void ejecutarConversion(false)} disabled={convirtiendo}>
                  Agregar a cuenta #{cuentaDestinoId}
                </button>
              ) : null}
              <button type="button" className="btn-cuentas" onClick={() => void ejecutarConversion(true)} disabled={convirtiendo}>
                Crear cuenta nueva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {eliminarConfirmAbierto ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !eliminandoCotizacion && setEliminarConfirmAbierto(false)}
        >
          <div
            className="modal modal-narrow modal-alerta modal-alerta--error"
            role="alertdialog"
            aria-labelledby="eliminar-cotizacion-pantalla-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="eliminar-cotizacion-pantalla-titulo">
                <span className="modal-alerta-icon" aria-hidden="true">
                  🚨
                </span>
                Eliminar cotización
              </h3>
            </div>
            <div className="modal-body">
              <p className="modal-alerta-mensaje">¿Seguro que quieres eliminar esta cotización?</p>
              <p className="modal-alerta-sugerencia">
                Se eliminará la cotización <strong>#{numeroCotizacion ?? '—'}</strong> de{' '}
                <strong>{cliente.nombre || 'este cliente'}</strong>, incluyendo todas sus líneas.
              </p>
              <p className="modal-alerta-sugerencia">
                Esta acción <strong>no se puede deshacer</strong>. El número quedará disponible para una cotización
                nueva.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="secondary"
                onClick={() => setEliminarConfirmAbierto(false)}
                disabled={eliminandoCotizacion}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => void confirmarEliminarCotizacion()}
                disabled={eliminandoCotizacion}
              >
                {eliminandoCotizacion ? 'Eliminando…' : 'Sí, eliminar cotización'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
