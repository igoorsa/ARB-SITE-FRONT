"use client"

import { useEffect, useState } from "react"
import { Clock, DollarSign, Loader2, Percent, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { CandlestickChartCustom } from "@/components/candlestick-chart"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchCandles } from "@/lib/api"
import type { CandleData, SpreadItem } from "@/lib/types"
import { cn } from "@/lib/utils"

interface AnalysisModalProps {
  item: SpreadItem | null
  isOpen: boolean
  onClose: () => void
}

const TIME_RANGES = [
  { value: "60", label: "1 Hora" },
  { value: "240", label: "4 Horas" },
  { value: "1440", label: "24 Horas" },
  { value: "4320", label: "3 Dias" },
  { value: "10080", label: "7 Dias" },
]

export function AnalysisModal({ item, isOpen, onClose }: AnalysisModalProps) {
  const [timeRange, setTimeRange] = useState("240")
  const [candles, setCandles] = useState<CandleData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!item || !isOpen) return

    let isActive = true

    const loadCandles = async () => {
      setLoading(true)
      setError(null)

      try {
        const minutes = parseInt(timeRange, 10)

        let data = await fetchCandles({
          pair_key: item.pair_key,
          minutes,
          limit: minutes,
        })

        if (data.length === 0) {
          data = await fetchCandles({
            spot_exchange: item.spot_exchange,
            futures_exchange: item.futures_exchange,
            coin: item.symbol,
            minutes,
            limit: minutes,
          })
        }

        if (!isActive) return

        if (data.length === 0) {
          setCandles([])
          setError("Nenhum candle encontrado para este par no período selecionado")
          return
        }

        setCandles(data)
      } catch (err) {
        if (!isActive) return

        console.error("[v0] Error fetching candles:", err)
        setCandles([])
        setError("Falha ao carregar dados do gráfico")
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    loadCandles()

    return () => {
      isActive = false
    }
  }, [item, timeRange, isOpen])

  if (!item) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[98vw] max-w-[1700px] max-h-[96vh] overflow-y-auto bg-card border-border p-6 md:p-8">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">
                  {item.symbol.split("/")[0].slice(0, 3)}
                </span>
              </div>
              <div>
                <span className="text-xl font-bold text-foreground">{item.symbol}</span>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="uppercase text-xs">
                    {item.spot_exchange}
                  </Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="outline" className="uppercase text-xs border-primary/30 text-primary">
                    {item.futures_exchange}
                  </Badge>
                </div>
              </div>
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mt-5">
          <StatCard
            icon={TrendingUp}
            label="Spread Entrada"
            value={`${item.entry_spread_pct.toFixed(2)}%`}
            color={item.entry_spread_pct >= 0 ? "text-primary" : "text-destructive"}
          />
          <StatCard
            icon={TrendingDown}
            label="Spread Saída"
            value={`${item.exit_spread_pct.toFixed(2)}%`}
            color={item.exit_spread_pct >= 0 ? "text-primary" : "text-destructive"}
          />
          <StatCard
            icon={DollarSign}
            label="Volume 24h"
            value={
              <div className="space-y-1 text-base font-semibold">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">Spot</span>
                  <span>{formatCurrency(item.spot_volume_24h_usdt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-muted-foreground">Future</span>
                  <span>{formatCurrency(item.future_volume_24h_usdt)}</span>
                </div>
              </div>
            }
            color="text-foreground"
          />
          <StatCard
            icon={Percent}
            label="Funding Rate"
            value={item.funding_rate ? `${(item.funding_rate * 100).toFixed(4)}%` : "-"}
            color={item.funding_rate && item.funding_rate >= 0 ? "text-primary" : "text-destructive"}
          />
        </div>

        <div className="flex items-center justify-between mt-6">
          <h3 className="text-lg font-medium text-foreground">Histórico de Spreads</h3>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-[140px] bg-secondary border-border">
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
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-[400px]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-destructive mb-2">{error}</p>
            <p className="text-sm text-muted-foreground">
              Tente outro período ou confira se esse par já possui histórico persistido
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 mt-5">
          <CandlestickChartCustom
            data={candles}
            type="entry"
            title="Spread de Entrada (OHLC)"
          />
          <CandlestickChartCustom
            data={candles}
            type="exit"
            title="Spread de Saída (OHLC)"
          />
        </div>

        {(item.best_spot_bid || item.best_future_bid) && (
          <div className="mt-6 p-5 bg-secondary/50 rounded-lg">
            <h4 className="text-sm font-medium text-foreground mb-3">
              Preços Atuais
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Spot Bid:</span>
                <span className="ml-2 font-mono text-foreground">
                  ${item.best_spot_bid?.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Spot Ask:</span>
                <span className="ml-2 font-mono text-foreground">
                  ${item.best_spot_ask?.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Future Bid:</span>
                <span className="ml-2 font-mono text-foreground">
                  ${item.best_future_bid?.toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Future Ask:</span>
                <span className="ml-2 font-mono text-foreground">
                  ${item.best_future_ask?.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  color: string
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <div className="bg-secondary/50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className={cn("text-xl font-bold", color)}>{value}</div>
    </div>
  )
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null) return "-"
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}
