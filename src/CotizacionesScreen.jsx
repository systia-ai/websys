import { useCallback, useEffect, useMemo, useState } from 'react'
import AlertaPermiso from './AlertaPermiso.jsx'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import { normalizeClienteRow, sameId } from './clienteUtils.js'
import {
  cotizacionEditable,
  eliminarLineaCotizacion,
  etiquetaEstatusCotizacion,
  finalizarCotizacion,
  formatoTotalCotizacion,
  insertarLineaCotizacion,
  lineaCotizacionDesdeMov,
  marcarCotizacionAceptada,
  numeroCotizacionVisible,
  totalCotizacionDesdeLineas,
  convertirCotizacionACuenta,
  actualizarCotizacion,
  eliminarCotizacionCompleta,
  listarCuentasAbiertasCliente,
  LS_COTIZACIONES,
  LS_COTIZACIONMOV,
} from './cotizacionUtils.js'
import { printCotizacionPdf } from './reciboCotizacionPdf.js'
import {
  abrirWhatsAppCotizacion,
  buildDetalleCotizacionPlantillaWa,
  enviarCotizacionWhatsAppCloudApi,
  enviarWhatsAppConRespaldoManual,
  formatFechaOrdenMensaje,
  formatMontoAnticipoWa,
  telefonoWaParaEnvio,
} from './whatsappUtils.js'

