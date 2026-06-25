/**
 * Catálogo de técnicos para asignar en órdenes.
 * - Lista base en código (DEFAULT_TECNICOS)
 * - Copia local por navegador (localStorage)
 * - Copia compartida en Supabase (app_config.tecnicos) para todas las PCs
 *
 * Formato en `reparaciones.tecnico`:
 *   - Un técnico:    "JUAN"
 *   - Dos técnicos:  "JUAN & VERO"
 */

import { obtenerAppConfigCrudo } from './appConfigApi.js'

const LS_KEY = 'sistefix_local_tecnicos'
export const DEFAULT_TECNICOS = ['ANDRES', 'ARTURO', 'VERO', 'JUAN', 'MIGUEL', 'ZUMAYA']

/** Nombres mal escritos → forma correcta en catálogo y órdenes. */
export const CORRECCIONES_NOMBRE_TECNICO = {
  JARETNY: 'JARENY',
}

function normalizar(t) {
  return String(t ?? '').trim().toUpperCase()
}

export function corregirNombreTecnico(n) {
  const u = normalizar(n)
  return CORRECCIONES_NOMBRE_TECNICO[u] ?? u
}

function ordenarTecnicos(lista) {
  return [...lista].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
}

function unificarListas(...listas) {
  const set = new Set()
  for (const lista of listas) {
    for (const t of lista ?? []) {
      const n = corregirNombreTecnico(t)
      if (n) set.add(n)
    }
  }
  return ordenarTecnicos([...set])
}

/** Catálogo local (defaults + lo guardado en este navegador). */
export function leerTecnicos() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw == null) return unificarListas(DEFAULT_TECNICOS)
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return unificarListas(DEFAULT_TECNICOS)
    return unificarListas(DEFAULT_TECNICOS, list)
  } catch {
    return unificarListas(DEFAULT_TECNICOS)
  }
}

export function guardarTecnicos(list) {
  const limpios = unificarListas(list)
  localStorage.setItem(LS_KEY, JSON.stringify(limpios))
  return limpios
}

/** Lee tecnicos desde app_config en Supabase (todas las PCs). */
export async function leerTecnicosRemotos(supabase) {
  if (!supabase?.rpc) return []
  try {
    const config = await obtenerAppConfigCrudo(supabase)
    if (!Array.isArray(config?.tecnicos)) return []
    return config.tecnicos.map((t) => corregirNombreTecnico(t)).filter(Boolean)
  } catch {
    return []
  }
}

/** Defaults + servidor + localStorage de esta PC. */
export async function cargarTecnicosUnificados(supabase) {
  const remoto = await leerTecnicosRemotos(supabase)
  const local = leerTecnicos()
  return unificarListas(DEFAULT_TECNICOS, remoto, local)
}

/** Guarda en localStorage y, si puede, en app_config (requiere usuario admin). */
export async function sincronizarTecnicosAlServidor(supabase, lista) {
  const limpios = guardarTecnicos(lista)
  if (!supabase?.rpc) return limpios
  try {
    const actual = await obtenerAppConfigCrudo(supabase)
    const merged = { ...actual, tecnicos: limpios }
    const { error } = await supabase.rpc('guardar_app_config', { p_config: merged })
    if (error) throw error
  } catch (e) {
    console.warn('No se pudo sincronizar técnicos al servidor:', e?.message ?? e)
  }
  return limpios
}

export async function agregarTecnico(nombre, supabase = null) {
  const n = corregirNombreTecnico(nombre)
  if (!n) return leerTecnicos()
  const lista = leerTecnicos()
  if (lista.includes(n)) return lista
  return sincronizarTecnicosAlServidor(supabase, [...lista, n])
}

export async function renombrarTecnico(nombreAnterior, nombreNuevo, supabase = null) {
  const ant = corregirNombreTecnico(nombreAnterior)
  const neu = corregirNombreTecnico(nombreNuevo)
  if (!ant || !neu || ant === neu) return leerTecnicos()
  const lista = leerTecnicos().filter((t) => t !== ant)
  if (!lista.includes(neu)) lista.push(neu)
  return sincronizarTecnicosAlServidor(supabase, unificarListas(lista))
}

export async function eliminarTecnico(nombre, supabase = null) {
  const n = corregirNombreTecnico(nombre)
  const lista = leerTecnicos().filter((t) => t !== n)
  return sincronizarTecnicosAlServidor(supabase, lista)
}

/** Combina hasta 2 técnicos en una cadena con " & ". */
export function combinarTecnicos(a, b) {
  const x = corregirNombreTecnico(a)
  const y = corregirNombreTecnico(b)
  if (x && y && x !== y) return `${x} & ${y}`
  return x || y || ''
}

/** Separa una cadena "X & Y" en sus dos partes. */
export function separarTecnicos(s) {
  const raw = String(s ?? '').trim()
  if (!raw) return ['', '']
  const partes = raw.split(/\s*&\s*/).map(corregirNombreTecnico).filter(Boolean)
  return [partes[0] ?? '', partes[1] ?? '']
}
