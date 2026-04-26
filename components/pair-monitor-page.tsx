"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import {
  Activity,
  ArrowLeft,
  Clock3,
  DollarSign,
  Layers3,
  LineChart,
  Network,
  Percent,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { CandlestickChartCustom } from "@/components/candlestick-chart"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useExchangePairBooks } from "@/hooks/use-exchange-pair-books"
import { fetchCandles, fetchLatest, fetchNetworks } from "@/lib/api"
import type { AssetNetworksResponse, CandleData, SpreadItem } from "@/lib/types"
import { cn } from "@/lib/utils"

const TIME_RANGES = [
  { value: "60", label: "1 Hora" },
  { value: "240", label: "4 Horas" },
  { value: "1440", label: "24 Horas" },
  { value: "4320", label: "3 Dias" },
  { value: "10080", label: "7 Dias" },
]

const UPDATE_INTERVAL_OPTIONS = [
  { value: "1", label: "1s" },
  { value: "2", label: "2s" },
  { value: "5", label: "5s" },
  { value: "10", label: "10s" },
  { value: "15", label: "15s" },
  { value: "30", label: "30s" },
]

type FeeMarketType = "spot" | "future"

interface FeeSchedule {
  maker: number
  taker: number
}

interface ExchangeFeeProfile {
  spot: FeeSchedule
  future: FeeSchedule
  notes: string
  url: string
}

const EXCHANGE_FEES: Record<string, ExchangeFeeProfile> = {
  binance: {
    spot: { maker: 0.1, taker: 0.1 },
    future: { maker: 0.02, taker: 0.05 },
    notes: "Desconto de 25% no Spot e 10% no Futuros usando BNB.",
    url: "https://www.binance.com/fee/trading",
  },
  gate: {
    spot: { maker: 0.1, taker: 0.1 },
    future: { maker: 0.015, taker: 0.05 },
    notes: "Taxas variam conforme o nível VIP (volume e saldo de GT).",
    url: "https://www.gate.com/fee",
  },
  mexc: {
    spot: { maker: 0, taker: 0.1 },
    future: { maker: 0, taker: 0.01 },
    notes: "Taxas variam conforme volume e saldo MX.",
    url: "https://www.mexc.com/fee",
  },
  bitget: {
    spot: { maker: 0.1, taker: 0.1 },
    future: { maker: 0.02, taker: 0.06 },
    notes: "Desconto de 20% no Spot pagando com BGB.",
    url: "https://www.bitget.com/fee",
  },
}

