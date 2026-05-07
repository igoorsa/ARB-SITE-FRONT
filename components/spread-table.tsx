"use client"

import Link from "next/link"
import { memo, useMemo, useState } from "react"
import { ArrowUpDown, BarChart3, TrendingDown, TrendingUp } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { usePreferences } from "@/components/preferences-provider"
import type { SpreadItem } from "@/lib/types"
import { cn } from "@/lib/utils"

interface SpreadTableProps {
  data: SpreadItem[]
  pairType?: "spot_future" | "spot_spot"
}

type SortKey =
  | "symbol"
  | "spot_exchange"
  | "futures_exchange"
  | "entry_spread_pct"
  | "volume_24h_usdt"
  | "funding_rate"

type SortDirection = "asc" | "desc"

function formatNumber(value: number | undefined, decimals = 2, locale = "pt-BR"): string {
  if (value === undefined || value === null) return "-"
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined || value === null) return "-"
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatPrice(value: number | undefined, locale = "pt-BR"): string {
  if (value === undefined || value === null) return "-"
  if (value >= 1_000) return `$${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (value >= 1) return `$${value.toLocaleString(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
  return `$${value.toLocaleString(locale, { minimumFractionDigits: 6, maximumFractionDigits: 6 })}`
}

function buildPairMonitorHref(item: SpreadItem, pairType: "spot_future" | "spot_spot"): string {
  const params = new URLSearchParams()
  params.set("pair_key", item.pair_key)
  params.set("pair_type", item.pair_type ?? pairType)
  params.set("symbol", item.symbol)
  params.set("spot_exchange", item.spot_exchange)
  params.set("futures_exchange", item.futures_exchange)
  return `/pair?${params.toString()}`
}

function getVolumeSortValue(item: SpreadItem): number {
  const spot = item.spot_volume_24h_usdt ?? 0
  const future = item.future_volume_24h_usdt ?? 0
  if (spot > 0 && future > 0) return Math.min(spot, future)
  return Math.max(spot, future)
}

function getSpreadColor(spread: number): string {
  if (spread >= 1) return "text-primary"
  if (spread >= 0.5) return "text-warning"
  if (spread >= 0) return "text-muted-foreground"
  return "text-destructive"
}

function getSpreadBgColor(spread: number): string {
  if (spread >= 1) return "bg-primary/10"
  if (spread >= 0.5) return "bg-warning/10"
  return "bg-muted/50"
}

export function SpreadTable({ data, pairType = "spot_future" }: SpreadTableProps) {
  const { t, locale } = usePreferences()
  const [sortKey, setSortKey] = useState<SortKey>("symbol")
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc")

  const sortedData = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1
    const items = [...data]

    items.sort((left, right) => {
      const getValue = (item: SpreadItem) => {
        switch (sortKey) {
          case "symbol":
            return item.symbol
          case "spot_exchange":
            return item.spot_exchange
          case "futures_exchange":
            return item.futures_exchange
          case "entry_spread_pct":
            return item.entry_spread_pct
          case "volume_24h_usdt":
            return getVolumeSortValue(item)
          case "funding_rate":
            return item.funding_rate ?? Number.NEGATIVE_INFINITY
        }
      }

      const leftValue = getValue(left)
      const rightValue = getValue(right)

      if (typeof leftValue === "string" && typeof rightValue === "string") {
        return leftValue.localeCompare(rightValue, locale) * direction
      }

      return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction
    })

    return items
  }, [data, locale, sortDirection, sortKey])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }

    setSortKey(key)
    setSortDirection(
      key === "symbol" || key === "spot_exchange" || key === "futures_exchange" ? "asc" : "desc"
    )
  }

  const renderSortableHeader = (
    label: string,
    key: SortKey,
    align: "left" | "right" | "center" = "left",
    widthClass = ""
  ) => (
    <TableHead
      className={cn(
        "font-medium text-muted-foreground",
        widthClass,
        align === "right" && "text-right",
        align === "center" && "text-center"
      )}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-foreground",
          align === "right" && "ml-auto",
          align === "center" && "mx-auto"
        )}
      >
        <span>{label}</span>
        <ArrowUpDown className="h-4 w-4" />
      </button>
    </TableHead>
  )

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <BarChart3 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-medium text-foreground">{t("noOpportunities")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("noOpportunitiesDescription")}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="overflow-x-auto">
        <Table className="min-w-[1490px] table-fixed">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {renderSortableHeader(t("pair"), "symbol", "left", "w-[200px]")}
              {renderSortableHeader(pairType === "spot_spot" ? t("spotBuy") : t("spot"), "spot_exchange", "left", "w-[120px]")}
              {renderSortableHeader(pairType === "spot_spot" ? t("spotSell") : t("futures"), "futures_exchange", "left", "w-[120px]")}
              {pairType === "spot_future" ? renderSortableHeader(t("funding"), "funding_rate", "right", "w-[105px]") : null}
              {renderSortableHeader(pairType === "spot_spot" ? t("profit") : t("entrySpread"), "entry_spread_pct", "right", "w-[135px]")}
              {pairType === "spot_future" ? (
                <TableHead className="w-[135px] text-right font-medium text-muted-foreground">
                  {t("exitSpread")}
                </TableHead>
              ) : null}
              <TableHead className="w-[150px] text-right font-medium text-muted-foreground">
                {pairType === "spot_spot" ? t("buyBook") : t("spotBook")}
              </TableHead>
              <TableHead className="w-[150px] text-right font-medium text-muted-foreground">
                {pairType === "spot_spot" ? t("sellBook") : t("futureBook")}
              </TableHead>
              {renderSortableHeader(t("volume24h"), "volume_24h_usdt", "right", "w-[155px]")}
              <TableHead className="w-[145px] text-center font-medium text-muted-foreground">{t("action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedData.map((item) => (
              <SpreadTableRow key={item.pair_key} item={item} pairType={pairType} />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

const SpreadTableRow = memo(function SpreadTableRow({
  item,
  pairType,
}: {
  item: SpreadItem
  pairType: "spot_future" | "spot_spot"
}) {
  const { t, locale } = usePreferences()

  return (
    <TableRow className="border-border transition-colors hover:bg-secondary/50">
      <TableCell className="w-[200px]">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <span className="text-xs font-bold text-primary">
              {item.symbol.split("/")[0].slice(0, 2)}
            </span>
          </div>
          <div className="min-w-0">
            <span className="block truncate font-medium text-foreground">{item.symbol}</span>
          </div>
        </div>
      </TableCell>
      <TableCell className="w-[110px]">
        <Badge variant="secondary" className="uppercase text-xs">
          {item.spot_exchange}
        </Badge>
      </TableCell>
      <TableCell className="w-[115px]">
        <Badge variant="outline" className="border-primary/30 text-xs uppercase text-primary">
          {item.futures_exchange}
        </Badge>
      </TableCell>
      {pairType === "spot_future" ? (
        <TableCell className="w-[105px] text-right">
          {item.funding_rate !== undefined ? (
            <span
              className={cn(
                "font-medium",
                item.funding_rate >= 0 ? "text-primary" : "text-destructive"
              )}
            >
              {item.funding_rate >= 0 ? "+" : ""}
              {formatNumber(item.funding_rate * 100, 4, locale)}%
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </TableCell>
      ) : null}
      <TableCell className="w-[135px] text-right">
        <div className={cn("flex items-center justify-end gap-1", getSpreadColor(item.entry_spread_pct))}>
          {item.entry_spread_pct >= 0 ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )}
          <span className={cn("rounded px-2 py-0.5 font-semibold", getSpreadBgColor(item.entry_spread_pct))}>
            {formatNumber(item.entry_spread_pct, 2, locale)}%
          </span>
        </div>
      </TableCell>
      {pairType === "spot_future" ? (
        <TableCell className="w-[135px] text-right">
          <div className={cn("flex items-center justify-end gap-1", getSpreadColor(item.exit_spread_pct))}>
            {item.exit_spread_pct >= 0 ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            <span className={cn("rounded px-2 py-0.5 font-semibold", getSpreadBgColor(item.exit_spread_pct))}>
              {formatNumber(item.exit_spread_pct, 2, locale)}%
            </span>
          </div>
        </TableCell>
      ) : null}
      <TableCell className="w-[150px] text-right">
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">
              {pairType === "spot_spot" ? "Ask" : "Ask"}
            </span>
            <span className="font-medium text-rose-600">
              {formatPrice(item.best_spot_ask, locale)}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">Bid</span>
            <span className="font-medium text-emerald-600">
              {formatPrice(item.best_spot_bid, locale)}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="w-[150px] text-right">
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">
              {pairType === "spot_spot" ? "Bid" : "Ask"}
            </span>
            <span className="font-medium text-rose-600">
              {formatPrice(pairType === "spot_spot" ? item.best_future_bid : item.best_future_ask, locale)}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">
              {pairType === "spot_spot" ? "Ask" : "Bid"}
            </span>
            <span className="font-medium text-emerald-600">
              {formatPrice(pairType === "spot_spot" ? item.best_future_ask : item.best_future_bid, locale)}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="w-[155px] pr-2 text-right">
        <div className="space-y-1">
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">{pairType === "spot_spot" ? t("buy") : t("spot")}</span>
            <span className="font-medium text-foreground">
              {formatCurrency(item.spot_volume_24h_usdt)}
            </span>
          </div>
          <div className="flex items-center justify-end gap-2 text-xs">
            <span className="text-muted-foreground">{pairType === "spot_spot" ? t("sell") : "Future"}</span>
            <span className="font-medium text-foreground">
              {formatCurrency(item.future_volume_24h_usdt)}
            </span>
          </div>
        </div>
      </TableCell>
      <TableCell className="w-[145px] text-center">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="whitespace-nowrap px-3 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Link href={buildPairMonitorHref(item, pairType)}>
            <BarChart3 className="mr-1 h-4 w-4" />
            {t("analyze")}
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  )
}, (previousProps, nextProps) => previousProps.item === nextProps.item && previousProps.pairType === nextProps.pairType)
