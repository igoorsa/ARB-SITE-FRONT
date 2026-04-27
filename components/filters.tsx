"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { FilterState } from "@/lib/types"
import { cn } from "@/lib/utils"

interface FiltersProps {
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
  pairType?: "spot_future" | "spot_spot"
}

const SPOT_EXCHANGES = ["binance", "bingx", "bybit", "gate", "kucoin", "mexc", "okx", "htx"]
const FUTURES_EXCHANGES = ["binance", "bitget", "bybit", "okx", "gate", "mexc"]

export function Filters({ filters, onFiltersChange, pairType = "spot_future" }: FiltersProps) {
  const [draft, setDraft] = useState<FilterState>(filters)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setDraft(filters)
  }, [filters])

  const updateDraft = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const toggleExchange = (key: "spot_exchange" | "futures_exchange", value: string) => {
    setDraft((previous) => {
      const current = previous[key]
      const next = current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
      return { ...previous, [key]: next }
    })
  }

  const resetDraft = () => {
    setDraft({
      spot_exchange: [],
      futures_exchange: [],
      coin: "",
      min_entry_spread_pct: 0,
      refresh_interval_seconds: 5,
    })
  }

  const clearExchanges = (key: "spot_exchange" | "futures_exchange") => {
    setDraft((previous) => ({ ...previous, [key]: [] }))
  }

  const applyFilters = () => {
    onFiltersChange(draft)
    setMobileOpen(false)
  }

  const hasAppliedFilters =
    filters.spot_exchange.length > 0 ||
    filters.futures_exchange.length > 0 ||
    Boolean(filters.coin) ||
    filters.min_entry_spread_pct > 0 ||
    filters.refresh_interval_seconds !== 5

  const hasDraftChanges = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(filters),
    [draft, filters]
  )
  const isSpotSpot = pairType === "spot_spot"
  const desktopSpotLabel = isSpotSpot ? "Spot compra" : "Spot"
  const desktopFuturesLabel = isSpotSpot ? "Spot venda" : "Futuros"
  const mobileSpotLabel = isSpotSpot ? "Exchange Spot compra" : "Exchange Spot"
  const mobileFuturesLabel = isSpotSpot ? "Exchange Spot venda" : "Exchange Futuros"

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar moeda (ex: BTC, ETH)"
              value={draft.coin}
              onChange={(e) => updateDraft("coin", e.target.value.toUpperCase())}
              className="border-border bg-secondary pl-10"
            />
          </div>
        </div>

        <div className="hidden items-center gap-4 lg:flex">
          <ExchangeMultiSelect
            label={desktopSpotLabel}
            placeholder="Todas"
            options={SPOT_EXCHANGES}
            selected={draft.spot_exchange}
            onToggle={(value) => toggleExchange("spot_exchange", value)}
            onSelectAll={() => clearExchanges("spot_exchange")}
          />

          <ExchangeMultiSelect
            label={desktopFuturesLabel}
            placeholder="Todas"
            options={FUTURES_EXCHANGES}
            selected={draft.futures_exchange}
            onToggle={(value) => toggleExchange("futures_exchange", value)}
            onSelectAll={() => clearExchanges("futures_exchange")}
          />

          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm text-muted-foreground">Spread Min:</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={draft.min_entry_spread_pct || ""}
              onChange={(e) => updateDraft("min_entry_spread_pct", parseFloat(e.target.value) || 0)}
              className="w-[88px] border-border bg-secondary"
              placeholder="0%"
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="whitespace-nowrap text-sm text-muted-foreground">Atualizacao:</Label>
            <Input
              type="number"
              step="1"
              min="1"
              value={draft.refresh_interval_seconds || ""}
              onChange={(e) => updateDraft("refresh_interval_seconds", Math.max(1, parseInt(e.target.value, 10) || 5))}
              className="w-[92px] border-border bg-secondary"
              placeholder="5"
            />
            <span className="text-sm text-muted-foreground">s</span>
          </div>

          <Button onClick={applyFilters} disabled={!hasDraftChanges}>
            Aplicar
          </Button>

          {hasAppliedFilters ? (
            <Button
              variant="ghost"
              size="sm"
                onClick={() => {
                  resetDraft()
                  onFiltersChange({
                    spot_exchange: [],
                    futures_exchange: [],
                    coin: "",
                    min_entry_spread_pct: 0,
                    refresh_interval_seconds: 5,
                  })
                }}
                className="text-muted-foreground hover:text-foreground"
            >
              <X className="mr-1 h-4 w-4" />
              Limpar
            </Button>
          ) : null}
        </div>

        <div className="lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filtros
                {hasAppliedFilters ? (
                  <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                    Ativos
                  </span>
                ) : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-6">
                <ExchangeChecklist
                  label={mobileSpotLabel}
                  options={SPOT_EXCHANGES}
                  selected={draft.spot_exchange}
                  onToggle={(value) => toggleExchange("spot_exchange", value)}
                  onSelectAll={() => clearExchanges("spot_exchange")}
                />

                <ExchangeChecklist
                  label={mobileFuturesLabel}
                  options={FUTURES_EXCHANGES}
                  selected={draft.futures_exchange}
                  onToggle={(value) => toggleExchange("futures_exchange", value)}
                  onSelectAll={() => clearExchanges("futures_exchange")}
                />

                <div>
                  <Label className="mb-2 block text-sm text-muted-foreground">Spread Minimo (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={draft.min_entry_spread_pct || ""}
                    onChange={(e) => updateDraft("min_entry_spread_pct", parseFloat(e.target.value) || 0)}
                    className="border-border bg-secondary"
                    placeholder="0%"
                  />
                </div>

                <div>
                  <Label className="mb-2 block text-sm text-muted-foreground">Atualizacao (segundos)</Label>
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={draft.refresh_interval_seconds || ""}
                    onChange={(e) => updateDraft("refresh_interval_seconds", Math.max(1, parseInt(e.target.value, 10) || 5))}
                    className="border-border bg-secondary"
                    placeholder="5"
                  />
                </div>

                <div className="mt-auto flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={resetDraft}>
                    Limpar rascunho
                  </Button>
                  <Button className="flex-1" onClick={applyFilters} disabled={!hasDraftChanges}>
                    Aplicar
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </div>
  )
}

