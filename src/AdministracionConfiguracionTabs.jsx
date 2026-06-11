import { useState } from 'react'
import AdministracionConfiguracionPanel from './AdministracionConfiguracionPanel.jsx'
import AdministracionAppConfigPanel from './AdministracionAppConfigPanel.jsx'

export default function AdministracionConfiguracionTabs({
  supabase,
  puedeConfigurar = false,
  onError,
  onNotice,
  onPermisosActualizados,
}) {
  const [subTab, setSubTab] = useState('permisos')

  return (
    <div className="administracion-config-tabs-root">
      <nav className="administracion-config-subnav" aria-label="Tipo de configuración">
        <button
          type="button"
          className={`administracion-config-subtab${subTab === 'permisos' ? ' administracion-config-subtab--active' : ''}`}
          onClick={() => setSubTab('permisos')}
        >
          🔐 Permisos por rol
        </button>
        <button
          type="button"
          className={`administracion-config-subtab${subTab === 'sistema' ? ' administracion-config-subtab--active' : ''}`}
          onClick={() => setSubTab('sistema')}
        >
          🎨 Configuración del sistema
        </button>
      </nav>

      {subTab === 'permisos' ? (
        <AdministracionConfiguracionPanel
          supabase={supabase}
          puedeConfigurar={puedeConfigurar}
          onError={onError}
          onNotice={onNotice}
          onPermisosActualizados={onPermisosActualizados}
        />
      ) : (
        <AdministracionAppConfigPanel
          supabase={supabase}
          puedeConfigurar={puedeConfigurar}
          onError={onError}
          onNotice={onNotice}
        />
      )}
    </div>
  )
}
