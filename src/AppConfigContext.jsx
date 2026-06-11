import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from './supabaseClient.js'
import {
  APP_CONFIG_DEFECTO,
  aplicarAppConfigEnDom,
  normalizarAppConfig,
  urlBannerEfectiva,
  urlLoginLogoEfectiva,
  urlLogoEfectiva,
} from './appConfig.js'
import {
  cargarAppConfigServidor,
  guardarAppConfigServidor,
  restablecerAppConfigServidor,
  subirImagenBranding,
} from './appConfigApi.js'

const AppConfigContext = createContext(null)

export function useAppConfig() {
  const ctx = useContext(AppConfigContext)
  if (!ctx) {
    throw new Error('useAppConfig debe usarse dentro de AppConfigProvider')
  }
  return ctx
}

export function AppConfigProvider({ children }) {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [config, setConfig] = useState(APP_CONFIG_DEFECTO)
  const [ready, setReady] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const recargar = useCallback(async () => {
    const cargada = await cargarAppConfigServidor(supabase)
    const normalizada = normalizarAppConfig(cargada)
    setConfig(normalizada)
    aplicarAppConfigEnDom(normalizada)
    return normalizada
  }, [supabase])

  useEffect(() => {
    let cancelado = false
    void (async () => {
      try {
        await recargar()
      } finally {
        if (!cancelado) setReady(true)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [recargar])

  const guardar = useCallback(
    async (parcial) => {
      setGuardando(true)
      try {
        const next = normalizarAppConfig({ ...config, ...parcial })
        const guardado = await guardarAppConfigServidor(supabase, next)
        setConfig(guardado)
        aplicarAppConfigEnDom(guardado)
        return guardado
      } finally {
        setGuardando(false)
      }
    },
    [supabase, config],
  )

  const subirImagen = useCallback(
    async (file, tipo) => {
      const url = await subirImagenBranding(supabase, file, tipo)
      const campo =
        tipo === 'logo' ? 'logoUrl' : tipo === 'banner' ? 'bannerUrl' : 'loginLogoUrl'
      return guardar({ [campo]: url })
    },
    [guardar],
  )

  const restablecer = useCallback(async () => {
    setGuardando(true)
    try {
      const defecto = await restablecerAppConfigServidor(supabase)
      setConfig(defecto)
      aplicarAppConfigEnDom(defecto)
      return defecto
    } finally {
      setGuardando(false)
    }
  }, [supabase])

  const value = useMemo(
    () => ({
      config,
      ready,
      guardando,
      recargar,
      guardar,
      subirImagen,
      restablecer,
      logoUrl: urlLogoEfectiva(config),
      bannerUrl: urlBannerEfectiva(config),
      loginLogoUrl: urlLoginLogoEfectiva(config),
    }),
    [config, ready, guardando, recargar, guardar, subirImagen, restablecer],
  )

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>
}
