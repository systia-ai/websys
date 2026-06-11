import { useState } from 'react'
import AdministracionConfiguracionPanel from './AdministracionConfiguracionPanel.jsx'
import AdministracionAppConfigPanel from './AdministracionAppConfigPanel.jsx'

export default function AdministracionConfiguracionTabs({
  supabase,
  puedeConfigurarPermisos = false,
  puedeConfigurarSistema = false,
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
        {puedeConfigurarSistema ? (
          <button
            type="button"
            className={`administracion-config-subtab${subTab === 'sistema' ? ' administracion-config-subtab--active' : ''}`}
            onClick={() => setSubTab('sistema')}
          >
            🎨 Configuración del sistema
          </button>
        ) : null}
      </nav>

      {subTab === 'sistema' && puedeConfigurarSistema ? (
        <AdministracionAppConfigPanel
          supabase={supabase}
          puedeConfigurar={puedeConfigurarSistema}
          onError={onError}
          onNotice={onNotice}
        />
      ) : (
        <AdministracionConfiguracionPanel
          supabase={supabase}
          puedeConfigurar={puedeConfigurarPermisos}
          onError={onError}
          onNotice={onNotice}
          onPermisosActualizados={onPermisosActualizados}
        />
      )}
    </div>
  )
}
