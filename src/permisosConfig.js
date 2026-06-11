/** Roles del sistema (orden de mayor a menor privilegio). */
export const ROLES_SISTEMA = ['ADMIN', 'COORDINADOR', 'TECNICO', 'OPERADOR']

export const ETIQUETAS_ROL = {
  ADMIN: 'Administrador',
  COORDINADOR: 'Coordinador',
  TECNICO: 'Técnico',
  OPERADOR: 'Operador',
}

/** Claves de módulos del menú principal (coinciden con `homeMenuItems.key`). */
export const MODULOS_APP = [
  { key: 'clientes', permiso: 'modulo.clientes', titulo: 'Clientes' },
  { key: 'servicios', permiso: 'modulo.servicios', titulo: 'Servicios (Equipos)' },
  {
    key: 'reparaciones',
    permiso: 'modulo.reparaciones',
    titulo: 'Orden de servicio (búsqueda)',
  },
  { key: 'inventarios', permiso: 'modulo.inventarios', titulo: 'Inventarios' },
  { key: 'catalogo_pagos', permiso: 'modulo.catalogo_pagos', titulo: 'Catálogo de pagos' },
  { key: 'corte_caja', permiso: 'modulo.corte_caja', titulo: 'Corte de caja' },
  { key: 'reportes', permiso: 'modulo.reportes', titulo: 'Reportes' },
  { key: 'monitor_ordenes', permiso: 'modulo.monitor_ordenes', titulo: 'Monitor de órdenes' },
  { key: 'administracion', permiso: 'modulo.administracion', titulo: 'Administración' },
]

/** Grupos de permisos mostrados en Configuración. */
export const GRUPOS_PERMISOS = [
  {
    id: 'modulos',
    titulo: 'Acceso a módulos',
    permisos: MODULOS_APP.map((m) => ({
      clave: m.permiso,
      etiqueta: m.titulo,
    })),
  },
  {
    id: 'acciones',
    titulo: 'Permisos de acción',
    permisos: [
      { clave: 'accion.eliminar', etiqueta: 'Eliminar registros' },
      { clave: 'accion.cambiar_roles', etiqueta: 'Asignar roles a usuarios' },
      { clave: 'accion.configurar_permisos', etiqueta: 'Configurar permisos por rol' },
      { clave: 'accion.reportes_fechas', etiqueta: 'Reportes: elegir rango de fechas' },
      { clave: 'accion.corte_fechas', etiqueta: 'Corte de caja: elegir rango de fechas' },
      { clave: 'accion.liquidar_cuentas', etiqueta: 'Liquidar cuentas en Ventas' },
      { clave: 'accion.gestion_tecnicos', etiqueta: 'Monitor: gestionar catálogo de técnicos' },
    ],
  },
]

const LS_PERMISOS_ROLES = 'sistefix_permisos_roles'

/** Todas las claves de permiso definidas. */
export function todasLasClavesPermiso() {
  const set = new Set()
  for (const g of GRUPOS_PERMISOS) {
    for (const p of g.permisos) set.add(p.clave)
  }
  return [...set]
}

/** Mapa con todos los permisos en `true`. */
export function mapaPermisosTodosActivos() {
  const m = {}
  for (const k of todasLasClavesPermiso()) m[k] = true
  return m
}

export function mapaDesdeListaParcial(parcial = {}) {
  const base = {}
  for (const k of todasLasClavesPermiso()) {
    base[k] = Boolean(parcial[k])
  }
  return base
}

/** Permisos por defecto al crear / restablecer un rol (ADMIN siempre todo en runtime). */
export const PERMISOS_DEFECTO_POR_ROL = {
  ADMIN: mapaPermisosTodosActivos(),
  COORDINADOR: mapaDesdeListaParcial({
    'modulo.clientes': true,
    'modulo.servicios': true,
    'modulo.reparaciones': true,
    'modulo.inventarios': true,
    'modulo.catalogo_pagos': true,
    'modulo.corte_caja': true,
    'modulo.reportes': true,
    'modulo.monitor_ordenes': true,
    'modulo.administracion': true,
    'accion.reportes_fechas': true,
    'accion.corte_fechas': true,
    'accion.liquidar_cuentas': true,
    'accion.gestion_tecnicos': true,
  }),
  TECNICO: mapaDesdeListaParcial({
    'modulo.clientes': true,
    'modulo.servicios': true,
    'modulo.reparaciones': true,
    'modulo.monitor_ordenes': true,
    'accion.gestion_tecnicos': false,
  }),
  OPERADOR: mapaDesdeListaParcial({
    'modulo.clientes': true,
    'modulo.servicios': true,
    'modulo.reparaciones': true,
    'modulo.catalogo_pagos': true,
    'modulo.monitor_ordenes': true,
    'accion.liquidar_cuentas': true,
  }),
}

export function normalizarRolSistema(rol) {
  const r = String(rol ?? 'TECNICO')
    .trim()
    .toUpperCase()
  return ROLES_SISTEMA.includes(r) ? r : 'TECNICO'
}

export function esRolAdmin(rol) {
  return normalizarRolSistema(rol) === 'ADMIN'
}

/** ADMIN siempre tiene todos los permisos (no editable en configuración). */
export function permisosEfectivosRol(rol, overridesPorRol = null) {
  const r = normalizarRolSistema(rol)
  if (r === 'ADMIN') return mapaPermisosTodosActivos()
  const custom = overridesPorRol?.[r]
  if (custom && typeof custom === 'object') {
    return mapaDesdeListaParcial({ ...PERMISOS_DEFECTO_POR_ROL[r], ...custom })
  }
  return { ...PERMISOS_DEFECTO_POR_ROL[r] }
}

export function tienePermiso(permisosMap, clave) {
  if (!clave) return true
  return Boolean(permisosMap?.[clave])
}

export function puedeAccederModulo(permisosMap, moduleKey) {
  const mod = MODULOS_APP.find((m) => m.key === moduleKey)
  if (!mod) return true
  return tienePermiso(permisosMap, mod.permiso)
}

export function leerPermisosRolesLocal() {
  try {
    const raw = localStorage.getItem(LS_PERMISOS_ROLES)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const out = {}
    for (const rol of ROLES_SISTEMA) {
      if (rol === 'ADMIN') continue
      if (parsed[rol] && typeof parsed[rol] === 'object') {
        out[rol] = mapaDesdeListaParcial(parsed[rol])
      }
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

export function guardarPermisosRolesLocal(overridesPorRol) {
  const payload = {}
  for (const rol of ROLES_SISTEMA) {
    if (rol === 'ADMIN') continue
    if (overridesPorRol?.[rol]) payload[rol] = overridesPorRol[rol]
  }
  localStorage.setItem(LS_PERMISOS_ROLES, JSON.stringify(payload))
}
