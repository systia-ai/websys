import { useMemo, useState } from 'react'
import { saldoDesdeCuenta, totalCargosCuenta } from './reparacionUtils.js'
import TablaScrollSuperior from './TablaScrollSuperior.jsx'

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

function marcaTiempoPago(pago) {
  const raw = pago?.created_at ?? pago?.fecha ?? pago?.fecha_pago ?? null
  if (!raw) return 0
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : 0
}

function tipoPagoVisible(cuenta, pagosCuenta = []) {
  const ultimoPago = [...pagosCuenta].sort((a, b) => {
    const ta = marcaTiempoPago(a)
    const tb = marcaTiempoPago(b)
    if (ta !== tb) return tb - ta
    return Number(b?.id ?? 0) - Number(a?.id ?? 0)
  })[0]
  const formaPagoReciente = String(ultimoPago?.forma_pago ?? '').trim()
  if (formaPagoReciente) return formaPagoReciente
  const formaCuenta = String(cuenta?.tipo_pago ?? cuenta?.tipoPago ?? '').trim()
  return formaCuenta || '—'
}

/**
 * Pantalla de cuentas del cliente: tarjetas o tabla con datos de la cuenta (total, saldo, estatus).
 */
export default function CuentasClientePanel({
  cliente,
  title,
  subtitle,
  cuentas,
  pagosCliente = [],
  loading,
  onClose,
  onSelectCuenta,
  onNuevaCuenta,
}) {
  const [vista, setVista] = useState('tarjetas')

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
      const total = totalCargosCuenta(cuenta)
      const saldo = saldoDesdeCuenta(cuenta, pagosC)
      return {
        cuenta,
        idCuenta: cuenta.id != null ? String(cuenta.id) : '—',
        fechaCreacion: fmtFechaCuenta(cuenta.created_at ?? cuenta.createdAt),
        total,
        saldo,
        estatus: String(cuenta.estatus ?? '—').trim() || '—',
        tipoPago: tipoPagoVisible(cuenta, pagosC),
        ordenRef:
          cuenta.repara_id != null && cuenta.repara_id !== '' && String(cuenta.repara_id) !== String(cuenta.id)
            ? String(cuenta.repara_id)
            : null,
      }
    })
  }, [cuentas, pagosPorCuenta])

  function lineaTarjeta(etiqueta, valor, { destacar = false, saldoPend = false } = {}) {
    return (
      <span className={`cuenta-tarjeta-linea cuenta-tarjeta-linea--dato${destacar ? ' cuenta-tarjeta-linea--destacar' : ''}`}>
        <span className="cuenta-tarjeta-etiqueta">{etiqueta}:</span>{' '}
        <span className={saldoPend && Number(valor) > 0.0001 ? 'cuenta-tarjeta-saldo-pend' : undefined}>{valor}</span>
      </span>
    )
  }

  return (
    <div className="cuentas-cliente-overlay" role="dialog" aria-modal="true" aria-labelledby="cuentas-cliente-heading">
      <div
        className={`cuentas-cliente-shell servicios-root${vista === 'tabla' ? ' cuentas-cliente-shell--tabla' : ''}`}
      >
        <header className="servicios-appbar">
          <button type="button" className="icon-back" onClick={onClose} aria-label="Cerrar">
            ←
          </button>
          <h1 className="servicios-appbar-title" id="cuentas-cliente-heading">
            {title}
          </h1>
          <span className="servicios-appbar-placeholder" aria-hidden />
        </header>

        <div className="servicios-body cuentas-cliente-body">
          <section className="cuentas-cliente-resumen cuentas-cliente-tile">
            <h2 className="cuentas-cliente-nombre">{cliente?.nombre || 'Cliente'}</h2>
            <p className="cuentas-cliente-meta">📞 {cliente?.telefono || 'Sin teléfono'}</p>
            {cliente?.domicilio ? <p className="cuentas-cliente-meta muted">🏠 {cliente.domicilio}</p> : null}
            {cliente?.correo ? <p className="cuentas-cliente-meta muted">✉️ {cliente.correo}</p> : null}
          </section>

          {subtitle && title !== 'Error' ? <p className="cuentas-cliente-lead">{subtitle}</p> : null}

          {!loading && cuentas.length > 0 ? (
            <div className="cuentas-cliente-vista-bar" role="group" aria-label="Forma de ver las cuentas">
              <button
                type="button"
                className={`cuentas-cliente-vista-btn${vista === 'tarjetas' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                onClick={() => setVista('tarjetas')}
                aria-pressed={vista === 'tarjetas'}
              >
                🗂️ Tarjetas
              </button>
              <button
                type="button"
                className={`cuentas-cliente-vista-btn${vista === 'tabla' ? ' cuentas-cliente-vista-btn--active' : ''}`}
                onClick={() => setVista('tabla')}
                aria-pressed={vista === 'tabla'}
              >
                📊 Tabla
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="cuentas-cliente-loading">
              <p>Cargando…</p>
            </div>
          ) : cuentas.length === 0 ? (
            <div className="cuentas-cliente-empty empty-card">
              <p>{title === 'Error' ? subtitle || 'Error al buscar cuentas' : 'No se encontraron cuentas para este cliente'}</p>
            </div>
          ) : vista === 'tabla' ? (
            <TablaScrollSuperior
              ariaLabel="Cuentas del cliente en tabla"
              classNameWrap="cuentas-cliente-tabla-wrap"
              syncDeps={[vista, filas, loading]}
            >
              <table className="cuentas-cliente-tabla cuentas-cliente-tabla--resumen">
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
                      className="cuentas-cliente-tabla-fila cuentas-cliente-tabla-fila--clic"
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
                        <span className="cuentas-cliente-estatus-pill">{f.estatus}</span>
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
                          title="Abrir cuenta"
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
            <ul className="cuentas-cliente-list">
              {filas.map((f) => (
                <li key={f.cuenta.id}>
                  <button
                    type="button"
                    className="cuenta-tarjeta-android cuentas-cliente-tile"
                    onClick={() => onSelectCuenta?.(f.cuenta)}
                  >
                    <strong className="cuenta-tarjeta-titulo">Cuenta #{f.idCuenta}</strong>
                    {f.ordenRef ? (
                      <span className="cuenta-tarjeta-linea muted small">Orden de servicio: {f.ordenRef}</span>
                    ) : null}
                    {lineaTarjeta('ID cuenta', f.idCuenta)}
                    {lineaTarjeta('Fecha creación', f.fechaCreacion)}
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
                    {lineaTarjeta('Estatus', f.estatus)}
                    {lineaTarjeta('Tipo de pago', f.tipoPago)}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <footer className="cuentas-cliente-footer">
            <button type="button" className="btn-nueva-cuenta-cliente" onClick={onNuevaCuenta}>
              Nueva Cuenta
            </button>
            <button type="button" className="btn-cerrar-cuentas-cliente" onClick={onClose}>
              Cerrar
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