const LS_PRODUCTOS = 'sistefix_local_productos'
const LS_CUENTAS = 'sistefix_local_cuentas'

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
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [modalConvertir, setModalConvertir] = useState(false)
  const [modalFinalizar, setModalFinalizar] = useState(false)
  const [cuentasCliente, setCuentasCliente] = useState([])
  const [cuentaDestinoId, setCuentaDestinoId] = useState('')
  const [convirtiendo, setConvirtiendo] = useState(false)
  const [eliminarConfirmAbierto, setEliminarConfirmAbierto] = useState(false)
  const [eliminandoCotizacion, setEliminandoCotizacion] = useState(false)
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false)

  const cotizacionId = cotizacionInfo?.id ?? cotizacionInicial?.id ?? null
  const numeroCotizacion = numeroCotizacionVisible(cotizacionInfo ?? cotizacionInicial)
  const estatus = String(cotizacionInfo?.estatus ?? cotizacionInicial?.estatus ?? 'BORRADOR').toUpperCase()
  const editable = cotizacionEditable(estatus)
  /** Crear, editar y convertir cotizaciones requiere el mismo permiso que eliminar (solo ADMIN por defecto). */
  const puedeGestionar = puedeEliminar
  const editableEnPantalla = editable && puedeGestionar
  const total = useMemo(() => totalCotizacionDesdeLineas(lineas), [lineas])
  const totalStr = formatoTotalCotizacion(total)
  const telCliente = String(cliente?.telefono ?? '').trim()

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
  }

  function seleccionarProducto(p) {
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
      limpiarCaptura()
      onNotice?.('Línea agregada a la cotización')
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

  async function cargarCuentasDelCliente() {
    if (!cliente?.id) {
      onError?.('Cliente sin ID válido')
      return []
    }
    const cuentas = await listarCuentasAbiertasCliente(supabase, cliente.id)
    setCuentasCliente(cuentas)
    setCuentaDestinoId('')
    return cuentas
  }

  function solicitarFinalizar() {
    if (!requiereGestionar()) return
    if (!cotizacionId) return
    if (lineas.length === 0 || total <= 0.0001) {
      onError?.('Agregue al menos un producto o servicio antes de finalizar')
      return
    }
    setModalFinalizar(true)
  }

  async function ejecutarFinalizarSolo() {
    if (!cotizacionId) return
    setGuardando(true)
    try {
      await actualizarCotizacion(supabase, cotizacionId, {
        notas: notas.trim() || null,
      })
      const data = await finalizarCotizacion(supabase, cotizacionId, lineas)
      setCotizacionInfo(data)
      setModalFinalizar(false)
      onNotice?.('Cotización finalizada. Ya puede imprimirla o enviarla al cliente.')
    } catch (e) {
      onError?.(e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function ejecutarFinalizarYAgregarACuenta() {
    if (!cotizacionId) return
    setGuardando(true)
    try {
      await actualizarCotizacion(supabase, cotizacionId, {
        notas: notas.trim() || null,
      })
      const data = await finalizarCotizacion(supabase, cotizacionId, lineas)
      setCotizacionInfo(data)
      setModalFinalizar(false)
      await cargarCuentasDelCliente()
      setModalConvertir(true)
      onNotice?.('Cotización finalizada. Elija la cuenta donde agregar los productos.')
    } catch (e) {
      onError?.(e.message)
    } finally {
      setGuardando(false)
    }
  }

  async function abrirModalConvertir() {
    if (!requiereGestionar()) return
    if (estatus !== 'ACEPTADA' && estatus !== 'FINALIZADA') {
      onError?.('Finalice la cotización antes de agregarla a una cuenta')
      return
    }
    try {
      await cargarCuentasDelCliente()
      setModalConvertir(true)
    } catch (e) {
      onError?.(`Error al cargar cuentas: ${e.message}`)
    }
  }

  async function ejecutarConversion(crearNueva) {
    if (!requiereGestionar()) return
    if (!cotizacionId || !cotizacionInfo) return
    if (!crearNueva && cuentasCliente.length > 0 && !cuentaDestinoId) {
      onError?.('Seleccione una cuenta del cliente o cree una cuenta nueva')
      return
    }
    setConvirtiendo(true)
    try {
      const cotizacionParaConvertir = {
        ...cotizacionInfo,
        cliente_id: cotizacionInfo.cliente_id ?? cliente.id,
      }
      const { cuentaId, cuenta: cuentaActualizada } = await convertirCotizacionACuenta({
        supabase,
        cotizacion: cotizacionParaConvertir,
        lineas,
        cuentaDestinoId: crearNueva ? null : cuentaDestinoId || null,
        crearNuevaCuenta: crearNueva,
        clienteIdOverride: cliente.id,
        nextLocalCuentaIdFn: (list) => nextMaxId(list),
        nextLocalCuentamovIdFn: (list) => nextMaxId(list),
      })
      setCotizacionInfo((prev) =>
        prev ? { ...prev, estatus: 'CONVERTIDA', cuenta_id: cuentaId } : prev,
      )
      setModalConvertir(false)
      onNotice?.(
        crearNueva
          ? `Cotización agregada a la cuenta nueva #${cuentaId}`
          : `Cotización agregada a la cuenta #${cuentaId} de ${cliente.nombre || 'el cliente'}`,
      )
      const cuenta =
        cuentaActualizada ??
        (await (async () => {
          if (supabase) {
            const { data } = await supabase.from('cuentas').select('*').eq('id', cuentaId).maybeSingle()
            return data
          }
          return readLs(LS_CUENTAS, []).find((c) => sameId(c.id, cuentaId)) ?? null
        })()) ?? {
          id: cuentaId,
          total,
          saldo: total,
          estatus: 'PENDIENTE',
          repara_id: null,
        }
      onAbrirCuenta?.({ cliente, cuenta })
    } catch (e) {
      onError?.(`Error al agregar a cuenta: ${e.message}`)
    } finally {
      setConvirtiendo(false)
    }
  }

  function etiquetaCuentaCliente(c) {
    const est = String(c.estatus ?? '—').trim()
    const monto = formatoTotalCotizacion(c.total ?? 0)
    const orden =
      c.repara_id != null && c.repara_id !== '' && String(c.repara_id) !== String(c.id)
        ? ` · Orden #${c.repara_id}`
        : ''
    return `Cuenta #${c.id} · ${est} · ${monto}${orden}`
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

  async function enviarWhatsAppCotizacion() {
    if (enviandoWhatsApp) return
    if (lineas.length === 0) {
      onError?.('Agregue al menos un concepto a la cotización')
      return
    }
    if (!telCliente) {
      onError?.('El cliente no tiene teléfono registrado.')
      return
    }

    const waParams = {
      telefono: telCliente,
      numeroCotizacion,
      fechaCreacion: cotizacionInfo?.created_at ?? cotizacionInicial?.created_at,
      nombreCliente: cliente?.nombre,
      lineas,
      total,
      notas,
    }

    setEnviandoWhatsApp(true)
    try {
      if (supabase) {
        const tel = telefonoWaParaEnvio(telCliente)
        if (!tel.ok) {
          onError?.(tel.errorMsg)
          return
        }
        const res = await enviarCotizacionWhatsAppCloudApi(supabase, {
          to: tel.to,
          numeroCotizacion,
          nombreCliente: cliente?.nombre,
          detalle: buildDetalleCotizacionPlantillaWa(lineas, notas),
          total: formatMontoAnticipoWa(total),
          fecha: formatFechaOrdenMensaje(waParams.fechaCreacion),
        })
        const outcome = enviarWhatsAppConRespaldoManual(res, abrirWhatsAppCotizacion, waParams)
        if (!outcome.ok) {
          onError?.(outcome.errorMsg)
          return
        }
        if (outcome.modo === 'manual') {
          onNotice?.(
            `${outcome.aviso ?? 'Envío automático no disponible.'} Se abrió WhatsApp con el mensaje — pulse Enviar en la app.`,
          )
        } else {
          onNotice?.(
            `Cotización enviada por WhatsApp${outcome.toDisplay ? ` a ${outcome.toDisplay}` : ''}.`,
          )
        }
        return
      }

      const wa = abrirWhatsAppCotizacion(waParams)
      if (wa.ok) {
        onNotice?.('Mensaje de cotización listo en WhatsApp. Pulsa enviar en la app.')
        return
      }
      if (wa.motivo === 'telefono-invalido') {
        onError?.(`El teléfono "${telCliente}" no tiene un formato válido para WhatsApp.`)
      } else if (wa.motivo === 'popup-bloqueado') {
        onError?.('El navegador bloqueó la ventana de WhatsApp. Permite ventanas emergentes e intenta de nuevo.')
      }
    } finally {
      setEnviandoWhatsApp(false)
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
                <button type="button" className="btn-liquidar-cuenta" onClick={solicitarFinalizar} disabled={guardando}>
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
              <button
                type="button"
                className="btn-comprobante-ventas btn-whatsapp-cotizacion"
                onClick={() => void enviarWhatsAppCotizacion()}
                disabled={lineas.length === 0 || !telCliente || enviandoWhatsApp}
                title={
                  !telCliente
                    ? 'El cliente no tiene teléfono registrado'
                    : 'Enviar cotización por WhatsApp al cliente'
                }
              >
                {enviandoWhatsApp ? 'Enviando…' : '📲 ENVIAR POR WHATSAPP'}
              </button>
              {puedeGestionar && (estatus === 'ACEPTADA' || estatus === 'FINALIZADA') && estatus !== 'CONVERTIDA' ? (
                <button type="button" className="btn-cotizaciones-cliente-ventas" onClick={() => void abrirModalConvertir()}>
                  💳 AGREGAR COTIZACIÓN A CUENTA
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

      {modalFinalizar ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !guardando && setModalFinalizar(false)}
        >
          <div
            className="modal modal-cotizacion-finalizar"
            role="dialog"
            aria-labelledby="cotizacion-finalizar-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="cotizacion-finalizar-titulo">Finalizar cotización</h3>
              <p className="muted small">
                Total: <strong>{totalStr}</strong> · {lineas.length}{' '}
                {lineas.length === 1 ? 'concepto' : 'conceptos'}. Ya no podrá agregar líneas.
              </p>
            </div>
            <div className="modal-body form-stack">
              <p>¿Cómo desea continuar?</p>
            </div>
            <div className="modal-footer modal-footer-wrap modal-footer-col">
              <button
                type="button"
                className="btn-liquidar-cuenta wide"
                disabled={guardando}
                onClick={() => void ejecutarFinalizarYAgregarACuenta()}
              >
                {guardando ? 'Finalizando…' : '✓ Finalizar y agregar a cuenta del cliente'}
              </button>
              <button
                type="button"
                className="btn-comprobante-ventas wide"
                disabled={guardando}
                onClick={() => void ejecutarFinalizarSolo()}
              >
                {guardando ? 'Finalizando…' : 'Solo finalizar cotización'}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={guardando}
                onClick={() => setModalFinalizar(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modalConvertir ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !convirtiendo && setModalConvertir(false)}>
          <div
            className="modal modal-wide modal-cotizacion-a-cuenta"
            role="dialog"
            aria-labelledby="cotizacion-a-cuenta-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="cotizacion-a-cuenta-titulo">Agregar cotización a cuenta del cliente</h3>
              <p className="muted small">
                <strong>{cliente.nombre || 'Cliente'}</strong> · Total cotización:{' '}
                <strong>{totalStr}</strong>
              </p>
              <p className="muted small">
                Los productos y servicios de esta cotización se sumarán a la cuenta que elija (no reemplazan lo que ya
                tiene).
              </p>
            </div>
            <div className="modal-body form-stack">
              {cuentasCliente.length > 0 ? (
                <>
                  <p className="cotizacion-a-cuenta-etiqueta">Cuentas abiertas de {cliente.nombre || 'este cliente'}</p>
                  <ul className="cotizacion-a-cuenta-lista">
                    {cuentasCliente.map((c) => {
                      const idStr = String(c.id)
                      const sel = cuentaDestinoId === idStr
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={`cotizacion-a-cuenta-opcion${sel ? ' cotizacion-a-cuenta-opcion--sel' : ''}`}
                            onClick={() => setCuentaDestinoId(idStr)}
                          >
                            <span className="cotizacion-a-cuenta-opcion-titulo">{etiquetaCuentaCliente(c)}</span>
                            {c.repara_id != null && c.repara_id !== '' ? (
                              <span className="muted small">Vinculada a orden de servicio #{c.repara_id}</span>
                            ) : (
                              <span className="muted small">Cuenta general del cliente</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              ) : (
                <p className="cotizacion-a-cuenta-vacio">
                  {cliente.nombre || 'Este cliente'} no tiene cuentas abiertas. Puede crear una cuenta nueva con los
                  productos de la cotización.
                </p>
              )}
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button type="button" className="secondary" onClick={() => setModalConvertir(false)} disabled={convirtiendo}>
                Cancelar
              </button>
              {cuentasCliente.length > 0 ? (
                <button
                  type="button"
                  className="btn-cotizaciones-cliente-ventas"
                  onClick={() => void ejecutarConversion(false)}
                  disabled={convirtiendo || !cuentaDestinoId}
                >
                  {convirtiendo ? 'Agregando…' : `Agregar a cuenta #${cuentaDestinoId || '…'}`}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-cuentas"
                onClick={() => void ejecutarConversion(true)}
                disabled={convirtiendo}
              >
                {convirtiendo ? 'Creando…' : 'Crear cuenta nueva'}
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
