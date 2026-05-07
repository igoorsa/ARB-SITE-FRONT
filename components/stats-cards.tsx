"use client"

import { useMemo } from "react"
import { BarChart3, DollarSign, TrendingUp, Zap } from "lucide-react"
import { usePreferences } from "@/components/preferences-provider"
import { Card, CardContent } from "@/components/ui/card"
import type { SpreadItem } from "@/lib/types"
import { cn } from "@/lib/utils"

interface StatsCardsProps {
  data: SpreadItem[]
}

export function StatsCards({ data }: StatsCardsProps) {
  const { t } = usePreferences()
  const stats = useMemo(() => {
    if (data.length === 0) {
      return {
        totalOpportunities: 0,
        avgSpread: 0,
        maxSpread: 0,
        totalVolume: 0,
      }
    }

    const spreads = data.map((item) => item.entry_spread_pct)
    const volumes = data.map((item) => item.entry_volume_usdt || 0)

    return {
      totalOpportunities: data.length,
      avgSpread: spreads.reduce((a, b) => a + b, 0) / spreads.length,
      maxSpread: Math.max(...spreads),
      totalVolume: volumes.reduce((a, b) => a + b, 0),
    }
  }, [data])

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard icon={BarChart3} label={t("opportunities")} value={stats.totalOpportunities.toString()} subtitle={t("monitoredAssets")} />
      <StatCard
        icon={TrendingUp}
        label={t("avgSpread")}
        value={`${stats.avgSpread.toFixed(2)}%`}
        subtitle={t("entrySpreadSubtitle")}
        valueColor={stats.avgSpread >= 0.5 ? "text-primary" : "text-foreground"}
      />
      <StatCard icon={Zap} label={t("maxSpread")} value={`${stats.maxSpread.toFixed(2)}%`} subtitle={t("bestOpportunity")} valueColor="text-primary" />
      <StatCard icon={DollarSign} label={t("totalVolume")} value={formatCurrency(stats.totalVolume)} subtitle={t("availableLiquidity")} />
    </div>
  )
}

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string
  subtitle: string
  valueColor?: string
}

function StatCard({ icon: Icon, label, value, subtitle, valueColor = "text-foreground" }: StatCardProps) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className={cn("mt-1 text-2xl font-bold", valueColor)}>{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="rounded-lg bg-primary/10 p-2">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`
  }
  return `$${value.toFixed(0)}`
}
