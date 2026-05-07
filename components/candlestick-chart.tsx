"use client"

import { useMemo, useState } from "react"
import { usePreferences } from "@/components/preferences-provider"
import type { CandleData } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CandlestickChartProps {
  data: CandleData[]
  type: "entry" | "exit"
  title: string
  isUpdating?: boolean
}

interface CandleChartData {
  time: string
  fullTime: string
  open: number
  high: number
  low: number
  close: number
  isBullish: boolean
  variation: number
}

const SVG_WIDTH = 1200
const SVG_HEIGHT = 520
const MARGIN = { top: 24, right: 28, bottom: 54, left: 86 }
const INNER_WIDTH = SVG_WIDTH - MARGIN.left - MARGIN.right
const INNER_HEIGHT = SVG_HEIGHT - MARGIN.top - MARGIN.bottom

function formatTime(dateString: string, locale = "pt-BR"): string {
  const date = new Date(dateString)
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatPercent(value: number) {
  return `${value.toFixed(3)}%`
}

function normalizeCandles(data: CandleData[], type: "entry" | "exit", locale = "pt-BR") {
  return [...data].reverse().map((candle) => {
    const open = type === "entry" ? candle.entry_open : candle.exit_open
    const high = type === "entry" ? candle.entry_high : candle.exit_high
    const low = type === "entry" ? candle.entry_low : candle.exit_low
    const close = type === "entry" ? candle.entry_close : candle.exit_close

    return {
      time: formatTime(candle.minute_start, locale),
      fullTime: candle.minute_start,
      open,
      high,
      low,
      close,
      isBullish: close >= open,
      variation: close - open,
    }
  })
}

export function CandlestickChartCustom({
  data,
  type,
  title,
  isUpdating = false,
}: CandlestickChartProps) {
  const { t, locale } = usePreferences()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const chartData = useMemo(() => normalizeCandles(data, type, locale), [data, locale, type])

  const scale = useMemo(() => {
    if (chartData.length === 0) {
      return {
        min: 0,
        max: 1,
        ticks: [0, 0.25, 0.5, 0.75, 1],
      }
    }

    const lows = chartData.map((item) => item.low)
    const highs = chartData.map((item) => item.high)
    const min = Math.min(...lows)
    const max = Math.max(...highs)
    const padding = Math.max((max - min) * 0.12, 0.02)
    const paddedMin = min - padding
    const paddedMax = max + padding
    const step = (paddedMax - paddedMin) / 4

    return {
      min: paddedMin,
      max: paddedMax,
      ticks: Array.from({ length: 5 }, (_, index) => paddedMin + step * index),
    }
  }, [chartData])

  const projectY = (value: number) => {
    if (scale.max === scale.min) return MARGIN.top + INNER_HEIGHT / 2
    const ratio = (value - scale.min) / (scale.max - scale.min)
    return MARGIN.top + INNER_HEIGHT - ratio * INNER_HEIGHT
  }

  if (chartData.length === 0) {
    return (
      <div className="bg-secondary/50 rounded-xl p-8 text-center min-h-[560px] flex items-center justify-center">
        <p className="text-muted-foreground">{t("noData")}</p>
      </div>
    )
  }

  const safeLastIndex = Math.max(chartData.length - 1, 0)
  const activeIndex = hoveredIndex !== null && chartData[hoveredIndex] ? hoveredIndex : safeLastIndex
  const activeCandle = chartData[activeIndex]

  if (!activeCandle) {
    return (
      <div className="bg-secondary/50 rounded-xl p-8 text-center min-h-[560px] flex items-center justify-center">
        <p className="text-muted-foreground">{t("waitingChartData")}</p>
      </div>
    )
  }
  const slotWidth = INNER_WIDTH / chartData.length
  const candleWidth = Math.max(1, Math.min(10, slotWidth * 0.72))
  const labelStep = Math.max(1, Math.ceil(chartData.length / 7))
  const wickWidth = slotWidth < 3 ? 0.9 : slotWidth < 6 ? 1.1 : 1.5

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <span
            className={`w-3 h-3 rounded-full ${
              type === "entry" ? "bg-primary" : "bg-chart-2"
            }`}
          />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {isUpdating ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-secondary/70 px-2.5 py-1 text-[11px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {t("updating")}
            </span>
          ) : null}
          <span className="text-xs text-muted-foreground">{chartData.length} candles</span>
        </div>
      </div>

      <div className={cn("mb-4 grid grid-cols-2 gap-3 rounded-xl border border-border/70 bg-secondary/25 p-4 text-sm xl:grid-cols-7 transition-opacity", isUpdating && "opacity-70")}>
        <MetricChip label={t("time")} value={activeCandle.time} />
        <MetricChip label="Open" value={formatPercent(activeCandle.open)} />
        <MetricChip label="Max" value={formatPercent(activeCandle.high)} />
        <MetricChip label="Min" value={formatPercent(activeCandle.low)} />
        <MetricChip label="Close" value={formatPercent(activeCandle.close)} />
        <MetricChip label="Range" value={formatPercent(activeCandle.high - activeCandle.low)} />
        <MetricChip
          label={t("variation")}
          value={formatPercent(activeCandle.variation)}
          tone={activeCandle.variation >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className={cn("relative h-[560px] w-full overflow-hidden rounded-xl border border-border/70 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.00))] transition-opacity", isUpdating && "opacity-75")}>
        {isUpdating ? (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            {t("updatingCandles")}
          </div>
        ) : null}
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} className="h-full w-full" preserveAspectRatio="none">
          <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill="transparent" />

          {scale.ticks.map((tick) => {
            const y = projectY(tick)
            return (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  y1={y}
                  x2={SVG_WIDTH - MARGIN.right}
                  y2={y}
                  stroke="var(--border)"
                  strokeDasharray="4 8"
                  opacity="0.45"
                />
                <text
                  x={MARGIN.left - 12}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="12"
                  fill="var(--muted-foreground)"
                >
                  {tick.toFixed(2)}%
                </text>
              </g>
            )
          })}

          {chartData.map((candle, index) => {
            const xCenter = MARGIN.left + slotWidth * index + slotWidth / 2
            const highY = projectY(candle.high)
            const lowY = projectY(candle.low)
            const openY = projectY(candle.open)
            const closeY = projectY(candle.close)
            const bodyY = Math.min(openY, closeY)
            const bodyHeight = Math.max(Math.abs(closeY - openY), 1.2)
            const color = candle.isBullish ? "#22c55e" : "#ef4444"
            const isHovered = hoveredIndex === index

            return (
              <g key={candle.fullTime}>
                {isHovered ? (
                  <rect
                    x={xCenter - slotWidth / 2}
                    y={MARGIN.top}
                    width={slotWidth}
                    height={INNER_HEIGHT}
                    fill="rgba(148, 163, 184, 0.08)"
                  />
                ) : null}
                <line
                  x1={xCenter}
                  y1={highY}
                  x2={xCenter}
                  y2={lowY}
                  stroke={color}
                  strokeWidth={wickWidth}
                  strokeLinecap="round"
                />
                <rect
                  x={xCenter - candleWidth / 2}
                  y={bodyY}
                  width={candleWidth}
                  height={bodyHeight}
                  rx={1.5}
                  fill={color}
                />
                <rect
                  x={xCenter - slotWidth / 2}
                  y={MARGIN.top}
                  width={slotWidth}
                  height={INNER_HEIGHT}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            )
          })}

          {chartData.map((candle, index) => {
            if (index % labelStep !== 0 && index !== chartData.length - 1) {
              return null
            }

            const xCenter = MARGIN.left + slotWidth * index + slotWidth / 2
            return (
              <text
                key={`${candle.fullTime}-label`}
                x={xCenter}
                y={SVG_HEIGHT - 18}
                textAnchor="middle"
                fontSize="12"
                fill="var(--muted-foreground)"
              >
                {candle.time}
              </text>
            )
          })}

          <line
            x1={MARGIN.left}
            y1={MARGIN.top + INNER_HEIGHT}
            x2={SVG_WIDTH - MARGIN.right}
            y2={MARGIN.top + INNER_HEIGHT}
            stroke="var(--border)"
          />
          <line
            x1={MARGIN.left}
            y1={MARGIN.top}
            x2={MARGIN.left}
            y2={MARGIN.top + INNER_HEIGHT}
            stroke="var(--border)"
          />
        </svg>
      </div>
    </div>
  )
}

function MetricChip({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "positive" | "negative"
}) {
  return (
    <div className="rounded-lg bg-background/70 px-3 py-2">
      <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-sm font-semibold ${
          tone === "positive"
            ? "text-green-500"
            : tone === "negative"
              ? "text-red-500"
              : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  )
}
