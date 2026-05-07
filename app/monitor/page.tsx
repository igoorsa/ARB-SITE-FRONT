"use client"

import { Component, useCallback, useDeferredValue, useEffect, useMemo, useState, useTransition } from "react"
import { CandlestickChart, CreditCard, FileText, Languages, LogOut, Mail, Moon, Settings2, ShieldAlert, Sun, UserCircle } from "lucide-react"
import { AuthProvider, useAuth } from "@/components/auth-provider"
import { Filters } from "@/components/filters"
import { Header } from "@/components/header"
import { AppLanguage, AppTheme, usePreferences } from "@/components/preferences-provider"
import { SpreadTable } from "@/components/spread-table"
import { StatsCards } from "@/components/stats-cards"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useWebSocket } from "@/hooks/use-websocket"
import { createWebSocketUrl, fetchAccountProfile, fetchLatest } from "@/lib/api"
import type { AccountProfile, FilterState, SpreadItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const MOCK_DATA: SpreadItem[] = [
  {
    pair_key: "gate|binance|BTC/USDT",
    pair_type: "spot_future",
    symbol: "BTC/USDT",
    spot_exchange: "gate",
    futures_exchange: "binance",
    entry_spread_pct: 0.82,
    exit_spread_pct: 0.21,
    entry_volume_usdt: 154320,
    exit_volume_usdt: 98500,
    spot_volume_24h_usdt: 24500000,
    future_volume_24h_usdt: 81300000,
    best_spot_bid: 67234.5,
    best_spot_ask: 67238.2,
    best_future_bid: 67784.3,
    best_future_ask: 67788.1,
    funding_rate: 0.00015,
    updated_at: new Date().toISOString(),
  },
  {
    pair_key: "mexc|binance|ETH/USDT",
    pair_type: "spot_future",
    symbol: "ETH/USDT",
    spot_exchange: "mexc",
    futures_exchange: "binance",
    entry_spread_pct: 1.24,
    exit_spread_pct: 0.45,
    entry_volume_usdt: 89200,
    exit_volume_usdt: 65300,
    spot_volume_24h_usdt: 18700000,
    future_volume_24h_usdt: 54200000,
    best_spot_bid: 3421.5,
    best_spot_ask: 3422.1,
    best_future_bid: 3464.2,
    best_future_ask: 3464.8,
    funding_rate: 0.00032,
    updated_at: new Date().toISOString(),
  },
]

const FILTERS_STORAGE_KEY = "arbitrage-monitor:filters"
const VIEW_STORAGE_KEY = "arbitrage-monitor:view"
const SECTION_STORAGE_KEY = "arbitrage-monitor:section"
const PANEL_SETTINGS_STORAGE_KEY = "arbitrage-monitor:panel-settings"
const MIN_ENTRY_SPREAD_PCT = 0.1

type MonitorView = "spot_future" | "spot_spot"
type AppSection = "monitor" | "settings" | "account" | "terms"

interface PanelSettings {
  compactNumbers: boolean
  confirmBeforeAnalysis: boolean
}

const DEFAULT_FILTERS: FilterState = {
  spot_exchange: [],
  futures_exchange: [],
  coin: "",
  min_entry_spread_pct: MIN_ENTRY_SPREAD_PCT,
  refresh_interval_seconds: 5,
}

const DEFAULT_PANEL_SETTINGS: PanelSettings = {
  compactNumbers: true,
  confirmBeforeAnalysis: false,
}

function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => clearTimeout(timeout)
  }, [value, delay])

  return debouncedValue
}

function resolveMinimumPositiveSpread(userValue: number | undefined): number {
  return Math.max(userValue ?? MIN_ENTRY_SPREAD_PCT, MIN_ENTRY_SPREAD_PCT)
}

function hasPositiveOpportunity(item: SpreadItem): boolean {
  return item.entry_spread_pct > 0
}

export default function MonitorPage() {
  return (
    <AuthProvider>
      <MonitorPageContent />
    </AuthProvider>
  )
}