export function PairMonitorPage() {
  const searchParams = useSearchParams()
  const pairKey = searchParams.get("pair_key") ?? ""
  const pairParts = useMemo(() => pairKey.split("|"), [pairKey])
  const fallbackPairType = pairParts[0] === "spot_spot" ? "spot_spot" : "spot_future"
  const fallbackCoin = pairParts[1] ?? ""
  const fallbackSpotExchange = pairParts[2] ?? ""
  const fallbackFuturesExchange = pairParts[3] ?? ""

  const [timeRange, setTimeRange] = useState("240")
  const [latestItem, setLatestItem] = useState<SpreadItem | null>(null)
  const [candles, setCandles] = useState<CandleData[]>([])
  const [loadingCandles, setLoadingCandles] = useState(false)
  const [loadingSnapshot, setLoadingSnapshot] = useState(false)
  const [networkData, setNetworkData] = useState<AssetNetworksResponse | null>(null)
  const [loadingNetworks, setLoadingNetworks] = useState(false)
  const [networkError, setNetworkError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const resolvedPairType = latestItem?.pair_type ?? fallbackPairType
  const isSpotSpot = resolvedPairType === "spot_spot"
  const streamLegA = useMemo(() => {
    if (!pairKey || !fallbackCoin || !fallbackSpotExchange) return null
    return {
      exchangeId: fallbackSpotExchange,
      marketType: "spot" as const,
      asset: fallbackCoin,
    }
  }, [pairKey, fallbackCoin, fallbackSpotExchange])
  const streamLegB = useMemo(() => {
    if (!pairKey || !fallbackCoin || !fallbackFuturesExchange) return null
    return {
      exchangeId: fallbackFuturesExchange,
      marketType: (fallbackPairType === "spot_spot" ? "spot" : "future") as const,
      asset: fallbackCoin,
    }
  }, [pairKey, fallbackCoin, fallbackFuturesExchange, fallbackPairType])
  const {
    legABook,
    legBBook,
    isConnected,
    lastUpdate,
  } = useExchangePairBooks({
    legA: streamLegA,
    legB: streamLegB,
    enabled: Boolean(pairKey && streamLegA && streamLegB),
  })

  useEffect(() => {
    if (!pairKey) return

    let isActive = true

    const loadSnapshot = async () => {
      setLoadingSnapshot(true)

      try {
        const [first] = await fetchLatest({ pair_key: pairKey, limit: 1 })
        if (!isActive) return
        setLatestItem(first ?? null)
      } catch {
        if (!isActive) return
        setLatestItem(null)
      } finally {
        if (isActive) {
          setLoadingSnapshot(false)
        }
      }
    }

    loadSnapshot()

    return () => {
      isActive = false
    }
  }, [pairKey])

  useEffect(() => {
    if (!latestItem || !legABook || !legBBook) {
      return
    }
    setLatestItem((current) => {
      if (!current) {
        return current
      }
      return patchSpreadItemWithRealtimeBooks(current, legABook, legBBook)
    })
  }, [latestItem?.pair_key, legABook, legBBook])

  useEffect(() => {
    if (!pairKey) return

    if (isSpotSpot) {
      setCandles([])
      setLoadingCandles(false)
      setError(null)
      return
    }

    let isActive = true

    const loadNetworks = async () => {
      setLoadingNetworks(true)
      setNetworkError(null)

      try {
        const data = await fetchNetworks({
          pair_key: pairKey,
          spot_exchange: latestItem?.spot_exchange ?? fallbackSpotExchange,
          futures_exchange: latestItem?.futures_exchange ?? fallbackFuturesExchange,
          spot_symbol: latestItem?.spot_symbol,
          future_symbol: latestItem?.future_symbol,
          coin: latestItem?.symbol ?? fallbackCoin,
        })

        if (!isActive) return
        setNetworkData(data)
      } catch {
        if (!isActive) return
        setNetworkData(null)
        setNetworkError("Falha ao carregar dados de redes")
      } finally {
        if (isActive) {
          setLoadingNetworks(false)
        }
      }
    }

    loadNetworks()

    return () => {
      isActive = false
    }
  }, [pairKey, latestItem?.spot_exchange, latestItem?.futures_exchange, latestItem?.symbol, fallbackSpotExchange, fallbackFuturesExchange, fallbackCoin])

  useEffect(() => {
    if (!pairKey) return

    let isActive = true

    const loadCandles = async () => {
      setLoadingCandles(true)
      setError(null)

      try {
        const minutes = parseInt(timeRange, 10)
        let data = await fetchCandles({
          pair_type: resolvedPairType,
          pair_key: pairKey,
          minutes,
          limit: Math.min(minutes, 300),
        })

        if (data.length === 0 && fallbackSpotExchange && fallbackFuturesExchange && fallbackCoin) {
          data = await fetchCandles({
            pair_type: resolvedPairType,
            spot_exchange: fallbackSpotExchange,
            futures_exchange: fallbackFuturesExchange,
            coin: fallbackCoin,
            minutes,
            limit: Math.min(minutes, 300),
          })
        }

        if (!isActive) return

        setCandles(data)
        if (data.length === 0) {
          setError("Nenhum candle encontrado para este par no periodo selecionado")
        }
      } catch {
        if (!isActive) return
        setCandles([])
        setError("Falha ao carregar candles")
      } finally {
        if (isActive) {
          setLoadingCandles(false)
        }
      }
    }

    loadCandles()

    return () => {
      isActive = false
    }
  }, [pairKey, timeRange, fallbackSpotExchange, fallbackFuturesExchange, fallbackCoin, isSpotSpot, resolvedPairType])

  const analytics = useMemo(() => buildAnalytics(candles), [candles])
  const periodContext = useMemo(() => buildPeriodContext(candles, latestItem), [candles, latestItem])
  const periodStatusLabel = loadingCandles ? "Atualizando periodo..." : `${candles.length} candles carregados`
  const networkMatches = useMemo(() => buildNetworkMatches(networkData), [networkData])
  const feeCards = useMemo(() => {
    if (!latestItem) return []
    const legs = [
      {
        exchangeId: latestItem.spot_exchange,
        marketType: "spot" as FeeMarketType,
        sideLabel: isSpotSpot ? "Compra" : "Spot",
      },
      {
        exchangeId: latestItem.futures_exchange,
        marketType: (isSpotSpot ? "spot" : "future") as FeeMarketType,
        sideLabel: isSpotSpot ? "Venda" : "Future",
      },
    ]

    return legs
      .map((leg, index) => {
        const profile = EXCHANGE_FEES[leg.exchangeId?.toLowerCase?.() ?? ""]
        if (!profile) return null
        return {
          key: `${leg.exchangeId}-${leg.marketType}-${index}`,
          exchangeId: leg.exchangeId,
          marketType: leg.marketType,
          sideLabel: leg.sideLabel,
          fees: profile[leg.marketType],
          notes: profile.notes,
          url: profile.url,
        }
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  }, [isSpotSpot, latestItem])
  const spotMarketTopValue = useMemo(() => {
    if (legABook) {
      return legABook.bestAskAmount * legABook.bestAskPrice
    }
    return latestItem?.entry_volume_usdt
  }, [legABook, latestItem?.entry_volume_usdt])
  const futureMarketTopValue = useMemo(() => {
    if (legBBook) {
      return legBBook.bestBidAmount * legBBook.bestBidPrice
    }
    return latestItem?.entry_volume_usdt
  }, [legBBook, latestItem?.entry_volume_usdt])

  if (!pairKey) {
    return (
      <div className="min-h-screen bg-background">
        <Header isConnected={false} lastUpdate={null} />
        <main className="container mx-auto px-4 py-8">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="mb-2 text-lg font-medium text-foreground">Par nao informado</p>
            <p className="mb-4 text-muted-foreground">Abra esta pagina a partir da lista principal.</p>
            <Button asChild>
              <Link href="/">Voltar</Link>
            </Button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Header isConnected={isConnected} lastUpdate={lastUpdate} />

      <main className="container mx-auto px-4 py-6">
        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-4">
                <Button asChild variant="ghost" className="px-0 hover:bg-transparent">
                  <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar para oportunidades
                  </Link>
                </Button>

                <div>
                  <div className="text-sm uppercase tracking-[0.18em] text-muted-foreground">
                    Monitor dedicado
                  </div>
                  <h1 className="mt-2 text-3xl font-bold text-foreground">
                    {latestItem?.symbol ?? fallbackCoin ?? pairKey}
                  </h1>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="rounded-full bg-secondary px-3 py-1">
                      {latestItem?.spot_exchange ?? fallbackSpotExchange}
                    </span>
                    <span>{isSpotSpot ? "->" : ">"}</span>
                    <span className="rounded-full bg-secondary px-3 py-1">
                      {latestItem?.futures_exchange ?? fallbackFuturesExchange}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isConnected ? "bg-primary" : "bg-amber-500"
                )}
              />
              <span>{isConnected ? "Tempo real conectado" : "Reconectando em tempo real"}</span>
              {loadingSnapshot ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
            </div>
          </section>

          {latestItem ? (
            <>
              {isSpotSpot ? (
                <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <InfoCard
                    icon={TrendingUp}
                    label="Lucro Atual"
                    value={`${latestItem.entry_spread_pct.toFixed(2)}%`}
                    tone={latestItem.entry_spread_pct >= 0 ? "positive" : "negative"}
                  />
                  <InfoCard
                    icon={DollarSign}
                    label="Volume 24hr"
                    value={
                      <div className="space-y-1 text-base font-semibold">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-muted-foreground">{latestItem.spot_exchange}</span>
                          <span>{formatCompactCurrency(latestItem.spot_volume_24h_usdt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-muted-foreground">{latestItem.futures_exchange}</span>
                          <span>{formatCompactCurrency(latestItem.future_volume_24h_usdt)}</span>
                        </div>
                      </div>
                    }
                  />
                  <InfoCard
                    icon={Activity}
                    label="Spot Compra"
                    value={latestItem.spot_exchange}
                  />
                  <InfoCard
                    icon={ArrowLeft}
                    label="Spot Venda"
                    value={latestItem.futures_exchange}
                  />
                </section>
              ) : (
                <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <InfoCard
                    icon={TrendingUp}
                    label="Spread Entrada"
                    value={`${latestItem.entry_spread_pct.toFixed(2)}%`}
                    tone={latestItem.entry_spread_pct >= 0 ? "positive" : "negative"}
                  />
                  <InfoCard
                    icon={TrendingDown}
                    label="Spread Saida"
                    value={`${latestItem.exit_spread_pct.toFixed(2)}%`}
                    tone={latestItem.exit_spread_pct >= 0 ? "positive" : "negative"}
                  />
                  <InfoCard
                    icon={DollarSign}
                    label="Volume 24h"
                    value={
                      <div className="space-y-1 text-base font-semibold">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-muted-foreground">Spot</span>
                          <span>{formatCompactCurrency(latestItem.spot_volume_24h_usdt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-muted-foreground">Future</span>
                          <span>{formatCompactCurrency(latestItem.future_volume_24h_usdt)}</span>
                        </div>
                      </div>
                    }
                  />
                  <InfoCard
                    icon={Percent}
                    label="Funding"
                    value={
                      latestItem.funding_rate !== undefined
                        ? `${(latestItem.funding_rate * 100).toFixed(4)}%`
                        : "-"
                    }
                    tone={latestItem.funding_rate && latestItem.funding_rate < 0 ? "negative" : "positive"}
                  />
                </section>
              )}

            </>
          ) : (
            <section className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              {loadingSnapshot ? "Carregando snapshot..." : "Snapshot nao disponivel para este par."}
            </section>
          )}

          {latestItem ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-5 flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  {isSpotSpot ? "Book em tempo real" : "Books em tempo real"}
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <BookSideCard
                  title={isSpotSpot ? `Compra em ${latestItem.spot_exchange}` : `Compra em ${latestItem.spot_exchange}`}
                  primaryLabel="Melhor ask"
                  primaryValue={formatPrice(latestItem.best_spot_ask)}
                  secondaryLabel="Melhor bid"
                  secondaryValue={formatPrice(latestItem.best_spot_bid)}
                  volumeLabel="Melhor Vol."
                  volumeValue={
                    isSpotSpot
                      ? formatCompactCurrency(spotMarketTopValue)
                      : formatCompactCurrency(spotMarketTopValue)
                  }
                />
                <BookSideCard
                  title={isSpotSpot ? `Venda em ${latestItem.futures_exchange}` : `Venda em ${latestItem.futures_exchange}`}
                  primaryLabel="Melhor bid"
                  primaryValue={formatPrice(latestItem.best_future_bid)}
                  secondaryLabel="Melhor ask"
                  secondaryValue={formatPrice(latestItem.best_future_ask)}
                  volumeLabel="Melhor Vol."
                  volumeValue={
                    isSpotSpot
                      ? formatCompactCurrency(futureMarketTopValue)
                      : formatCompactCurrency(futureMarketTopValue)
                  }
                />
              </div>
              <div className="mt-4">
                <DepthLevelsDialog
                  buyTitle={isSpotSpot ? `Compra em ${latestItem.spot_exchange}` : `Spot em ${latestItem.spot_exchange}`}
                  buyBids={legABook?.bids ?? []}
                  buyAsks={legABook?.asks ?? []}
                  sellTitle={isSpotSpot ? `Venda em ${latestItem.futures_exchange}` : `Future em ${latestItem.futures_exchange}`}
                  sellBids={legBBook?.bids ?? []}
                  sellAsks={legBBook?.asks ?? []}
                />
              </div>
            </section>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Network className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Analise de Redes</h2>

                  <p className="text-xs text-muted-foreground">
                    {networkData?.updated_at ? `Ultima atualizacao: ${formatDateTime(networkData.updated_at)}` : "Atualizacao pendente"}
                  </p>
                </div>
              </div>
              {loadingNetworks ? <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>

            {networkError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {networkError}
              </div>
            ) : null}

            {!networkError && networkData ? (
              <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                {networkData.exchanges.map((exchange) => (
                  <ExchangeNetworkCard key={exchange.exchange_id} exchange={exchange} matches={networkMatches[exchange.exchange_id] ?? {}} />
                ))}
              </div>
            ) : null}

            {!networkError && !loadingNetworks && (!networkData || !networkData.updated_at || networkData.exchanges.length === 0) ? (
              <div className="rounded-xl border border-border/60 bg-secondary/20 p-4 text-sm text-muted-foreground">
                Atualizacao pendente.
              </div>
            ) : null}
          </section>

          {feeCards.length > 0 ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-5 flex items-center gap-2">
                <Percent className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Taxas</h2>
                  <p className="text-xs text-muted-foreground">
                    Referência: Abril de 2024, contas padrão / nível 0.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {feeCards.map((card) => (
                  <FeeCard
                    key={card.key}
                    exchangeId={card.exchangeId}
                    marketType={card.marketType}
                    sideLabel={card.sideLabel}
                    maker={card.fees.maker}
                    taker={card.fees.taker}
                    notes={card.notes}
                    url={card.url}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {!isSpotSpot ? (
            <section className={cn("grid grid-cols-1 gap-4 xl:grid-cols-2 transition-opacity", loadingCandles && "opacity-70")}>
              <AnalysisCard
                icon={LineChart}
                title="Leitura Estatistica"
                isUpdating={loadingCandles}
                rows={[
                  ["Media entrada", `${analytics.entryMean.toFixed(3)}%`],
                  ["Media saida", `${analytics.exitMean.toFixed(3)}%`],
                  ["Volatilidade entrada", `${analytics.entryVolatility.toFixed(3)}%`],
                  ["Volatilidade saida", `${analytics.exitVolatility.toFixed(3)}%`],
                ]}
              />
              <PeriodContextCard title="Contexto do Periodo" context={periodContext} isUpdating={loadingCandles} />
            </section>
          ) : null}

          {!isSpotSpot ? (
          <section className={cn("rounded-2xl border border-border bg-card p-5 transition-opacity", loadingCandles && "opacity-80")}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-foreground">Acompanhamento em tempo real</h2>
                <p className="text-sm text-muted-foreground">
                  Snapshot filtrado exclusivamente para o par selecionado.
                </p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  <Select value={timeRange} onValueChange={setTimeRange}>
                    <SelectTrigger className="h-auto w-[140px] border-0 bg-transparent p-0 text-sm shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_RANGES.map((range) => (
                        <SelectItem key={range.value} value={range.value}>
                          {range.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {loadingCandles ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                {periodStatusLabel}
                </div>
              </div>
            </div>

            {loadingCandles ? (
              <div className="mb-4 rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                Atualizando metricas e graficos para o novo periodo selecionado.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-5">
              <CandlestickChartCustom
                data={candles}
                isUpdating={loadingCandles}
                type="entry"
                title="Candlestick de Spread de Entrada"
              />
              <CandlestickChartCustom
                data={candles}
                isUpdating={loadingCandles}
                type="exit"
                title="Candlestick de Spread de Saida"
              />
            </div>
          </section>
          ) : null}
        </div>
      </main>
    </div>
  )
}

function patchSpreadItemWithRealtimeBooks(
  current: SpreadItem,
  legABook: {
    bestBidPrice: number
    bestBidAmount: number
    bestAskPrice: number
    bestAskAmount: number
    timestamp: number
  },
  legBBook: {
    bestBidPrice: number
    bestBidAmount: number
    bestAskPrice: number
    bestAskAmount: number
    timestamp: number
  }
): SpreadItem {
  if ((current.pair_type ?? "spot_future") === "spot_spot") {
    const aToBAbs = legBBook.bestBidPrice - legABook.bestAskPrice
    const aToBPct = legABook.bestAskPrice > 0 ? (aToBAbs / legABook.bestAskPrice) * 100 : 0
    const bToAAbs = legABook.bestBidPrice - legBBook.bestAskPrice
    const bToAPct = legBBook.bestAskPrice > 0 ? (bToAAbs / legBBook.bestAskPrice) * 100 : 0

    if (aToBPct >= bToAPct) {
      return {
        ...current,
        spot_exchange: current.pair_key.split("|")[2] ?? current.spot_exchange,
        futures_exchange: current.pair_key.split("|")[3] ?? current.futures_exchange,
        best_spot_bid: legABook.bestBidPrice,
        best_spot_ask: legABook.bestAskPrice,
        best_future_bid: legBBook.bestBidPrice,
        best_future_ask: legBBook.bestAskPrice,
        entry_spread_pct: aToBPct,
        exit_spread_pct: 0,
        entry_volume_usdt: Math.min(
          legABook.bestAskAmount * legABook.bestAskPrice,
          legBBook.bestBidAmount * legBBook.bestBidPrice
        ),
        exit_volume_usdt: Math.min(
          legABook.bestAskAmount * legABook.bestAskPrice,
          legBBook.bestBidAmount * legBBook.bestBidPrice
        ),
        updated_at: new Date(Math.max(legABook.timestamp, legBBook.timestamp)).toISOString(),
      }
    }

    return {
      ...current,
      spot_exchange: current.pair_key.split("|")[3] ?? current.spot_exchange,
      futures_exchange: current.pair_key.split("|")[2] ?? current.futures_exchange,
      best_spot_bid: legBBook.bestBidPrice,
      best_spot_ask: legBBook.bestAskPrice,
      best_future_bid: legABook.bestBidPrice,
      best_future_ask: legABook.bestAskPrice,
      entry_spread_pct: bToAPct,
      exit_spread_pct: 0,
      entry_volume_usdt: Math.min(
        legBBook.bestAskAmount * legBBook.bestAskPrice,
        legABook.bestBidAmount * legABook.bestBidPrice
      ),
      exit_volume_usdt: Math.min(
        legBBook.bestAskAmount * legBBook.bestAskPrice,
        legABook.bestBidAmount * legABook.bestBidPrice
      ),
      updated_at: new Date(Math.max(legABook.timestamp, legBBook.timestamp)).toISOString(),
    }
  }

  const entrySpreadAbs = legBBook.bestBidPrice - legABook.bestAskPrice
  const exitSpreadAbs = legABook.bestBidPrice - legBBook.bestAskPrice
  const entrySpreadPct = legABook.bestAskPrice > 0 ? (entrySpreadAbs / legABook.bestAskPrice) * 100 : 0
  const exitSpreadPct = legBBook.bestAskPrice > 0 ? (exitSpreadAbs / legBBook.bestAskPrice) * 100 : 0

  return {
    ...current,
    best_spot_bid: legABook.bestBidPrice,
    best_spot_ask: legABook.bestAskPrice,
    best_future_bid: legBBook.bestBidPrice,
    best_future_ask: legBBook.bestAskPrice,
    entry_spread_pct: entrySpreadPct,
    exit_spread_pct: exitSpreadPct,
    entry_volume_usdt: Math.min(
      legABook.bestAskAmount * legABook.bestAskPrice,
      legBBook.bestBidAmount * legBBook.bestBidPrice
    ),
    exit_volume_usdt: Math.min(
      legABook.bestBidAmount * legABook.bestBidPrice,
      legBBook.bestAskAmount * legBBook.bestAskPrice
    ),
    updated_at: new Date(Math.max(legABook.timestamp, legBBook.timestamp)).toISOString(),
  }
}

function buildAnalytics(candles: CandleData[]) {
  if (candles.length === 0) {
    return {
      entryMean: 0,
      exitMean: 0,
      entryVolatility: 0,
      exitVolatility: 0,
    }
  }

  const ordered = [...candles].reverse()
  const entryCloses = ordered.map((item) => item.entry_close)
  const exitCloses = ordered.map((item) => item.exit_close)

  return {
    entryMean: average(entryCloses),
    exitMean: average(exitCloses),
    entryVolatility: stddev(entryCloses),
    exitVolatility: stddev(exitCloses),
  }
}

function buildPeriodContext(candles: CandleData[], latestItem: SpreadItem | null) {
  if (candles.length === 0) {
    return {
      entry: emptyPeriodMetrics(),
      exit: emptyPeriodMetrics(),
    }
  }

  const ordered = [...candles].reverse()
  const entryCloses = ordered.map((item) => item.entry_close)
  const exitCloses = ordered.map((item) => item.exit_close)

  return {
    entry: summarizePeriodMetrics(entryCloses, latestItem?.entry_spread_pct),
    exit: summarizePeriodMetrics(exitCloses, latestItem?.exit_spread_pct),
  }
}

function summarizePeriodMetrics(series: number[], currentValue?: number) {
  if (series.length === 0) {
    return emptyPeriodMetrics()
  }

  const min = Math.min(...series)
  const max = Math.max(...series)
  const mean = average(series)
  const current = currentValue ?? series[series.length - 1]
  const previousClose = series.length > 1 ? series[series.length - 2] : series[series.length - 1]

  return {
    current,
    max,
    min,
    distanceFromMean: current - mean,
    vsPreviousClose: current - previousClose,
  }
}

function emptyPeriodMetrics() {
  return {
    current: 0,
    max: 0,
    min: 0,
    distanceFromMean: 0,
    vsPreviousClose: 0,
  }
}

function average(values: number[]) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stddev(values: number[]) {
  if (values.length < 2) return 0
  const mean = average(values)
  const variance = average(values.map((value) => (value - mean) ** 2))
  return Math.sqrt(variance)
}

function formatCompactCurrency(value: number | undefined) {
  if (value === undefined || value === null) return "-"
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatPrice(value: number | undefined) {
  if (value === undefined || value === null) return "-"
  return `$${value.toFixed(6)}`
}

function formatFeePercent(value: number) {
  return `${value.toFixed(4)}%`
}

function InfoCard({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  tone?: "default" | "positive" | "negative"
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <div
            className={cn(
              "mt-2 text-2xl font-bold",
              tone === "positive" && "text-primary",
              tone === "negative" && "text-destructive",
              tone === "default" && "text-foreground"
            )}
          >
            {value}
          </div>
        </div>
        <div className="rounded-xl bg-primary/10 p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </div>
  )
}

function AnalysisCard({
  icon: Icon,
  title,
  isUpdating = false,
  rows,
}: {
  icon: React.ElementType
  title: string
  isUpdating?: boolean
  rows: [string, string][]
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
        <UpdateBadge isUpdating={isUpdating} />
      </div>
      <div className="space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-xl bg-secondary/35 px-4 py-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold text-foreground">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function PeriodContextCard({
  title,
  context,
  isUpdating = false,
}: {
  title: string
  context: {
    entry: ReturnType<typeof emptyPeriodMetrics>
    exit: ReturnType<typeof emptyPeriodMetrics>
  }
  isUpdating?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
        <UpdateBadge isUpdating={isUpdating} />
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <ContextColumn label="Entrada" metrics={context.entry} />
        <ContextColumn label="Saida" metrics={context.exit} />
      </div>
    </div>
  )
}

function UpdateBadge({ isUpdating }: { isUpdating: boolean }) {
  return (
    <div className="flex min-w-[132px] items-center justify-end">
      {isUpdating ? (
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] text-muted-foreground">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Atualizando
        </span>
      ) : null}
    </div>
  )
}

function ContextColumn({
  label,
  metrics,
}: {
  label: string
  metrics: ReturnType<typeof emptyPeriodMetrics>
}) {
  return (
    <div className="rounded-xl bg-secondary/25 p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">{label}</div>
      <div className="space-y-2">
        <ContextRow label="Maxima do periodo" value={formatPercentValue(metrics.max)} />
        <ContextRow label="Minima do periodo" value={formatPercentValue(metrics.min)} />
        <ContextRow
          label="Distancia da media"
          value={formatSignedPercent(metrics.distanceFromMean)}
          tone={metrics.distanceFromMean >= 0 ? "positive" : "negative"}
        />
        <ContextRow
          label="Atual vs fechamento anterior"
          value={formatSignedPercent(metrics.vsPreviousClose)}
          tone={metrics.vsPreviousClose >= 0 ? "positive" : "negative"}
        />
      </div>
    </div>
  )
}

function ContextRow({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "positive" | "negative"
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-background/70 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold text-foreground",
          tone === "positive" && "text-primary",
          tone === "negative" && "text-destructive"
        )}
      >
        {value}
      </span>
    </div>
  )
}

function formatPercentValue(value: number) {
  return `${value.toFixed(3)}%`
}

function formatSignedPercent(value: number) {
  const prefix = value > 0 ? "+" : ""
  return `${prefix}${value.toFixed(3)}%`
}

function BookSideCard({
  title,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  volumeLabel,
  volumeValue,
}: {
  title: string
  primaryLabel: string
  primaryValue: string
  secondaryLabel: string
  secondaryValue: string
  volumeLabel: string
  volumeValue: string
}) {
  return (
    <div className="rounded-xl bg-secondary/25 p-4">
      <div className="mb-3 text-sm font-semibold text-foreground">{title}</div>
      <div className="space-y-2">
        <ContextRow label={primaryLabel} value={primaryValue} />
        <ContextRow label={secondaryLabel} value={secondaryValue} />
        <ContextRow label={volumeLabel} value={volumeValue} />
      </div>
    </div>
  )
}

function FeeCard({
  exchangeId,
  marketType,
  sideLabel,
  maker,
  taker,
  notes,
  url,
}: {
  exchangeId: string
  marketType: FeeMarketType
  sideLabel: string
  maker: number
  taker: number
  notes: string
  url: string
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{sideLabel}</div>
          <h3 className="mt-1 text-lg font-semibold text-foreground">{exchangeId.toUpperCase()}</h3>
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium uppercase text-muted-foreground">
          {marketType === "spot" ? "Spot" : "Futuros"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/60 bg-background/70 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Maker</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{formatFeePercent(maker)}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/70 p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Taker</div>
          <div className="mt-1 text-lg font-semibold text-foreground">{formatFeePercent(taker)}</div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">{notes}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex text-sm font-medium text-primary transition-colors hover:text-primary/80"
      >
        Ver taxas no site da corretora
      </a>
    </div>
  )
}

function DepthLevelsDialog({
  sellTitle,
  sellBids,
  sellAsks,
  buyTitle,
  buyBids,
  buyAsks,
}: {
  sellTitle: string
  sellBids: { price: number; amount: number }[]
  sellAsks: { price: number; amount: number }[]
  buyTitle: string
  buyBids: { price: number; amount: number }[]
  buyAsks: { price: number; amount: number }[]
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-xs">
          <Layers3 className="mr-2 h-4 w-4" />
          Ver niveis
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] w-[99.5vw] max-w-none overflow-y-auto p-3 sm:p-4 lg:w-[99vw]">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Profundidade por corretora</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ExchangeDepthBlock
            title={buyTitle}
            bids={buyBids}
            asks={buyAsks}
          />
          <ExchangeDepthBlock
            title={sellTitle}
            bids={sellBids}
            asks={sellAsks}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ExchangeDepthBlock({
  title,
  bids,
  asks,
}: {
  title: string
  bids: { price: number; amount: number }[]
  asks: { price: number; amount: number }[]
}) {
  return (
    <div className="rounded-xl border border-border bg-secondary/10 p-3 sm:p-4">
      <div className="mb-3 text-sm font-semibold text-foreground sm:text-base">{title}</div>
      <DepthLevelsCard asks={asks} bids={bids} />
    </div>
  )
}

function DepthLevelsCard({
  asks,
  bids,
}: {
  asks: { price: number; amount: number }[]
  bids: { price: number; amount: number }[]
}) {
  const askLevels = asks.slice(0, 5).reverse()
  const bidLevels = bids.slice(0, 5)

  return (
    <div className="rounded-xl border border-border bg-secondary/15 p-3">
      <div className="space-y-1">
        {askLevels.length === 0 && bidLevels.length === 0 ? (
          <div className="text-xs text-muted-foreground sm:text-sm">Sem niveis disponiveis.</div>
        ) : null}

        {askLevels.map((level) => (
          <DepthRow
            key={`ask-${level.price}-${level.amount}`}
            price={level.price}
            amount={level.amount}
            tone="ask"
          />
        ))}

        {askLevels.length > 0 && bidLevels.length > 0 ? (
          <div className="my-1 border-t border-border/70" />
        ) : null}

        {bidLevels.map((level) => (
          <DepthRow
            key={`bid-${level.price}-${level.amount}`}
            price={level.price}
            amount={level.amount}
            tone="bid"
          />
        ))}
      </div>
    </div>
  )
}

function DepthRow({
  price,
  amount,
  tone,
}: {
  price: number
  amount: number
  tone: "ask" | "bid"
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] sm:px-3 sm:py-2 sm:text-xs",
        tone === "ask" ? "bg-rose-500/8" : "bg-emerald-500/8"
      )}
    >
      <span className={cn("truncate font-semibold", tone === "ask" ? "text-rose-600" : "text-emerald-600")}>
        {formatPrice(price)}
      </span>
      <span className="truncate text-right text-foreground">{formatAmount(amount)}</span>
    </div>
  )
}

type NetworkMatch = {
  targetExchangeId: string
  targetNetworkName: string
  confidence: "high" | "medium" | "low"
}

function ExchangeNetworkCard({
  exchange,
  matches,
}: {
  exchange: AssetNetworksResponse["exchanges"][number]
  matches: Record<string, NetworkMatch>
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-secondary/15 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold uppercase text-foreground">{exchange.exchange_id}</h3>
          <p className="text-xs text-muted-foreground">
            {exchange.success ? `${exchange.networks.length} rede(s) encontrada(s)` : "Consulta sem dados completos"}
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            exchange.success ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
          )}
        >
          {exchange.success ? "OK" : "Falha"}
        </span>
      </div>

      {exchange.error ? (
        <div className="mb-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          {exchange.error}
        </div>
      ) : null}

      {exchange.networks.length > 0 ? (
        <div className="space-y-3">
          {exchange.networks.map((network) => (
            <div key={`${exchange.exchange_id}-${network.network_key}`} className="rounded-xl bg-background/80 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-foreground">{network.network_name}</div>
                  <div className="text-xs text-muted-foreground">{network.network_key}</div>
                  {matches[network.network_key] ? (
                    <div
                      className={cn(
                        "mt-1 text-xs",
                        matches[network.network_key].confidence === "high" && "text-primary",
                        matches[network.network_key].confidence === "medium" && "text-amber-600",
                        matches[network.network_key].confidence === "low" && "text-muted-foreground"
                      )}
                    >
                      Equivale a {matches[network.network_key].targetNetworkName} na {matches[network.network_key].targetExchangeId}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <StatusPill label="Dep" value={network.deposit_enabled} />
                  <StatusPill label="Saq" value={network.withdraw_enabled} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm xl:grid-cols-4">
                <NetworkDataPoint label="Taxa deposito" value={formatMaybeAssetAmount(network.deposit_fee, network.asset)} />
                <NetworkDataPoint label="Taxa saque" value={formatMaybeAssetAmount(network.withdraw_fee, network.asset)} />
                <NetworkDataPoint label="Min deposito" value={formatMaybeAssetAmount(network.deposit_min, network.asset)} />
                <NetworkDataPoint label="Min saque" value={formatMaybeAssetAmount(network.withdraw_min, network.asset)} />
              </div>
              {network.contract_address ? (
                <div className="mt-3 rounded-lg bg-secondary/35 px-3 py-2 text-xs text-muted-foreground">
                  Contract: <span className="font-mono text-foreground">{network.contract_address}</span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StatusPill({ label, value }: { label: string; value?: boolean | null }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 font-medium",
        value === true && "bg-primary/10 text-primary",
        value === false && "bg-destructive/10 text-destructive",
        value == null && "bg-secondary text-muted-foreground"
      )}
    >
      {label}: {value === true ? "on" : value === false ? "off" : "-"}
    </span>
  )
}

function NetworkDataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/35 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium text-foreground">{value}</div>
    </div>
  )
}

function buildNetworkMatches(networkData: AssetNetworksResponse | null): Record<string, Record<string, NetworkMatch>> {
  if (!networkData || networkData.exchanges.length < 2) {
    return {}
  }

  const matches: Record<string, Record<string, NetworkMatch>> = {}
  const exchanges = networkData.exchanges.filter((exchange) => exchange.networks.length > 0)

  for (let sourceIndex = 0; sourceIndex < exchanges.length; sourceIndex += 1) {
    const source = exchanges[sourceIndex]
    for (let targetIndex = sourceIndex + 1; targetIndex < exchanges.length; targetIndex += 1) {
      const target = exchanges[targetIndex]
      const usedTargetKeys = new Set<string>()

      for (const sourceNetwork of source.networks) {
        let bestTarget: (typeof target.networks)[number] | null = null
        let bestScore = 0

        for (const targetNetwork of target.networks) {
          if (usedTargetKeys.has(targetNetwork.network_key)) {
            continue
          }
          const score = scoreNetworkMatch(
            sourceNetwork,
            targetNetwork,
            source.networks.length,
            target.networks.length,
          )
          if (score > bestScore) {
            bestScore = score
            bestTarget = targetNetwork
          }
        }

        if (!bestTarget || bestScore <= 0) {
          continue
        }

        usedTargetKeys.add(bestTarget.network_key)
        const confidence: NetworkMatch["confidence"] =
          bestScore >= 100 ? "high" : bestScore >= 60 ? "medium" : "low"

        matches[source.exchange_id] ??= {}
        matches[target.exchange_id] ??= {}
        matches[source.exchange_id][sourceNetwork.network_key] = {
          targetExchangeId: target.exchange_id,
          targetNetworkName: bestTarget.network_name,
          confidence,
        }
        matches[target.exchange_id][bestTarget.network_key] = {
          targetExchangeId: source.exchange_id,
          targetNetworkName: sourceNetwork.network_name,
          confidence,
        }
      }
    }
  }

  return matches
}

function scoreNetworkMatch(
  source: AssetNetworksResponse["exchanges"][number]["networks"][number],
  target: AssetNetworksResponse["exchanges"][number]["networks"][number],
  sourceCount: number,
  targetCount: number,
) {
  let score = 0

  const sourceContract = normalizeNetworkToken(source.contract_address)
  const targetContract = normalizeNetworkToken(target.contract_address)
  if (sourceContract && targetContract && sourceContract === targetContract) {
    score += 120
  }

  const sourceTokens = new Set([normalizeNetworkToken(source.network_key), normalizeNetworkToken(source.network_name)])
  const targetTokens = new Set([normalizeNetworkToken(target.network_key), normalizeNetworkToken(target.network_name)])
  const tokenOverlap = [...sourceTokens].some((token) => token && targetTokens.has(token))
  if (tokenOverlap) {
    score += 100
  }

  const sourceName = normalizeNetworkToken(source.network_name)
  const targetName = normalizeNetworkToken(target.network_name)
  if (sourceName && targetName && (sourceName.includes(targetName) || targetName.includes(sourceName))) {
    score += 40
  }

  if (source.withdraw_min != null && target.withdraw_min != null && source.withdraw_min === target.withdraw_min) {
    score += 10
  }
  if (source.deposit_min != null && target.deposit_min != null && source.deposit_min === target.deposit_min) {
    score += 10
  }
  if (source.withdraw_fee != null && target.withdraw_fee != null && source.withdraw_fee === target.withdraw_fee) {
    score += 10
  }
  if (source.deposit_enabled != null && source.deposit_enabled === target.deposit_enabled) {
    score += 5
  }
  if (source.withdraw_enabled != null && source.withdraw_enabled === target.withdraw_enabled) {
    score += 5
  }

  if (sourceCount === 1 && targetCount === 1) {
    score += 35
  }

  return score
}

function normalizeNetworkToken(value: string | null | undefined) {
  return String(value ?? "")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "")
}
function formatMaybeAssetAmount(value: number | null | undefined, asset: string | null | undefined) {
  if (value === undefined || value === null) return "-"
  const formattedValue = value.toLocaleString("pt-BR", { maximumFractionDigits: 8 })
  const normalizedAsset = String(asset ?? "").trim().toUpperCase()
  return normalizedAsset ? `${formattedValue} ${normalizedAsset}` : formattedValue
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatAmount(value: number) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })
}



