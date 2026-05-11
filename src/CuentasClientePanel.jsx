/**
 * Pantalla de cuentas del cliente (equivalente al AlertDialog de ClientesScreen.kt al pulsar «Cuentas»):
 * barra superior, resumen del cliente, lista de tarjetas y botones Nueva Cuenta / Cerrar.
 */
export default function CuentasClientePanel({
  cliente,
  title,
  subtitle,
  cuentas,
  repsPorReparaId,
  loading,
  onClose,
  onSelectCuenta,
  onNuevaCuenta,
}) {
  function repFor(reparaId) {
    if (reparaId == null || reparaId === '') return null
    return repsPorReparaId[reparaId] ?? repsPorReparaId[String(reparaId)] ?? repsPorReparaId[Number(reparaId)] ?? null
  }

  function fmtFecha(v) {
    if (v == null || v === '') return null
    const s = String(v)
    return s.length > 16 ? `${s.slice(0, 10)} ${s.slice(11, 16)}` : s
  }

  return (
    <div className="cuentas-cliente-overlay" role="dialog" aria-modal="true" aria-labelledby="cuentas-cliente-heading">
      <div className="cuentas-cliente-shell servicios-root">
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
          <section className="cuentas-cliente-resumen">
            <h2 className="cuentas-cliente-nombre">{cliente?.nombre || 'Cliente'}</h2>
            <p className="cuentas-cliente-meta">📞 {cliente?.telefono || 'Sin teléfono'}</p>
            {cliente?.domicilio ? <p className="cuentas-cliente-meta muted">🏠 {cliente.domicilio}</p> : null}
            {cliente?.correo ? <p className="cuentas-cliente-meta muted">✉️ {cliente.correo}</p> : null}
          </section>

          {subtitle && title !== 'Error' ? <p className="cuentas-cliente-lead">{subtitle}</p> : null}

          {loading ? (
            <div className="cuentas-cliente-loading">
              <p>Cargando…</p>
            </div>
          ) : cuentas.length === 0 ? (
            <div className="cuentas-cliente-empty empty-card">
              <p>{title === 'Error' ? subtitle || 'Error al buscar cuentas' : 'No se encontraron cuentas para este cliente'}</p>
            </div>
          ) : (
            <ul className="cuentas-cliente-list">
              {cuentas.map((cuenta) => {
                const rep = repFor(cuenta.repara_id)
                const creada = fmtFecha(cuenta.created_at ?? cuenta.createdAt)
                const liq = fmtFecha(cuenta.fecha_liquidada ?? cuenta.fechaLiquidada)
                const tipoPago = cuenta.tipo_pago ?? cuenta.tipoPago ?? ''
                return (
                  <li key={cuenta.id}>
                    <button type="button" className="cuenta-tarjeta-android" onClick={() => onSelectCuenta?.(cuenta)}>
                      <strong className="cuenta-tarjeta-titulo">
                        {cuenta.repara_id != null && cuenta.repara_id !== ''
                          ? `No de Orden: ${cuenta.repara_id}`
                          : `ID: ${cuenta.id}`}
                      </strong>
                      {cuenta.repara_id != null && cuenta.id != null ? (
                        <span className="cuenta-tarjeta-linea muted small">ID cuenta: {cuenta.id}</span>
                      ) : null}
                      {rep?.descripcion_equipo ? (
                        <span className="cuenta-tarjeta-linea muted small">Equipo: {rep.descripcion_equipo}</span>
                      ) : null}
                      {tipoPago ? (
                        <span className="cuenta-tarjeta-linea muted small">Tipo de pago: {tipoPago}</span>
                      ) : null}
                      <span className="cuenta-tarjeta-linea muted small">
                        Total: ${Number(cuenta.total ?? 0).toFixed(2)}
                      </span>
                      <span className="cuenta-tarjeta-linea muted small">Estado: {cuenta.estatus ?? '—'}</span>
                      {creada ? <span className="cuenta-tarjeta-linea muted tiny">Creada: {creada}</span> : null}
                      {liq ? <span className="cuenta-tarjeta-linea muted tiny">Liquidada: {liq}</span> : null}
                    </button>
                  </li>
                )
              })}
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