function MonitorPageContent() {
  const auth = useAuth()
  const { t, language, theme, setLanguage, setTheme } = usePreferences()
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [selectedView, setSelectedView] = useState<MonitorView>("spot_future")
  const [selectedSection, setSelectedSection] = useState<AppSection>("monitor")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [serverData, setServerData] = useState<SpreadItem[]>([])
  const [useMockData, setUseMockData] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTablePending, startTableTransition] = useTransition()
  const [hasLoadedStoredFilters, setHasLoadedStoredFilters] = useState(false)
  const [panelSettings, setPanelSettings] = useState<PanelSettings>(DEFAULT_PANEL_SETTINGS)
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null)
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const stored = window.sessionStorage.getItem(FILTERS_STORAGE_KEY)
      const storedView = window.sessionStorage.getItem(VIEW_STORAGE_KEY)
      const storedSection = window.sessionStorage.getItem(SECTION_STORAGE_KEY)
      const storedPanelSettings = window.sessionStorage.getItem(PANEL_SETTINGS_STORAGE_KEY)
      if (storedView === "spot_future" || storedView === "spot_spot") {
        setSelectedView(storedView)
      }
      if (storedSection === "monitor" || storedSection === "settings" || storedSection === "terms") {
        setSelectedSection(storedSection)
      }
      if (!stored) {
        setHasLoadedStoredFilters(true)
      } else {
        const parsed = JSON.parse(stored) as Partial<FilterState>
        setFilters({
          spot_exchange: Array.isArray(parsed.spot_exchange) ? parsed.spot_exchange : DEFAULT_FILTERS.spot_exchange,
          futures_exchange: Array.isArray(parsed.futures_exchange) ? parsed.futures_exchange : DEFAULT_FILTERS.futures_exchange,
          coin: typeof parsed.coin === "string" ? parsed.coin.toUpperCase() : DEFAULT_FILTERS.coin,
          min_entry_spread_pct:
            typeof parsed.min_entry_spread_pct === "number"
              ? resolveMinimumPositiveSpread(parsed.min_entry_spread_pct)
              : DEFAULT_FILTERS.min_entry_spread_pct,
          refresh_interval_seconds:
            typeof parsed.refresh_interval_seconds === "number"
              ? DEFAULT_FILTERS.refresh_interval_seconds
              : DEFAULT_FILTERS.refresh_interval_seconds,
        })
      }
      if (storedPanelSettings) {
        const parsedSettings = JSON.parse(storedPanelSettings) as Partial<PanelSettings>
        setPanelSettings({
          compactNumbers:
            typeof parsedSettings.compactNumbers === "boolean"
              ? parsedSettings.compactNumbers
              : DEFAULT_PANEL_SETTINGS.compactNumbers,
          confirmBeforeAnalysis:
            typeof parsedSettings.confirmBeforeAnalysis === "boolean"
              ? parsedSettings.confirmBeforeAnalysis
              : DEFAULT_PANEL_SETTINGS.confirmBeforeAnalysis,
        })
      }
    } catch {
      window.sessionStorage.removeItem(FILTERS_STORAGE_KEY)
    } finally {
      setHasLoadedStoredFilters(true)
    }
  }, [])

  const debouncedFilters = useDebouncedValue(filters)
  const minimumPositiveSpread = useMemo(
    () => resolveMinimumPositiveSpread(debouncedFilters.min_entry_spread_pct),
    [debouncedFilters.min_entry_spread_pct]
  )

  useEffect(() => {
    if (!hasLoadedStoredFilters || typeof window === "undefined") {
      return
    }
    window.sessionStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters))
    window.sessionStorage.setItem(VIEW_STORAGE_KEY, selectedView)
    window.sessionStorage.setItem(SECTION_STORAGE_KEY, selectedSection)
    window.sessionStorage.setItem(PANEL_SETTINGS_STORAGE_KEY, JSON.stringify(panelSettings))
  }, [filters, hasLoadedStoredFilters, selectedView, selectedSection, panelSettings])

  const loadAccountProfile = useCallback(async () => {
    if (!auth?.isAuthenticated) {
      setAccountProfile(null)
      return
    }

    setAccountLoading(true)
    setAccountError(null)

    try {
      const profile = await fetchAccountProfile()
      setAccountProfile(profile)
    } catch {
      setAccountProfile(null)
      setAccountError(t("accountLoadError"))
    } finally {
      setAccountLoading(false)
    }
  }, [auth?.isAuthenticated, auth?.accessToken, t])

  useEffect(() => {
    let isActive = true

    loadAccountProfile().finally(() => {
      if (!isActive) {
        return
      }
    })
    return () => {
      isActive = false
    }
  }, [loadAccountProfile])

  const wsUrl = useMemo(() => {
    return createWebSocketUrl({
      pair_type: selectedView,
      spot_exchange: debouncedFilters.spot_exchange || undefined,
      futures_exchange: debouncedFilters.futures_exchange || undefined,
      coin: debouncedFilters.coin || undefined,
      min_entry_spread_pct: minimumPositiveSpread,
      interval_seconds: debouncedFilters.refresh_interval_seconds || 5,
      lite: true,
      delta: true,
      msgpack: true,
      token: auth?.accessToken ?? undefined,
    })
  }, [auth?.accessToken, debouncedFilters, minimumPositiveSpread, selectedView])

  const { data: wsData, isConnected, lastUpdate, hasFreshData } = useWebSocket({
    url: wsUrl,
    enabled: hasLoadedStoredFilters && !useMockData && !isRefreshing,
  })

  useEffect(() => {
    if (!hasLoadedStoredFilters) {
      return
    }
    let isActive = true

    const loadLatestSnapshot = async () => {
      setIsRefreshing(true)

      try {
        const data = await fetchLatest({
          pair_type: selectedView,
          spot_exchange: debouncedFilters.spot_exchange || undefined,
          futures_exchange: debouncedFilters.futures_exchange || undefined,
          coin: debouncedFilters.coin || undefined,
          min_entry_spread_pct: minimumPositiveSpread,
          lite: true,
        })

        if (!isActive) return

        setServerData(data)
        setUseMockData(false)
      } catch {
        if (!isActive) return

        setUseMockData(true)
        setServerData(MOCK_DATA)
      } finally {
        if (isActive) {
          setIsRefreshing(false)
        }
      }
    }

    loadLatestSnapshot()

    return () => {
      isActive = false
    }
  }, [debouncedFilters, hasLoadedStoredFilters, minimumPositiveSpread, selectedView])

  useEffect(() => {
    if (!useMockData && hasFreshData) {
      startTableTransition(() => {
        setServerData((previous) => mergeStableRows(previous, wsData))
      })
    }
  }, [hasFreshData, startTableTransition, useMockData, wsData])

  const displayData = useMemo(() => {
    if (!useMockData) {
      return serverData
    }

    return MOCK_DATA.filter((item) => {
      if (debouncedFilters.coin && !item.symbol.toLowerCase().includes(debouncedFilters.coin.toLowerCase())) {
        return false
      }
      if (
        debouncedFilters.spot_exchange.length > 0 &&
        !debouncedFilters.spot_exchange.some(
          (exchange) => item.spot_exchange.toLowerCase() === exchange.toLowerCase()
        )
      ) {
        return false
      }
      if (
        debouncedFilters.futures_exchange.length > 0 &&
        !debouncedFilters.futures_exchange.some(
          (exchange) => item.futures_exchange.toLowerCase() === exchange.toLowerCase()
        )
      ) {
        return false
      }
      if (
        minimumPositiveSpread &&
        item.entry_spread_pct < minimumPositiveSpread
      ) {
        return false
      }
      return hasPositiveOpportunity(item)
    })
  }, [debouncedFilters, minimumPositiveSpread, serverData, useMockData])

  const deferredDisplayData = useDeferredValue(displayData)
  const activeData = useMemo(
    () =>
      deferredDisplayData.filter(
        (item) =>
          (item.pair_type ?? "spot_future") === selectedView &&
          hasPositiveOpportunity(item) &&
          matchesActiveFilters(item, debouncedFilters, minimumPositiveSpread)
      ),
    [debouncedFilters, deferredDisplayData, minimumPositiveSpread, selectedView]
  )
  const viewMeta = selectedView === "spot_future"
    ? {
        title: "Future x Spot",
        description: t("spotFutureDescription"),
      }
    : {
        title: "Spot x Spot",
        description: t("spotSpotDescription"),
      }
  const accountSummary = useMemo(() => buildAccountSummary(accountProfile, auth?.user?.profile), [accountProfile, auth?.user?.profile])

  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div
        className="contents"
      >
      <div
        className="contents"
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
      >
      <Sidebar collapsible="icon" variant="inset">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>{t("workspace")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={selectedSection === "monitor"}
                    tooltip={t("monitor")}
                    onClick={() => setSelectedSection("monitor")}
                  >
                    <CandlestickChart />
                    <span>{t("monitor")}</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={selectedSection === "monitor" && selectedView === "spot_future"}
                        onClick={() => {
                          setSelectedSection("monitor")
                          setSelectedView("spot_future")
                        }}
                      >
                        <span>Future x Spot</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        isActive={selectedSection === "monitor" && selectedView === "spot_spot"}
                        onClick={() => {
                          setSelectedSection("monitor")
                          setSelectedView("spot_spot")
                        }}
                      >
                        <span>Spot x Spot</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={selectedSection === "settings"}
                    tooltip={t("settings")}
                    onClick={() => setSelectedSection("settings")}
                  >
                    <Settings2 />
                    <span>{t("settings")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={selectedSection === "terms"}
                    tooltip={t("terms")}
                    onClick={() => setSelectedSection("terms")}
                  >
                    <FileText />
                    <span>{t("terms")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={selectedSection === "account"}
                tooltip={t("account")}
                onClick={() => setSelectedSection("account")}
              >
                <UserCircle />
                <span>{t("account")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      </div>

      <SidebarInset>
        <div className="min-h-screen bg-background text-foreground">
          <Header
            isConnected={useMockData ? true : isConnected}
            lastUpdate={useMockData ? new Date() : lastUpdate}
          />

          <main className="container mx-auto px-4 py-6">
            <div className="flex flex-col gap-6">
          {useMockData && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
              <p className="text-sm text-primary">
                <strong>{t("demoMode")}:</strong> {t("demoDescription")}
              </p>
            </div>
          )}

          {selectedSection === "monitor" ? (
            <>
              <Filters filters={filters} onFiltersChange={setFilters} pairType={selectedView} />

              <StatsCards data={activeData} />

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{viewMeta.title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {viewMeta.description}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{activeData.length} {t("results")}</span>
                </div>
                <SpreadTable data={activeData} pairType={selectedView} />
              </section>
            </>
          ) : selectedSection === "settings" ? (
            <SettingsSection
              filters={filters}
              panelSettings={panelSettings}
              selectedView={selectedView}
              language={language}
              theme={theme}
              onFiltersChange={setFilters}
              onPanelSettingsChange={setPanelSettings}
              onSelectedViewChange={setSelectedView}
              onLanguageChange={setLanguage}
              onThemeChange={setTheme}
            />
          ) : selectedSection === "account" ? (
            <AccountErrorBoundary fallback={<AccountFallback error={t("accountLoadError")} />}>
              <AccountSection
                profile={accountProfile}
                summary={accountSummary}
                isLoading={accountLoading}
                error={accountError}
                onRefresh={loadAccountProfile}
                onSignOut={auth?.signOut}
              />
            </AccountErrorBoundary>
          ) : (
            <TermsSection />
          )}
            </div>
          </main>
        </div>
      </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

function mergeStableRows(previous: SpreadItem[], incoming: SpreadItem[]) {
  if (previous.length === 0) {
    return incoming
  }

  const incomingByKey = new Map(incoming.map((item) => [item.pair_key, item]))
  const next: SpreadItem[] = []

  for (const oldItem of previous) {
    const updated = incomingByKey.get(oldItem.pair_key)
    if (updated) {
      next.push(areItemsEquivalent(oldItem, updated) ? oldItem : updated)
      incomingByKey.delete(oldItem.pair_key)
    }
  }

  const remaining = Array.from(incomingByKey.values()).sort((left, right) =>
    left.symbol.localeCompare(right.symbol, "pt-BR")
  )

  return [...next, ...remaining]
}

interface AccountSummary {
  name: string
  detail: string
  email: string
  username: string
  initials: string
  planName: string
}

interface AccountViewModel {
  sub: string
  email: string
  username: string
  displayName: string
  detail: string
  initials: string
  plan: NonNullable<AccountProfile["plan"]>
}

class AccountErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

function AccountFallback({ error }: { error: string }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <UserCircle className="mt-1 h-5 w-5 text-primary" />
        <div>
          <h2 className="text-xl font-semibold text-foreground">Conta</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
        </div>
      </div>
    </section>
  )
}

function AccountSection({
  profile,
  summary,
  isLoading,
  error,
  onRefresh,
  onSignOut,
}: {
  profile: AccountProfile | null
  summary: AccountSummary
  isLoading: boolean
  error: string | null
  onRefresh: () => Promise<void>
  onSignOut?: () => Promise<void>
}) {
  const { t } = usePreferences()
  const account = buildAccountViewModel(profile, summary)
  const limitRows: Array<[string, string]> = [
    [t("monitoredItems"), formatLimit(account.plan.max_latest_items, t("unlimited"))],
    [t("realtimeItems"), formatLimit(account.plan.max_ws_items, t("unlimited"))],
    [t("websocketConnections"), formatLimit(account.plan.max_ws_connections, t("unlimited"))],
    [t("requestsPerMinute"), formatLimit(account.plan.http_requests_per_minute, t("unlimited"))],
    [t("updateInterval"), formatSeconds(account.plan.ws_interval_seconds)],
    [t("candleHistory"), formatMinutes(account.plan.candle_max_minutes, t("unlimited"), t("minutesShort"))],
  ]

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {account.initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-foreground">{t("accountArea")}</h2>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground">
                  {account.plan.name}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("accountDescription")}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void onRefresh()} disabled={isLoading}>
              {t("refreshAccount")}
            </Button>
            <Button variant="outline" onClick={() => void onSignOut?.()}>
              <LogOut className="mr-2 h-4 w-4" />
              {t("signOut")}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <UserCircle className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-semibold text-foreground">{t("accountSettings")}</h3>
          </div>
          <p className="mb-4 text-sm leading-6 text-muted-foreground">{t("accountSettingsDescription")}</p>
          <div className="space-y-3">
            <AccountDataRow label={t("email")} value={account.email || "-"} icon={<Mail className="h-4 w-4" />} />
            <AccountDataRow label={t("username")} value={account.username} />
            <AccountDataRow label={t("userIdentifier")} value={account.sub} mono />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">{t("currentPlan")}</h3>
            </div>
            {isLoading ? <span className="text-xs text-muted-foreground">{t("updating")}</span> : null}
          </div>

          <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-foreground">{account.plan.name}</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{account.plan.description}</p>
              </div>
              <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase text-primary-foreground">
                {account.plan.key}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="mb-3 text-sm font-medium text-muted-foreground">{t("planLimits")}</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {limitRows.map(([label, value]) => (
                <div key={label} className="rounded-xl bg-secondary/35 px-4 py-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function AccountDataRow({
  label,
  value,
  icon,
  mono = false,
}: {
  label: string
  value: string
  icon?: React.ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-secondary/35 px-4 py-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={cn("max-w-[60%] truncate text-right font-medium text-foreground", mono && "font-mono text-xs")}>
        {value}
      </span>
    </div>
  )
}

function normalizeAccountPlan(plan: AccountProfile["plan"] | null | undefined): AccountProfile["plan"] | null {
  if (!plan || typeof plan !== "object") {
    return null
  }

  return {
    key: stringClaim(plan.key) || "free",
    name: stringClaim(plan.name) || "Free",
    description: stringClaim(plan.description) || "-",
    max_ws_items: numberOrNull(plan.max_ws_items),
    max_latest_items: numberOrNull(plan.max_latest_items),
    max_ws_connections: numberOrZero(plan.max_ws_connections),
    http_requests_per_minute: numberOrZero(plan.http_requests_per_minute),
    ws_interval_seconds: numberOrZero(plan.ws_interval_seconds),
    candle_max_minutes: numberOrNull(plan.candle_max_minutes),
    max_entry_spread_pct_by_pair_type:
      plan.max_entry_spread_pct_by_pair_type && typeof plan.max_entry_spread_pct_by_pair_type === "object"
        ? plan.max_entry_spread_pct_by_pair_type
        : {},
  }
}

function buildAccountViewModel(profile: AccountProfile | null, summary: AccountSummary): AccountViewModel {
  const plan = normalizeAccountPlan(profile?.plan) ?? {
    key: "free",
    name: summary.planName || "Free",
    description: "-",
    max_ws_items: null,
    max_latest_items: null,
    max_ws_connections: 0,
    http_requests_per_minute: 0,
    ws_interval_seconds: 0,
    candle_max_minutes: null,
    max_entry_spread_pct_by_pair_type: {},
  }
  const username = stringClaim(profile?.username) || summary.username
  const email = stringClaim(profile?.email) || summary.email
  const sub = stringClaim(profile?.sub)
  const displayName = username || email || summary.name || "Usuario"
  const detail = email || username || sub || summary.detail || "-"

  return {
    sub: sub || "-",
    email,
    username: username || "-",
    displayName,
    detail,
    initials: getInitials(displayName),
    plan,
  }
}

function buildAccountSummary(
  profile: AccountProfile | null,
  authProfile?: {
    email?: unknown
    name?: unknown
    nickname?: unknown
    preferred_username?: unknown
    username?: unknown
    sub?: unknown
  },
): AccountSummary {
  const email = stringClaim(profile?.email) || stringClaim(authProfile?.email)
  const username =
    stringClaim(authProfile?.nickname) ||
    stringClaim(profile?.username) ||
    stringClaim(authProfile?.preferred_username) ||
    stringClaim(authProfile?.username)
  const name = stringClaim(authProfile?.name) || username || email || "Usuario"
  const detail = email || username || stringClaim(profile?.sub) || stringClaim(authProfile?.sub) || "-"
  const plan = normalizeAccountPlan(profile?.plan)
  return {
    name,
    detail,
    email,
    username,
    initials: getInitials(name),
    planName: plan?.name || "Free",
  }
}

function stringClaim(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : ""
}

function getInitials(value: string): string {
  const normalized = String(value || "").trim()
  if (!normalized) return "U"
  const parts = normalized.includes("@") ? [normalized[0]] : normalized.split(/\s+/)
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

function numberOrNull(value: unknown): number | null {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function numberOrZero(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatLimit(value: number | null | undefined, unlimitedLabel: string): string {
  if (value === null) return unlimitedLabel
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  return value.toLocaleString("pt-BR")
}

function formatMinutes(value: number | null | undefined, unlimitedLabel: string, minutesLabel: string): string {
  if (value === null) return unlimitedLabel
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  return `${value.toLocaleString("pt-BR")} ${minutesLabel}`
}

function formatSeconds(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  return `${value}s`
}

function SettingsSection({
  filters,
  panelSettings,
  selectedView,
  language,
  theme,
  onFiltersChange,
  onPanelSettingsChange,
  onSelectedViewChange,
  onLanguageChange,
  onThemeChange,
}: {
  filters: FilterState
  panelSettings: PanelSettings
  selectedView: MonitorView
  language: AppLanguage
  theme: AppTheme
  onFiltersChange: (filters: FilterState) => void
  onPanelSettingsChange: (settings: PanelSettings) => void
  onSelectedViewChange: (view: MonitorView) => void
  onLanguageChange: (language: AppLanguage) => void
  onThemeChange: (theme: AppTheme) => void
}) {
  const { t } = usePreferences()
  const updatePanelSetting = <K extends keyof PanelSettings>(key: K, value: PanelSettings[K]) => {
    onPanelSettingsChange({ ...panelSettings, [key]: value })
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">{t("settings")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("settingsDescription")}
            </p>
          </div>
          <Settings2 className="h-5 w-5 text-primary" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <SettingCard
            icon={<CandlestickChart className="h-4 w-4 text-primary" />}
            title={t("defaultView")}
            description={t("defaultViewDescription")}
          >
            <Select value={selectedView} onValueChange={(value) => onSelectedViewChange(value as MonitorView)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="spot_future">Future x Spot</SelectItem>
                <SelectItem value="spot_spot">Spot x Spot</SelectItem>
              </SelectContent>
            </Select>
          </SettingCard>

          <SettingCard
            icon={<Languages className="h-4 w-4 text-primary" />}
            title={t("panelLanguage")}
            description={t("panelLanguageDescription")}
          >
            <Select value={language} onValueChange={(value) => onLanguageChange(value as AppLanguage)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pt">Portugues</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </SettingCard>

          <SettingCard
            icon={theme === "light" ? <Sun className="h-4 w-4 text-primary" /> : <Moon className="h-4 w-4 text-primary" />}
            title={t("theme")}
            description={t("themeDescription")}
          >
            <Select value={theme} onValueChange={(value) => onThemeChange(value as AppTheme)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">{t("themeDark")}</SelectItem>
                <SelectItem value="light">{t("themeLight")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingCard>

          <SettingToggle
            title={t("compactNumbers")}
            description={t("compactNumbersDescription")}
            checked={panelSettings.compactNumbers}
            onCheckedChange={(checked) => updatePanelSetting("compactNumbers", checked)}
          />

          <SettingToggle
            title={t("confirmBeforeAnalysis")}
            description={t("confirmBeforeAnalysisDescription")}
            checked={panelSettings.confirmBeforeAnalysis}
            onCheckedChange={(checked) => updatePanelSetting("confirmBeforeAnalysis", checked)}
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              onFiltersChange(DEFAULT_FILTERS)
              onSelectedViewChange("spot_future")
              onPanelSettingsChange(DEFAULT_PANEL_SETTINGS)
            }}
          >
            {t("restoreDefault")}
          </Button>
        </div>
      </div>
    </section>
  )
}

function SettingCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">{icon}</div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

function SettingToggle({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string
  description: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-secondary/20 p-4">
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function TermsSection() {
  const { t } = usePreferences()
  const sections = [
    {
      title: t("termInfoTitle"),
      text: t("termInfoText"),
    },
    {
      title: t("termRiskTitle"),
      text: t("termRiskText"),
    },
    {
      title: t("termThirdPartyTitle"),
      text: t("termThirdPartyText"),
    },
    {
      title: t("termNoGuaranteeTitle"),
      text: t("termNoGuaranteeText"),
    },
    {
      title: t("termResponsibilityTitle"),
      text: t("termResponsibilityText"),
    },
    {
      title: t("termLiabilityTitle"),
      text: t("termLiabilityText"),
    },
  ]

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{t("termsTitle")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t("termsDescription")}
          </p>
        </div>
        <ShieldAlert className="h-5 w-5 text-primary" />
      </div>

      <div className="grid gap-4">
        {sections.map((section) => (
          <article key={section.title} className="rounded-xl border border-border/70 bg-secondary/20 p-4">
            <h3 className="font-semibold text-foreground">{section.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{section.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function areItemsEquivalent(previousItem: SpreadItem, nextItem: SpreadItem) {
  return (
    previousItem.symbol === nextItem.symbol &&
    previousItem.spot_exchange === nextItem.spot_exchange &&
    previousItem.futures_exchange === nextItem.futures_exchange &&
    previousItem.entry_spread_pct === nextItem.entry_spread_pct &&
    previousItem.exit_spread_pct === nextItem.exit_spread_pct &&
    previousItem.entry_volume_usdt === nextItem.entry_volume_usdt &&
    previousItem.exit_volume_usdt === nextItem.exit_volume_usdt &&
    previousItem.spot_volume_24h_usdt === nextItem.spot_volume_24h_usdt &&
    previousItem.future_volume_24h_usdt === nextItem.future_volume_24h_usdt &&
    previousItem.best_spot_bid === nextItem.best_spot_bid &&
    previousItem.best_spot_ask === nextItem.best_spot_ask &&
    previousItem.best_future_bid === nextItem.best_future_bid &&
    previousItem.best_future_ask === nextItem.best_future_ask &&
    previousItem.funding_rate === nextItem.funding_rate
  )
}

function matchesActiveFilters(
  item: SpreadItem,
  filters: FilterState,
  minimumPositiveSpread: number
) {
  if (filters.coin && !item.symbol.toLowerCase().includes(filters.coin.toLowerCase())) {
    return false
  }

  if (
    filters.spot_exchange.length > 0 &&
    !filters.spot_exchange.some((exchange) => item.spot_exchange.toLowerCase() === exchange.toLowerCase())
  ) {
    return false
  }

  if (
    filters.futures_exchange.length > 0 &&
    !filters.futures_exchange.some((exchange) => item.futures_exchange.toLowerCase() === exchange.toLowerCase())
  ) {
    return false
  }

  if (item.entry_spread_pct < minimumPositiveSpread) {
    return false
  }

  return true
}
