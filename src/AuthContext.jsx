import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getSupabaseClient } from './supabaseClient.js'
import { useAppConfig } from './AppConfigContext.jsx'

const AuthContext = createContext(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}

function LoginAvatar() {
  return (
    <div className="auth-login-avatar" aria-hidden>
      <span className="auth-login-avatar-orbit" />
      <span className="auth-login-avatar-s">S</span>
    </div>
  )
}

function redirectUrlRecuperacion() {
  // HashRouter: la URL base del sitio (sin #) debe estar en Redirect URLs de Supabase.
  const { origin, pathname } = window.location
  return `${origin}${pathname || '/'}`
}

function urlPareceRecuperacionPassword() {
  try {
    const hash = String(window.location.hash ?? '')
    const search = String(window.location.search ?? '')
    const blob = `${hash}&${search}`.toLowerCase()
    return (
      blob.includes('type=recovery') ||
      blob.includes('type%3drecovery') ||
      (blob.includes('access_token') && blob.includes('recovery'))
    )
  } catch {
    return false
  }
}

function LoginScreen({ supabase, onSignedIn }) {
  const { config } = useAppConfig()
  const [modo, setModo] = useState('login') // 'login' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setOkMsg('')
    const mail = email.trim()
    if (!mail || !password) {
      setError('Ingrese correo y contraseña.')
      return
    }
    setLoading(true)
    try {
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: mail,
        password,
      })
      if (signError) throw signError
      if (data.session) onSignedIn(data.session)
    } catch (err) {
      const msg = String(err?.message ?? err)
      if (/invalid login credentials/i.test(msg)) {
        setError('Correo o contraseña incorrectos.')
      } else if (/email not confirmed/i.test(msg)) {
        setError('Confirme su correo en el enlace enviado por Supabase antes de entrar.')
      } else {
        setError(msg || 'No se pudo iniciar sesión.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    setOkMsg('')
    const mail = email.trim()
    if (!mail) {
      setError('Ingrese su correo para recuperar la contraseña.')
      return
    }
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(mail, {
        redirectTo: redirectUrlRecuperacion(),
      })
      if (resetError) throw resetError
      setOkMsg(
        'Si el correo está registrado, enviamos un enlace para restablecer la contraseña. Revise su bandeja y spam.',
      )
    } catch (err) {
      const msg = String(err?.message ?? err)
      if (/rate limit|too many/i.test(msg)) {
        setError('Demasiados intentos. Espere unos minutos e intente de nuevo.')
      } else {
        setError(msg || 'No se pudo enviar el correo de recuperación.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-login-shell home-page-shell">
      <div className="home-page-bg" aria-hidden />
      <div className="auth-login-inner home-page-inner">
        <div className="auth-login-card">
          <LoginAvatar />
          <h1 className="auth-login-title">
            {modo === 'forgot' ? 'Recuperar contraseña' : config.loginTitulo}
          </h1>
          <p className="auth-login-sub">
            {modo === 'forgot'
              ? 'Escriba su correo y le enviaremos un enlace para crear una nueva contraseña.'
              : config.loginSubtitulo}
          </p>

          {modo === 'login' ? (
            <form className="auth-login-form" onSubmit={handleSubmit}>
              <label className="auth-login-field">
                <span>{config.loginLabelCorreo}</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={config.loginPlaceholderCorreo}
                  disabled={loading}
                  required
                />
              </label>
              <label className="auth-login-field">
                <span>{config.loginLabelPassword}</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={config.loginPlaceholderPassword}
                  disabled={loading}
                  required
                />
              </label>
              {error ? (
                <p className="auth-login-error" role="alert">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="auth-login-submit" disabled={loading}>
                {loading ? 'Entrando…' : config.loginBoton}
              </button>
              <button
                type="button"
                className="auth-login-forgot"
                disabled={loading}
                onClick={() => {
                  setError('')
                  setOkMsg('')
                  setModo('forgot')
                }}
              >
                ¿Olvidé mi contraseña?
              </button>
            </form>
          ) : (
            <form className="auth-login-form" onSubmit={handleForgot}>
              <label className="auth-login-field">
                <span>{config.loginLabelCorreo}</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={config.loginPlaceholderCorreo}
                  disabled={loading}
                  required
                />
              </label>
              {error ? (
                <p className="auth-login-error" role="alert">
                  {error}
                </p>
              ) : null}
              {okMsg ? (
                <p className="auth-login-ok" role="status">
                  {okMsg}
                </p>
              ) : null}
              <button type="submit" className="auth-login-submit" disabled={loading}>
                {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
              </button>
              <button
                type="button"
                className="auth-login-forgot"
                disabled={loading}
                onClick={() => {
                  setError('')
                  setOkMsg('')
                  setModo('login')
                }}
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          )}

          {modo === 'login' ? (
            <p className="auth-login-hint muted small">{config.loginHint}</p>
          ) : (
            <p className="auth-login-hint muted small">
              El enlace caduca en poco tiempo. Si no llega el correo, revise spam o pida a un admin que
              restablezca la cuenta en Supabase.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function ResetPasswordScreen({ supabase, onDone }) {
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setOkMsg('')
    if (password.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== password2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    try {
      const { error: upError } = await supabase.auth.updateUser({ password })
      if (upError) throw upError
      setOkMsg('Contraseña actualizada. Ya puede usar el sistema.')
      setTimeout(() => onDone?.(), 900)
    } catch (err) {
      setError(String(err?.message ?? err) || 'No se pudo actualizar la contraseña.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-login-shell home-page-shell">
      <div className="home-page-bg" aria-hidden />
      <div className="auth-login-inner home-page-inner">
        <div className="auth-login-card">
          <LoginAvatar />
          <h1 className="auth-login-title">Nueva contraseña</h1>
          <p className="auth-login-sub">Defina una contraseña nueva para su cuenta.</p>
          <form className="auth-login-form" onSubmit={handleSubmit}>
            <label className="auth-login-field">
              <span>Nueva contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                disabled={loading}
                required
              />
            </label>
            <label className="auth-login-field">
              <span>Confirmar contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Repita la contraseña"
                disabled={loading}
                required
              />
            </label>
            {error ? (
              <p className="auth-login-error" role="alert">
                {error}
              </p>
            ) : null}
            {okMsg ? (
              <p className="auth-login-ok" role="status">
                {okMsg}
              </p>
            ) : null}
            <button type="submit" className="auth-login-submit" disabled={loading}>
              {loading ? 'Guardando…' : 'Guardar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

/**
 * Exige sesión Supabase cuando hay URL/key configurados.
 * Sin Supabase (modo local) deja pasar sin login.
 */
export function AuthProvider({ children }) {
  const supabase = useMemo(() => getSupabaseClient(), [])
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(() => !supabase)
  const [recoveryMode, setRecoveryMode] = useState(() => urlPareceRecuperacionPassword())

  useEffect(() => {
    if (!supabase) return undefined
    let mounted = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) console.warn('Auth getSession:', error.message)
      setSession(data.session ?? null)
      if (urlPareceRecuperacionPassword()) setRecoveryMode(true)
      setAuthReady(true)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true)
      }
      setSession(nextSession)
      setAuthReady(true)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [supabase])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setSession(null)
    setRecoveryMode(false)
  }, [supabase])

  const value = useMemo(
    () => ({
      supabase,
      session,
      user: session?.user ?? null,
      signOut,
      requiresAuth: Boolean(supabase),
    }),
    [supabase, session, signOut],
  )

  if (!authReady) {
    return (
      <div className="auth-login-shell home-page-shell">
        <div className="home-page-bg" aria-hidden />
        <div className="auth-login-inner home-page-inner">
          <p className="auth-login-loading muted">Verificando sesión…</p>
        </div>
      </div>
    )
  }

  if (supabase && recoveryMode && session) {
    return (
      <ResetPasswordScreen
        supabase={supabase}
        onDone={() => {
          setRecoveryMode(false)
          // Limpia tokens de recuperación de la URL si quedaron en el hash.
          try {
            const path = `${window.location.pathname}${window.location.search}`
            window.history.replaceState(null, '', path || '/')
          } catch {
            /* ignore */
          }
        }}
      />
    )
  }

  if (supabase && !session) {
    return <LoginScreen supabase={supabase} onSignedIn={setSession} />
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
