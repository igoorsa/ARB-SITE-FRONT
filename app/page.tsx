"use client"

import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react"
import { ArrowRightLeft, CandlestickChart, FileText, Settings2 } from "lucide-react"
import { Filters } from "@/components/filters"
import { Header } from "@/components/header"
import { SpreadTable } from "@/components/spread-table"
import { StatsCards } from "@/components/stats-cards"
import {
  Sidebar,
  SidebarContent,
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
import { createWebSocketUrl, fetchLatest } from "@/lib/api"
import type { FilterState, SpreadItem } from "@/lib/types"

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

type MonitorView = "spot_future" | "spot_spot"
type AppSection = "monitor" | "settings" | "terms"

const DEFAULT_FILTERS: FilterState = {
  spot_exchange: [],
  futures_exchange: [],
  coin: "",
  min_entry_spread_pct: 0,
  refresh_interval_seconds: 5,
}

const POSITIVE_THRESHOLD = 0.000001

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
  return Math.max(userValue ?? 0, POSITIVE_THRESHOLD)
}

function hasPositiveOpportunity(item: SpreadItem): boolean {
  return item.entry_spread_pct > 0
}

export default function HomePage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [selectedView, setSelectedView] = useState<MonitorView>("spot_future")
  const [selectedSection, setSelectedSection] = useState<AppSection>("monitor")
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [serverData, setServerData] = useState<SpreadItem[]>([])
  const [useMockData, setUseMockData] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isTablePending, startTableTransition] = useTransition()
  const [hasLoadedStoredFilters, setHasLoadedStoredFilters] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const stored = window.sessionStorage.getItem(FILTERS_STORAGE_KEY)
      const storedView = window.sessionStorage.getItem(VIEW_STORAGE_KEY)
      const storedSection = window.sessionStorage.getItem(SECTION_STORAGE_KEY)
      if (storedView === "spot_future" || storedView === "spot_spot") {
        setSelectedView(storedView)
      }
      if (storedSection === "monitor" || storedSection === "settings" || storedSection === "terms") {
        setSelectedSection(storedSection)
      }
      if (!stored) {
        setHasLoadedStoredFilters(true)
        return
      }
      const parsed = JSON.parse(stored) as Partial<FilterState>
      setFilters({
        spot_exchange: Array.isArray(parsed.spot_exchange) ? parsed.spot_exchange : DEFAULT_FILTERS.spot_exchange,
        futures_exchange: Array.isArray(parsed.futures_exchange) ? parsed.futures_exchange : DEFAULT_FILTERS.futures_exchange,
        coin: typeof parsed.coin === "string" ? parsed.coin.toUpperCase() : DEFAULT_FILTERS.coin,
        min_entry_spread_pct: typeof parsed.min_entry_spread_pct === "number" ? parsed.min_entry_spread_pct : DEFAULT_FILTERS.min_entry_spread_pct,
        refresh_interval_seconds:
          typeof parsed.refresh_interval_seconds === "number"
            ? Math.max(1, parsed.refresh_interval_seconds)
            : DEFAULT_FILTERS.refresh_interval_seconds,
      })
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
  }, [filters, hasLoadedStoredFilters, selectedView, selectedSection])

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
    })
  }, [debouncedFilters, minimumPositiveSpread, selectedView])

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
        description: "Oportunidades entre mercado futuro e mercado spot.",
      }
    : {
        title: "Spot x Spot",
        description: "Oportunidades entre duas corretoras spot.",
      }

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
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={selectedSection === "monitor"}
                    tooltip="Monitor"
                    onClick={() => setSelectedSection("monitor")}
                  >
                    <CandlestickChart />
                    <span>Monitor</span>
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
                    tooltip="Configuracoes"
                    onClick={() => setSelectedSection("settings")}
                  >
                    <Settings2 />
                    <span>Configuracoes</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={selectedSection === "terms"}
                    tooltip="Termos"
                    onClick={() => setSelectedSection("terms")}
                  >
                    <FileText />
                    <span>Termos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarRail />
      </Sidebar>
      </div>

      <SidebarInset>
        <div className="min-h-screen bg-background">
          <Header
            isConnected={useMockData ? true : isConnected}
            lastUpdate={useMockData ? new Date() : lastUpdate}
          />

          <main className="container mx-auto px-4 py-6">
            <div className="flex flex-col gap-6">
          {useMockData && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 text-center">
              <p className="text-sm text-primary">
                <strong>Modo Demo:</strong> Exibindo dados de demonstração. Configure{" "}
                NEXT_PUBLIC_API_URL e NEXT_PUBLIC_WS_URL para conectar à sua API.
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
                  <span className="text-sm text-muted-foreground">{activeData.length} resultados</span>
                </div>
                <SpreadTable data={activeData} pairType={selectedView} />
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-border bg-card p-8">
              <div className="max-w-xl">
                <h2 className="text-xl font-semibold text-foreground">
                  {selectedSection === "settings" ? "Configuracoes" : "Termos"}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {selectedSection === "settings"
                    ? "Area reservada para configuracoes do painel. Pode preencher depois."
                    : "Area reservada para termos e informacoes legais. Pode preencher depois."}
                </p>
              </div>
            </section>
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
