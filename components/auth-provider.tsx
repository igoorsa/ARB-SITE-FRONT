"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { LogIn, LogOut, ShieldCheck } from "lucide-react"
import { User, UserManager, WebStorageStateStore } from "oidc-client-ts"
import { Button } from "@/components/ui/button"
import { usePreferences } from "@/components/preferences-provider"
import { setApiAccessToken } from "@/lib/api"

interface AuthContextValue {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const cognitoAuthority =
  process.env.NEXT_PUBLIC_COGNITO_AUTHORITY ||
  "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_3VoyBG8YU"
const cognitoClientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "gojrtvik05bqqhdgmuro87m8"
const cognitoScope = process.env.NEXT_PUBLIC_COGNITO_SCOPE || "openid email phone"
const configuredRedirectUri = process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI
const configuredLogoutUri = process.env.NEXT_PUBLIC_COGNITO_LOGOUT_URI
const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN

let userManager: UserManager | null = null

function getRedirectUri() {
  if (configuredRedirectUri) return configuredRedirectUri
  if (typeof window === "undefined") return ""
  return window.location.origin
}

function getLogoutUri() {
  if (configuredLogoutUri) return configuredLogoutUri
  if (typeof window === "undefined") return ""
  return window.location.origin
}

function getUserManager() {
  if (typeof window === "undefined") return null
  if (userManager) return userManager

  userManager = new UserManager({
    authority: cognitoAuthority,
    client_id: cognitoClientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: cognitoScope,
    userStore: new WebStorageStateStore({ store: window.localStorage }),
  })
  return userManager
}

export async function signInRedirect(returnTo = "/monitor") {
  const manager = getUserManager()
  if (!manager) return
  await manager.signinRedirect({ state: { returnTo } })
}

function hasOidcCallbackParams() {
  if (typeof window === "undefined") return false
  const params = new URLSearchParams(window.location.search)
  return Boolean(params.get("code") && params.get("state"))
}

async function handleSignInCallback(manager: UserManager) {
  const callbackUser = await manager.signinRedirectCallback()
  const state = callbackUser.state as { returnTo?: string } | undefined
  return {
    user: callbackUser,
    returnTo: state?.returnTo || "/monitor",
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { t } = usePreferences()
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const signIn = useCallback(async () => {
    const returnTo = `${window.location.pathname}${window.location.search}`
    await signInRedirect(returnTo)
  }, [])

  const signOut = useCallback(async () => {
    const manager = getUserManager()
    await manager?.removeUser()
    setUser(null)

    const logoutUri = getLogoutUri()
    if (cognitoDomain) {
      window.location.href = `${cognitoDomain.replace(/\/+$/, "")}/logout?client_id=${encodeURIComponent(
        cognitoClientId,
      )}&logout_uri=${encodeURIComponent(logoutUri)}`
      return
    }

    window.location.href = logoutUri
  }, [])

  const activeAccessToken = user && !user.expired ? user.access_token : null
  setApiAccessToken(activeAccessToken)

  useEffect(() => {
    let isActive = true
    const manager = getUserManager()
    if (!manager) {
      setIsLoading(false)
      return
    }

    async function loadSession() {
      try {
        if (hasOidcCallbackParams()) {
          const { user: callbackUser, returnTo } = await handleSignInCallback(manager)
          if (!isActive) return
          setUser(callbackUser)
          window.history.replaceState({}, document.title, returnTo)
          return
        }

        const storedUser = await manager.getUser()
        if (!isActive) return
        setUser(storedUser && !storedUser.expired ? storedUser : null)
      } catch (exc) {
        if (!isActive) return
        setError(exc instanceof Error ? exc.message : "Falha ao autenticar")
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    loadSession()

    return () => {
      isActive = false
    }
  }, [])

  const contextValue = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken: activeAccessToken,
      isAuthenticated: Boolean(user && !user.expired),
      signIn,
      signOut,
    }),
    [activeAccessToken, signIn, signOut, user],
  )

  if (isLoading) {
    return <AuthShell title={t("validatingAccess")} description={t("validatingDescription")} />
  }

  if (!contextValue.isAuthenticated) {
    return (
      <AuthShell
        title="Monitor Arb"
        description={error || t("authDescription")}
        action={
          <Button onClick={signIn} className="h-11 px-5">
            <LogIn className="mr-2 h-4 w-4" />
            {t("signIn")}
          </Button>
        }
      />
    )
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthCallbackHandler() {
  useEffect(() => {
    const manager = getUserManager()
    if (!manager || !hasOidcCallbackParams()) return

    handleSignInCallback(manager)
      .then(({ returnTo }) => {
        window.location.replace(returnTo)
      })
      .catch(() => {
        window.history.replaceState({}, document.title, "/")
      })
  }, [])

  return null
}

function AuthShell({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <section className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </section>
    </main>
  )
}

export function AuthLogoutButton() {
  const auth = useAuth()
  const { t } = usePreferences()
  if (!auth?.isAuthenticated) return null

  return (
    <Button variant="outline" size="sm" onClick={auth.signOut} className="h-8 px-2 text-xs sm:px-3">
      <LogOut className="h-4 w-4 sm:mr-2" />
      <span className="hidden sm:inline">{t("signOut")}</span>
    </Button>
  )
}