function ExchangeMultiSelect({
  label,
  placeholder,
  options,
  selected,
  onToggle,
  onSelectAll,
}: {
  label: string
  placeholder: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  onSelectAll: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="whitespace-nowrap text-sm text-muted-foreground">{label}:</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="min-w-[180px] justify-between border-border bg-secondary font-normal">
            <span className="truncate">
              {selected.length === 0 ? placeholder : `${selected.length} selecionada(s)`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[240px] p-3">
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {label}
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={onSelectAll}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelectAll()
                }
              }}
              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-secondary"
            >
              <Checkbox checked={selected.length === 0} />
              <span className="flex-1 text-left font-medium">Todas</span>
              {selected.length === 0 ? <Check className="h-4 w-4 text-primary" /> : null}
            </div>
            {options.map((exchange) => {
              const checked = selected.includes(exchange)
              return (
                <div
                  key={exchange}
                  role="button"
                  tabIndex={0}
                  onClick={() => onToggle(exchange)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onToggle(exchange)
                    }
                  }}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-secondary"
                >
                  <Checkbox checked={checked} />
                  <span className="flex-1 text-left">{exchange.toUpperCase()}</span>
                  {checked ? <Check className="h-4 w-4 text-primary" /> : null}
                </div>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ExchangeChecklist({
  label,
  options,
  selected,
  onToggle,
  onSelectAll,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
  onSelectAll: () => void
}) {
  return (
    <div>
      <Label className="mb-2 block text-sm text-muted-foreground">{label}</Label>
      <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-3">
        <div
          role="button"
          tabIndex={0}
          onClick={onSelectAll}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              onSelectAll()
            }
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm",
            selected.length === 0 ? "bg-primary/10 text-foreground" : "hover:bg-secondary"
          )}
        >
          <Checkbox checked={selected.length === 0} />
          <span className="font-medium">Todas</span>
        </div>
        {options.map((exchange) => {
          const checked = selected.includes(exchange)
          return (
            <div
              key={exchange}
              role="button"
              tabIndex={0}
              onClick={() => onToggle(exchange)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onToggle(exchange)
                }
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm",
                checked ? "bg-primary/10 text-foreground" : "hover:bg-secondary"
              )}
            >
              <Checkbox checked={checked} />
              <span>{exchange.toUpperCase()}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
