import { useMemo, useState } from 'react'
import { saldoDesdeCuenta } from './reparacionUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'

const LS_VISTA_CUENTAS_CLIENTE = 'sistefix_clientes_cuentas_vista'

function leerVistaCuentas() {
  try {
    return localStorage.getItem(LS_VISTA_CUENTAS_CLIENTE) === 'tabla' ? 'tabla' : 'tarjetas'
  } catch {
    return 'tarjetas'
  }
}

function fmtFechaCuenta(v) {
  if (v == null || v === '') return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Lista de cuentas del cliente en el modal «Cuentas / Ventas» (tarjetas o tabla).
 */
export default function ClientesCuentasVentasPanel({
  loading,
  errorSubtitle,
  cuentaResumen,
  cuentas = [],
  pagosCliente = [],
  onSelectCuenta,
}) {
  const [vista, setVista] = useState(leerVistaCuentas)

  function cambiarVista(modo) {
    setVista(modo)
    try {
      localStorage.setItem(LS_VISTA_CUENTAS_CLIENTE, modo)
    } catch {
      /* ignore */
    }
  }

  const pagosPorCuenta = useMemo(() => {
    const m = new Map()
    for (const p of pagosCliente) {
      const cid = p?.cuenta_id
      if (cid == null) continue
      const key = String(cid)
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(p)
    }
    return m
  }, [pagosCliente])

  const filas = useMemo(() => {
    return cuentas.map((cuenta) => {
      const pagosC = pagosPorCuenta.get(String(cuenta.id)) ?? []
      const total = Number(cuenta.total ?? 0)
      const saldo = saldoDesdeCuenta(cuenta, pagosC)
      const tipoPago = String(cuenta.tipo_pago ?? cuenta.tipoPago ?? '').trim()
      const estatus = String(cuenta.estatus ?? '—').trim() || '—'
      const estatusUpper = estatus.toUpperCase()
      const liquidada = estatusUpper === 'LIQUIDADA'
      const pagadaActiva = estatusUpper === 'PAGADA'
      const ordenRef =
        cuenta.repara_id != null &&
        cuenta.repara_id !== '' &&
        String(cuenta.repara_id) !== String(cuenta.id)
          ? String(cuenta.repara_id)
          : null
      return {
        cuenta,
        idCuenta: cuenta.id != null ? String(cuenta.id) : '—',
        fechaCreacion: fmtFechaCuenta(cuenta.created_at ?? cuenta.createdAt),
        total,
        saldo,
        estatus,
        liquidada,
        pagadaActiva,
        tipoPago: tipoPago || '—',
        ordenRef,
      }
    })
  }, [cuentas, pagosPorCuenta])

  if (loading) {
    return <p className="center">Cargando…</p>
  }

  if (errorSubtitle) {
    return <p className="warning-inline">{errorSubtitle}</p>
  }

  return (
    <>
      {cuentaResumen ? (
        cuentaResumen.total > 0 ? (
          <div className="rep-ordenes-resumen-caja" role="status" aria-live="polite">
            <div className="rep-ordenes-resumen-cliente">
              <span className="rep-ordenes-resumen-ico" aria-hidden>
                👤
              </span>
              <span className="rep-ordenes-resumen-nombre">{cuentaResumen.nombre}</span>
            </div>
            <div className="rep-ordenes-resumen-stats">
              <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--total">
                <span aria-hidden>💳</span> {cuentaResumen.total}{' '}
                {cuentaResumen.total === 1 ? 'cuenta' : 'cuentas'}
              </span>
              <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--taller">
                <span aria-hidden>⏳</span> {cuentaResumen.pendientes} pendiente
                {cuentaResumen.pendientes === 1 ? '' : 's'}
              </span>
              <span className="rep-ordenes-resumen-chip rep-ordenes-resumen-chip--ok">
                <span aria-hidden>✅</span> {cuentaResumen.liquidadas}{' '}
                {cuentaResumen.liquidadas === 1 ? 'liquidada' : 'liquidadas'}
              </span>
            </div>
          </div>
        ) : (
          <div className="rep-ordenes-resumen-caja rep-ordenes-resumen-caja--vacio" role="status" aria-live="polite">
            <div className="rep-ordenes-resumen-cliente">
              <span className="rep-ordenes-resumen-ico" aria-hidden>
                👤
              </span>
              <span className="rep-ordenes-resumen-nombre">{cuentaResumen.nombre}</span>
            </div>
            <p className="rep-ordenes-resumen-vacio-msg">Sin cuentas registradas.</p>
            <p className="rep-ordenes-resumen-vacio-sugerencia">
              Pulse «Nueva cuenta» para registrar la primera cuenta (venta sin orden de servicio).
            </p>
          </div>
        )
      ) : null}

      {filas.length > 0 ? (
        <>
          <div className="cuentas-cliente-vista-bar clientes-ordenes-vista-bar" role="group" aria-label="Forma de ver las cuentas">
            <button
              type="button"
              className={`cuentas-cliente-vista-btn${vista === 'tarjetas' ? ' cuentas-cliente-vista-btn--active' : ''}`}
              onClick={() => cambiarVista('tarjetas')}
              aria-pressed={vista === 'tarjetas'}
            >
              🗂️ Tarjetas
            </button>
            <button
              type="button"
              className={`cuentas-cliente-vista-btn${vista === 'tabla' ? ' cuentas-cliente-vista-btn--active' : ''}`}
              onClick={() => cambiarVista('tabla')}
              aria-pressed={vista === 'tabla'}
            >
              📊 Tabla
            </button>
          </div>

          {vista === 'tabla' ? (
            <TablaScrollSuperior
              ariaLabel="Cuentas del cliente en tabla"
              classNameWrap="cuentas-cliente-tabla-wrap clientes-ordenes-tabla-wrap"
              syncDeps={[vista, filas, loading]}
            >
              <table className="cuentas-cliente-tabla cuentas-cliente-tabla--resumen clientes-ordenes-tabla">
                <thead>
                  <tr>
                    <th>ID cuenta</th>
                    <th>Fecha creación</th>
                    <th>Total</th>
                    <th>Saldo</th>
                    <th>Estatus</th>
                    <th>Tipo pago</th>
                    <th aria-label="Abrir cuenta">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={f.cuenta.id}
                      className={`clientes-ordenes-tabla-fila clientes-ordenes-tabla-fila--clic${f.liquidada ? ' clientes-cuentas-fila--liquidada' : ''}${f.pagadaActiva ? ' clientes-cuentas-fila--pagada' : ''}`}
                      role="button"
                      tabIndex={0}
                      title={`Abrir cuenta #${f.idCuenta}`}
                      onClick={() => onSelectCuenta?.(f.cuenta)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onSelectCuenta?.(f.cuenta)
                        }
                      }}
                    >
                      <td className="cuentas-cliente-tabla-orden">{f.idCuenta}</td>
                      <td className="cuentas-cliente-tabla-fecha">{f.fechaCreacion}</td>
                      <td className="cuentas-cliente-tabla-total">${f.total.toFixed(2)}</td>
                      <td
                        className={`cuentas-cliente-tabla-total${f.saldo > 0.0001 ? ' cuenta-tarjeta-saldo-pend' : ''}`}
                      >
                        ${f.saldo.toFixed(2)}
                      </td>
                      <td>
                        <span
                          className={`rep-orden-badge rep-orden-badge--tabla${f.liquidada ? ' rep-orden-badge--entregada' : f.pagadaActiva ? ' rep-orden-badge--pagada' : ' rep-orden-badge--activa'}`}
                        >
                          {f.pagadaActiva ? 'Pagada (activa)' : f.estatus}
                        </span>
                      </td>
                      <td>{f.tipoPago}</td>
                      <td className="cuentas-cliente-tabla-acciones">
                        <button
                          type="button"
                          className="cuentas-cliente-btn-abrir"
                          onClick={(e) => {
                            e.stopPropagation()
                            onSelectCuenta?.(f.cuenta)
                          }}
                        >
                          Ver →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TablaScrollSuperior>
          ) : (
            <ul className="rep-activa-list cuentas-cliente-list">
              {filas.map((f) => (
                <li key={f.cuenta.id}>
                  <button
                    type="button"
                    className={`rep-activa-card cuenta-tarjeta-android cuentas-cliente-tile${f.liquidada ? ' rep-orden-entregada' : ''}${f.pagadaActiva ? ' rep-orden-pagada' : ''}`}
                    onClick={() => onSelectCuenta?.(f.cuenta)}
                  >
                    <span
                      className={`rep-orden-badge${f.liquidada ? ' rep-orden-badge--entregada' : f.pagadaActiva ? ' rep-orden-badge--pagada' : ' rep-orden-badge--activa'}`}
                    >
                      {f.pagadaActiva ? 'Pagada (activa)' : f.estatus}
                    </span>
                    <strong>💳 Cuenta #{f.idCuenta}</strong>
                    {f.ordenRef ? (
                      <span className="rep-activa-dato muted small">
                        <span className="rep-activa-etiqueta">Orden:</span> {f.ordenRef}
                      </span>
                    ) : (
                      <span className="small muted">Venta sin orden de servicio</span>
                    )}
                    <span className="rep-activa-dato">
                      <span className="rep-activa-etiqueta">Creación:</span> {f.fechaCreacion}
                    </span>
                    <span className="cuenta-tarjeta-totales">
                      <span className="cuenta-tarjeta-total-principal">
                        Total: <strong>${f.total.toFixed(2)}</strong>
                      </span>
                      <span
                        className={`cuenta-tarjeta-saldo-linea${f.saldo > 0.0001 ? ' cuenta-tarjeta-saldo-linea--pend' : ''}`}
                      >
                        Saldo: <strong>${f.saldo.toFixed(2)}</strong>
                      </span>
                    </span>
                    <span className="rep-activa-dato">
                      <span className="rep-activa-etiqueta">Tipo pago:</span> {f.tipoPago}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </>
  )
}
