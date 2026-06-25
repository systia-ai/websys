import { useMemo, useState } from 'react'
import { etiquetaEstatusCotizacion, formatoTotalCotizacion } from './cotizacionUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'

function fmtFecha(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Lista de cotizaciones del cliente en el modal «Cotizaciones».
 */
export default function ClientesCotizacionesPanel({
  loading,
  errorSubtitle,
  resumen,
  cotizaciones = [],
  onSelectCotizacion,
  puedeEliminar = false,
  onEliminarCotizacion,
  puedeCrear = false,
}) {
  const filas = useMemo(() => {
    return cotizaciones.map((c) => {
      const est = String(c.estatus ?? 'BORRADOR').trim().toUpperCase()
      return {
        cotizacion: c,
        id: c.id != null ? String(c.id) : '—',
        fecha: fmtFecha(c.created_at ?? c.createdAt),
        total: formatoTotalCotizacion(c.total ?? 0),
        estatus: etiquetaEstatusCotizacion(est),
        estatusRaw: est,
        convertida: est === 'CONVERTIDA',
        borrador: est === 'BORRADOR',
      }
    })
  }, [cotizaciones])

  if (loading) return <p className="center">Cargando…</p>
  if (errorSubtitle) return <p className="warning-inline">{errorSubtitle}</p>

  return (
    <>
      {resumen ? (
        resumen.total > 0 ? (
          <div className="rep-ordenes-resumen-caja" role="status" aria-live="polite">
            <div className="rep-ordenes-resumen-cliente">
              <span className="rep-ordenes-resumen-ico" aria-hidden>
                📋
              </span>
              <span className="rep-ordenes-resumen-nombre">{resumen.nombre}</span>
            </div>
            <div className="rep-ordenes-resumen-stats">
              <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--total">
                <span aria-hidden>📋</span> {resumen.total}{' '}
                {resumen.total === 1 ? 'cotización' : 'cotizaciones'}
              </span>
              {resumen.activas > 0 ? (
                <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--taller">
                  <span aria-hidden>⏳</span> {resumen.activas} activa{resumen.activas === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rep-ordenes-resumen-caja rep-ordenes-resumen-caja--vacio" role="status">
            <div className="rep-ordenes-resumen-cliente">
              <span className="rep-ordenes-resumen-ico" aria-hidden>
                📋
              </span>
              <span className="rep-ordenes-resumen-nombre">{resumen.nombre}</span>
            </div>
            <p className="rep-ordenes-resumen-vacio-msg">Sin cotizaciones registradas.</p>
            {puedeCrear ? (
              <p className="rep-ordenes-resumen-vacio-sugerencia">
                Pulse «Nueva cotización» para crear la primera.
              </p>
            ) : null}
          </div>
        )
      ) : null}

      {filas.length > 0 ? (
        <TablaScrollSuperior
          ariaLabel="Cotizaciones del cliente"
          classNameWrap="cuentas-cliente-tabla-wrap clientes-ordenes-tabla-wrap"
          syncDeps={[filas, loading]}
        >
          <table className="cuentas-cliente-tabla cuentas-cliente-tabla--resumen clientes-ordenes-tabla">
            <thead>
              <tr>
                <th>No.</th>
                <th>Fecha</th>
                <th>Total</th>
                <th>Estatus</th>
                <th aria-label="Abrir">Abrir</th>
                {puedeEliminar ? <th aria-label="Eliminar">Eliminar</th> : null}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr
                  key={f.cotizacion.id}
                  className="clientes-ordenes-tabla-fila clientes-ordenes-tabla-fila--clic"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectCotizacion?.(f.cotizacion)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectCotizacion?.(f.cotizacion)
                    }
                  }}
                >
                  <td className="cuentas-cliente-tabla-orden">{f.id}</td>
                  <td className="cuentas-cliente-tabla-fecha">{f.fecha}</td>
                  <td className="cuentas-cliente-tabla-total">{f.total}</td>
                  <td>
                    <span
                      className={`rep-orden-badge rep-orden-badge--tabla${f.convertida ? ' rep-orden-badge--entregada' : f.borrador ? ' rep-orden-badge--activa' : ' rep-orden-badge--pagada'}`}
                    >
                      {f.estatus}
                    </span>
                  </td>
                  <td className="cuentas-cliente-tabla-acciones">
                    <button
                      type="button"
                      className="cuentas-cliente-btn-abrir"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectCotizacion?.(f.cotizacion)
                      }}
                    >
                      Ver →
                    </button>
                  </td>
                  {puedeEliminar ? (
                    <td className="cuentas-cliente-tabla-acciones">
                      <button
                        type="button"
                        className="btn-icon delete clientes-lista-btn-icon"
                        disabled={f.convertida}
                        onClick={(e) => {
                          e.stopPropagation()
                          onEliminarCotizacion?.(f.cotizacion)
                        }}
                        title={f.convertida ? 'No se puede eliminar una cotización convertida' : `Eliminar cotización #${f.id}`}
                        aria-label={`Eliminar cotización #${f.id}`}
                      >
                        🗑️
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScrollSuperior>
      ) : null}
    </>
  )
}
