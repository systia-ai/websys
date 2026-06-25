import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeClienteRow } from './clienteUtils.js'
import ClientesCotizacionesPanel from './ClientesCotizacionesPanel.jsx'
import AlertaPermiso from './AlertaPermiso.jsx'
import { usePermisoEliminar } from './usePermisoEliminar.js'
import {
  crearCotizacionVacia,
  cotizacionResumenParaPantalla,
  eliminarCotizacionCompleta,
  listarCotizacionesPorCliente,
  numeroCotizacionVisible,
} from './cotizacionUtils.js'

/**
 * Lista de cotizaciones del cliente (pantalla completa), accesible desde orden o cuenta.
 */
export default function ClienteCotizacionesListaScreen({
  supabase,
  context,
  onSalir,
  onSelectCotizacion,
  onError,
  onNotice,
  puedeEliminar = false,
}) {
  const { alertaPermiso, intentarEliminar, mostrarSinPermiso } = usePermisoEliminar(puedeEliminar)
  const cliente = useMemo(() => normalizeClienteRow(context?.cliente ?? {}), [context?.cliente])
  const [loading, setLoading] = useState(true)
  const [errorSubtitle, setErrorSubtitle] = useState(null)
  const [cotizaciones, setCotizaciones] = useState([])
  const [resumen, setResumen] = useState(null)
  const [cotizacionEliminarConfirm, setCotizacionEliminarConfirm] = useState(null)
  const [eliminandoCotizacion, setEliminandoCotizacion] = useState(false)

  const recargar = useCallback(async () => {
    if (!cliente?.id) {
      onError?.('Cliente sin ID válido')
      return
    }
    setLoading(true)
    setErrorSubtitle(null)
    setResumen(null)
    try {
      const lista = await listarCotizacionesPorCliente(supabase, cliente.id)
      const activas = lista.filter((c) => String(c.estatus ?? '').toUpperCase() !== 'CONVERTIDA').length
      setCotizaciones(lista)
      setResumen({
        nombre: String(cliente.nombre || 'Cliente').trim() || 'Cliente',
        total: lista.length,
        activas,
      })
    } catch (e) {
      setCotizaciones([])
      setErrorSubtitle(`Error: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [supabase, cliente, onError])

  useEffect(() => {
    void recargar()
  }, [recargar])

  function solicitarEliminarCotizacion(cot) {
    if (!puedeEliminar) {
      mostrarSinPermiso()
      return
    }
    const id = cot?.id
    if (id == null) return
    if (String(cot.estatus ?? '').toUpperCase() === 'CONVERTIDA') {
      onError?.('No se puede eliminar una cotización ya convertida a cuenta')
      return
    }
    setCotizacionEliminarConfirm(cot)
  }

  async function confirmarEliminarCotizacion() {
    const cot = cotizacionEliminarConfirm
    if (!cot?.id) return
    const num = numeroCotizacionVisible(cot)
    setEliminandoCotizacion(true)
    try {
      await eliminarCotizacionCompleta(supabase, cot.id)
      setCotizacionEliminarConfirm(null)
      onNotice?.(`Cotización #${num ?? cot.id} eliminada`)
      await recargar()
    } catch (e) {
      onError?.(`Error al eliminar cotización: ${e.message}`)
    } finally {
      setEliminandoCotizacion(false)
    }
  }

  async function nuevaCotizacionCliente() {
    if (!puedeEliminar) {
      mostrarSinPermiso()
      return
    }
    if (!cliente?.id) return
    try {
      const nueva = await crearCotizacionVacia(supabase, cliente.id)
      onSelectCotizacion?.({ cliente, cotizacion: cotizacionResumenParaPantalla(nueva) })
      onNotice?.('Cotización nueva lista')
    } catch (e) {
      onError?.(`Error al crear cotización: ${e.message}`)
    }
  }

  const titulo = cliente?.nombre ? `Cotizaciones — ${cliente.nombre}` : 'Cotizaciones del cliente'

  return (
    <div className="cliente-cotizaciones-lista">
      <div className="toolbar cliente-cotizaciones-lista-toolbar">
        <button type="button" className="secondary" onClick={onSalir}>
          ← Volver
        </button>
        <h2 className="cliente-cotizaciones-lista-titulo">{titulo}</h2>
      </div>

      <div className="cliente-cotizaciones-lista-body modal-body--ordenes-cliente">
        <ClientesCotizacionesPanel
          loading={loading}
          errorSubtitle={errorSubtitle}
          resumen={resumen}
          cotizaciones={cotizaciones}
          onSelectCotizacion={(cot) =>
            onSelectCotizacion?.({ cliente, cotizacion: cotizacionResumenParaPantalla(cot) })
          }
          puedeEliminar={puedeEliminar}
          puedeCrear={puedeEliminar}
          onEliminarCotizacion={(cot) => intentarEliminar(() => solicitarEliminarCotizacion(cot))}
        />
      </div>

      <div className="ventas-acciones cliente-cotizaciones-lista-acciones">
        {puedeEliminar ? (
          <button type="button" className="btn-comprobante-ventas" onClick={() => void nuevaCotizacionCliente()}>
            Nueva cotización
          </button>
        ) : null}
        <button type="button" className="btn-salir-ventas" onClick={onSalir}>
          ❌ SALIR
        </button>
      </div>

      {cotizacionEliminarConfirm ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !eliminandoCotizacion && setCotizacionEliminarConfirm(null)}
        >
          <div
            className="modal modal-narrow modal-alerta modal-alerta--error"
            role="alertdialog"
            aria-labelledby="eliminar-cotizacion-lista-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 id="eliminar-cotizacion-lista-titulo">Eliminar cotización</h3>
            </div>
            <div className="modal-body">
              <p>
                ¿Eliminar la cotización #
                {numeroCotizacionVisible(cotizacionEliminarConfirm) ?? cotizacionEliminarConfirm.id} de{' '}
                {cliente?.nombre || 'este cliente'}?
              </p>
              <p className="muted">Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-footer modal-footer-wrap">
              <button
                type="button"
                className="secondary"
                disabled={eliminandoCotizacion}
                onClick={() => setCotizacionEliminarConfirm(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={eliminandoCotizacion}
                onClick={() => void confirmarEliminarCotizacion()}
              >
                {eliminandoCotizacion ? 'Eliminando…' : 'Sí, eliminar cotización'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AlertaPermiso {...alertaPermiso} />
    </div>
  )
}
