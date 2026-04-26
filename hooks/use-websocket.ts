"use client"

import { useCallback, useEffect, useRef, useState } from "react"
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
      wsRef.current = ws

      ws.onopen = () => {
        console.log("[v0] WebSocket connected")
        reconnectCountRef.current = 0
        setState((prev) => ({ ...prev, isConnected: true, error: null }))
      }

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as
            | SnapshotResponse
            | { generated_at?: string; items?: SpreadItem[] }
            | SpreadItem[]
          const items = Array.isArray(message) ? message : message.items
          const generatedAt = Array.isArray(message) ? null : message.generated_at

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
