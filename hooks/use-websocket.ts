"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { decode } from "@msgpack/msgpack"
import type { SpreadItem, SnapshotResponse } from "@/lib/types"

interface UseWebSocketOptions {
  url: string
  enabled?: boolean
  reconnectAttempts?: number
  reconnectInterval?: number
}

interface WebSocketState {
  data: SpreadItem[]
  isConnected: boolean
  error: string | null
  lastUpdate: Date | null
  hasFreshData: boolean
}

export function useWebSocket({
  url,
  enabled = true,
  reconnectAttempts = 5,
  reconnectInterval = 3000,
}: UseWebSocketOptions): WebSocketState {
  const [state, setState] = useState<WebSocketState>({
    data: [],
    isConnected: false,
    error: null,
    lastUpdate: null,
    hasFreshData: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const columnsRef = useRef<string[] | null>(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const shouldReconnectRef = useRef(true)
  const manuallyClosedRef = useRef(false)

  const connect = useCallback(() => {
    if (!enabled || !url) return

    shouldReconnectRef.current = true
    manuallyClosedRef.current = false

    try {
      const ws = new WebSocket(url)
      ws.binaryType = "arraybuffer"
      wsRef.current = ws

      ws.onopen = () => {
        console.log("[v0] WebSocket connected")
        reconnectCountRef.current = 0
        setState((prev) => ({ ...prev, isConnected: true, error: null }))
      }

      ws.onmessage = (event) => {
        try {
          const message = parseWebSocketMessage(event.data) as
            | SnapshotResponse
            | { generated_at?: string; items?: SpreadItem[] }
            | {
                generated_at?: string
                type?: string
                upserts?: SpreadItem[] | unknown[][]
                removals?: string[]
                count?: number
                columns?: string[]
                items?: SpreadItem[] | unknown[][]
              }
            | SpreadItem[]
          const generatedAt = Array.isArray(message) ? null : message.generated_at

          if (Array.isArray(message)) {
            setState((prev) => ({
              ...prev,
              data: message,
              lastUpdate: new Date(),
              hasFreshData: true,
            }))
            return
          }

          if (message.type === "delta") {
            if (Array.isArray(message.columns) && message.columns.length > 0) {
              columnsRef.current = message.columns
            }
            const upserts = normalizeIncomingItems(message.upserts, columnsRef.current)
            const removals = Array.isArray(message.removals) ? message.removals : []
            setState((prev) => ({
              ...prev,
              data: applySpreadDeltas(prev.data, upserts, removals),
              lastUpdate: generatedAt ? new Date(generatedAt) : new Date(),
              hasFreshData: true,
            }))
            return
          }

          if (Array.isArray(message.columns) && message.columns.length > 0) {
            columnsRef.current = message.columns
          }
          const items = normalizeIncomingItems(message.items, columnsRef.current)
          if (!items) return

          setState((prev) => ({
            ...prev,
            data: items,
            lastUpdate: generatedAt ? new Date(generatedAt) : new Date(),
            hasFreshData: true,
          }))
        } catch (err) {
          console.error("[v0] Error parsing WebSocket message:", err)
        }
      }

      ws.onerror = (error) => {
        if (manuallyClosedRef.current) return
        setState((prev) => ({ ...prev, error: "Erro na conexao WebSocket" }))
      }

      ws.onclose = () => {
        console.log("[v0] WebSocket disconnected")
        setState((prev) => ({ ...prev, isConnected: false }))

        if (!shouldReconnectRef.current || manuallyClosedRef.current) {
          return
        }

        if (reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(
              `[v0] Attempting reconnect ${reconnectCountRef.current}/${reconnectAttempts}`
            )
            connect()
          }, reconnectInterval)
        }
      }
    } catch (err) {
      console.error("[v0] Error creating WebSocket:", err)
      setState((prev) => ({ ...prev, error: "Falha ao criar conexao WebSocket" }))
    }
  }, [url, enabled, reconnectAttempts, reconnectInterval])

  useEffect(() => {
    setState((prev) => ({ ...prev, hasFreshData: false, error: null }))
    connect()

    return () => {
      shouldReconnectRef.current = false
      manuallyClosedRef.current = true

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  return state
}

function parseWebSocketMessage(payload: string | ArrayBuffer | Blob): unknown {
  if (typeof payload === "string") {
    return JSON.parse(payload)
  }
  if (payload instanceof ArrayBuffer) {
    return decode(new Uint8Array(payload))
  }
  throw new Error("Formato de mensagem WebSocket nao suportado")
}

function normalizeIncomingItems(
  items: SpreadItem[] | unknown[][] | undefined,
  columns: string[] | null
): SpreadItem[] | null {
  if (!Array.isArray(items)) {
    return null
  }

  if (items.length === 0) {
    return []
  }

  if (!Array.isArray(items[0])) {
    return items as SpreadItem[]
  }

  if (!columns || columns.length === 0) {
    return []
  }

  return (items as unknown[][])
    .map((row) => liteRowToSpreadItem(row, columns))
    .filter((item): item is SpreadItem => Boolean(item))
}

function liteRowToSpreadItem(row: unknown[], columns: string[]): SpreadItem | null {
  if (!Array.isArray(row)) {
    return null
  }

  const record: Record<string, unknown> = {}
  columns.forEach((column, index) => {
    record[column] = row[index]
  })

  if (typeof record.pair_key !== "string" || typeof record.symbol !== "string") {
    return null
  }

  return {
    pair_key: record.pair_key,
    pair_type: typeof record.pair_type === "string" ? record.pair_type : undefined,
    symbol: record.symbol,
    spot_exchange: typeof record.spot_exchange === "string" ? record.spot_exchange : "",
    futures_exchange: typeof record.futures_exchange === "string" ? record.futures_exchange : "",
    entry_spread_pct: Number(record.entry_spread_pct ?? 0),
    exit_spread_pct: Number(record.exit_spread_pct ?? 0),
    entry_volume_usdt: Number(record.entry_volume_usdt ?? 0),
    exit_volume_usdt: Number(record.exit_volume_usdt ?? 0),
    spot_volume_24h_usdt: toOptionalNumber(record.spot_volume_24h_usdt),
    future_volume_24h_usdt: toOptionalNumber(record.future_volume_24h_usdt),
    best_spot_bid: toOptionalNumber(record.best_spot_bid),
    best_spot_ask: toOptionalNumber(record.best_spot_ask),
    best_future_bid: toOptionalNumber(record.best_future_bid),
    best_future_ask: toOptionalNumber(record.best_future_ask),
    funding_rate: toOptionalNumber(record.funding_rate),
    updated_at: typeof record.updated_at === "string" ? record.updated_at : new Date().toISOString(),
  }
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function applySpreadDeltas(previous: SpreadItem[], upserts: SpreadItem[], removals: string[]): SpreadItem[] {
  const nextByKey = new Map(previous.map((item) => [item.pair_key, item]))

  for (const pairKey of removals) {
    nextByKey.delete(pairKey)
  }

  for (const item of upserts) {
    nextByKey.set(item.pair_key, item)
  }

  return Array.from(nextByKey.values())
}
