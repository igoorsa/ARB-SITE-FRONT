"use client"

import { gunzipSync, strFromU8, unzlibSync } from "fflate"
import { useEffect, useMemo, useState } from "react"
import { PushDataV3ApiWrapper } from "@/lib/protobuf/PushDataV3ApiWrapper"

export type ExchangeMarketType = "spot" | "future"

export interface ExchangeLegStreamSpec {
  exchangeId: string
  marketType: ExchangeMarketType
  asset: string
}

export interface ExchangeOrderLevel {
  price: number
  amount: number
}

export interface ExchangeDepthSnapshot {
  bids: ExchangeOrderLevel[]
  asks: ExchangeOrderLevel[]
  timestamp: number
  bestBidPrice: number
  bestBidAmount: number
  bestAskPrice: number
  bestAskAmount: number
}

interface UseExchangePairBooksOptions {
  legA: ExchangeLegStreamSpec | null
  legB: ExchangeLegStreamSpec | null
  enabled?: boolean
}

interface UseExchangePairBooksState {
  legABook: ExchangeDepthSnapshot | null
  legBBook: ExchangeDepthSnapshot | null
  isConnected: boolean
  lastUpdate: Date | null
  error: string | null
}

type BookListener = (snapshot: ExchangeDepthSnapshot) => void
type StatusListener = (status: "connected" | "disconnected" | "error", error?: string) => void
type OrderBookSide = Map<string, number>

interface LocalOrderBookState {
  bids: OrderBookSide
  asks: OrderBookSide
}

export function useExchangePairBooks({
  legA,
  legB,
  enabled = true,
}: UseExchangePairBooksOptions): UseExchangePairBooksState {
  const [legABook, setLegABook] = useState<ExchangeDepthSnapshot | null>(null)
  const [legBBook, setLegBBook] = useState<ExchangeDepthSnapshot | null>(null)
  const [legAConnected, setLegAConnected] = useState(false)
  const [legBConnected, setLegBConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)

  const legAKey = useMemo(() => serializeLeg(legA), [legA])
  const legBKey = useMemo(() => serializeLeg(legB), [legB])

  useEffect(() => {
    setLegABook(null)
    setLegBBook(null)
    setLegAConnected(false)
    setLegBConnected(false)
    setLastUpdate(null)
    setError(null)
  }, [legAKey, legBKey])

  useEffect(() => {
    if (!enabled || !legA) return
    return openExchangeDepthStream(
      legA,
      (snapshot) => {
        setLegABook(snapshot)
        setLastUpdate(new Date(snapshot.timestamp))
      },
      (status, nextError) => {
        setLegAConnected(status === "connected")
        if (status === "error" && nextError) setError(nextError)
      }
    )
  }, [enabled, legAKey])

  useEffect(() => {
    if (!enabled || !legB) return
    return openExchangeDepthStream(
      legB,
      (snapshot) => {
        setLegBBook(snapshot)
        setLastUpdate(new Date(snapshot.timestamp))
      },
      (status, nextError) => {
        setLegBConnected(status === "connected")
        if (status === "error" && nextError) setError(nextError)
      }
    )
  }, [enabled, legBKey])

  const activeLegCount = Number(Boolean(legA)) + Number(Boolean(legB))
  const connectedCount = Number(legAConnected) + Number(legBConnected)
  const hasLoadedActiveBooks =
    (!legA || Boolean(legABook)) &&
    (!legB || Boolean(legBBook))

  return {
    legABook,
    legBBook,
    isConnected: activeLegCount > 0 && connectedCount === activeLegCount && hasLoadedActiveBooks,
    lastUpdate,
    error,
  }
}

function serializeLeg(leg: ExchangeLegStreamSpec | null): string {
  if (!leg) return ""
  return `${leg.exchangeId}|${leg.marketType}|${leg.asset}`
}

function openExchangeDepthStream(
  leg: ExchangeLegStreamSpec,
  onBook: BookListener,
  onStatus: StatusListener
): () => void {
  let ws: WebSocket | null = null
  let closedManually = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let localOrderBook: LocalOrderBookState | null = null

  const connect = () => {
    if (closedManually) return

    try {
      ws = createSocketForLeg(leg)
    } catch (error) {
      onStatus("error", error instanceof Error ? error.message : "Conexao nao suportada")
      reconnect()
      return
    }

    ws.onopen = () => {
      onStatus("connected")
      sendSubscribe(ws!, leg)
      heartbeatTimer = startHeartbeat(ws!, leg)
    }

    ws.onmessage = async (event) => {
      const payload = await decodeSocketPayload(event.data)
      if (handleExchangeControlMessage(leg, ws!, payload)) {
        return
      }
      const snapshot = parseExchangeDepthPayload(leg, payload, {
        getOrderBook: () => localOrderBook,
        setOrderBook: (next) => {
          localOrderBook = next
        },
      })
      if (snapshot) onBook(snapshot)
    }

    ws.onerror = () => {
      onStatus("error", `Falha na conexao direta com ${leg.exchangeId} ${leg.marketType}`)
    }

    ws.onclose = () => {
      onStatus("disconnected")
      cleanupSocket()
      reconnect()
    }
  }

  const reconnect = () => {
    if (closedManually) return
    reconnectTimer = setTimeout(connect, 2_000)
  }

  const cleanupSocket = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      ws = null
    }
  }

  connect()

  return () => {
    closedManually = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        sendUnsubscribe(ws, leg)
      } catch {
        // noop
      }
    }
    ws?.close()
    cleanupSocket()
  }
}

function createSocketForLeg(leg: ExchangeLegStreamSpec): WebSocket {
  const exchangeId = leg.exchangeId.toLowerCase()
  if (exchangeId === "binance" && leg.marketType === "spot") {
    return new WebSocket(`wss://stream.binance.com:9443/ws/${toBinanceSymbol(leg.asset)}@depth10@100ms`)
  }
  if (exchangeId === "binance" && leg.marketType === "future") {
    return new WebSocket(`wss://fstream.binance.com/ws/${toBinanceSymbol(leg.asset)}@depth10@100ms`)
  }
  if (exchangeId === "gate" && leg.marketType === "spot") {
    return new WebSocket("wss://api.gateio.ws/ws/v4/")
  }
  if (exchangeId === "gate" && leg.marketType === "future") {
    return new WebSocket(`wss://fx-ws.gateio.ws/v4/ws/${toGateSettle(leg.asset)}`)
  }
  if (exchangeId === "mexc" && leg.marketType === "spot") {
    const socket = new WebSocket("wss://wbs-api.mexc.com/ws")
    socket.binaryType = "arraybuffer"
    return socket
  }
  if (exchangeId === "mexc" && leg.marketType === "future") {
    return new WebSocket("wss://contract.mexc.com/edge")
  }
  if (exchangeId === "bitget" && (leg.marketType === "spot" || leg.marketType === "future")) {
    return new WebSocket("wss://ws.bitget.com/v2/ws/public")
  }
  if (exchangeId === "bybit" && leg.marketType === "spot") {
    return new WebSocket("wss://stream.bybit.com/v5/public/spot")
  }
  if (exchangeId === "kucoin" && leg.marketType === "spot") {
    return new WebSocket("wss://x-push-spot.kucoin.com")
  }
  if (exchangeId === "okx" && leg.marketType === "spot") {
    return new WebSocket("wss://ws.okx.com:8443/ws/v5/public")
  }
  if (exchangeId === "bingx" && leg.marketType === "spot") {
    const socket = new WebSocket("wss://open-api-ws.bingx.com/market")
    socket.binaryType = "arraybuffer"
    return socket
  }
  throw new Error(`Exchange nao suportada: ${leg.exchangeId} ${leg.marketType}`)
}

function sendSubscribe(ws: WebSocket, leg: ExchangeLegStreamSpec) {
  const exchangeId = leg.exchangeId.toLowerCase()
  if (exchangeId === "gate" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: "spot.order_book",
        event: "subscribe",
        payload: [toGateSymbol(leg.asset), "10", "100ms"],
      })
    )
    return
  }
  if (exchangeId === "gate" && leg.marketType === "future") {
    ws.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: "futures.order_book",
        event: "subscribe",
        payload: [toGateSymbol(leg.asset), "10", "0"],
      })
    )
    return
  }
  if (exchangeId === "mexc" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        method: "SUBSCRIPTION",
        params: [`spot@public.limit.depth.v3.api.pb@${toMexcSymbol(leg.asset)}@10`],
        id: Date.now(),
      })
    )
    return
  }
  if (exchangeId === "mexc" && leg.marketType === "future") {
    ws.send(
      JSON.stringify({
        method: "sub.depth.full",
        param: {
          symbol: toMexcFuturesSymbol(leg.asset),
          limit: 10,
        },
        id: Date.now(),
      })
    )
    return
  }
  if (exchangeId === "bitget") {
    ws.send(
      JSON.stringify({
        op: "subscribe",
        args: [
          {
            instType: leg.marketType === "spot" ? "SPOT" : "USDT-FUTURES",
            channel: "books5",
            instId: toBitgetSymbol(leg.asset),
          },
        ],
      })
    )
    return
  }
  if (exchangeId === "bybit" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        op: "subscribe",
        args: [`orderbook.50.${toBybitSymbol(leg.asset)}`],
      })
    )
    return
  }
  if (exchangeId === "kucoin" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        id: String(Date.now()),
        action: "SUBSCRIBE",
        channel: "obu",
        tradeType: "SPOT",
        symbol: toKucoinSymbol(leg.asset),
        depth: "5",
        rpiFilter: 0,
      })
    )
    return
  }
  if (exchangeId === "okx" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        op: "subscribe",
        args: [
          {
            channel: "books5",
            instId: toOkxSymbol(leg.asset),
          },
        ],
      })
    )
    return
  }
  if (exchangeId === "bingx" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        id: String(Date.now()),
        dataType: `${toBingxSymbol(leg.asset)}@depth`,
      })
    )
    return
  }
}

function sendUnsubscribe(ws: WebSocket, leg: ExchangeLegStreamSpec) {
  const exchangeId = leg.exchangeId.toLowerCase()
  if (exchangeId === "gate" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: "spot.order_book",
        event: "unsubscribe",
        payload: [toGateSymbol(leg.asset), "10", "100ms"],
      })
    )
    return
  }
  if (exchangeId === "gate" && leg.marketType === "future") {
    ws.send(
      JSON.stringify({
        time: Math.floor(Date.now() / 1000),
        channel: "futures.order_book",
        event: "unsubscribe",
        payload: [toGateSymbol(leg.asset), "10", "0"],
      })
    )
    return
  }
  if (exchangeId === "mexc" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        method: "UNSUBSCRIPTION",
        params: [`spot@public.limit.depth.v3.api.pb@${toMexcSymbol(leg.asset)}@10`],
        id: Date.now(),
      })
    )
    return
  }
  if (exchangeId === "mexc" && leg.marketType === "future") {
    ws.send(
      JSON.stringify({
        method: "unsub.depth.full",
        param: {
          symbol: toMexcFuturesSymbol(leg.asset),
          limit: 10,
        },
        id: Date.now(),
      })
    )
    return
  }
  if (exchangeId === "bitget") {
    ws.send(
      JSON.stringify({
        op: "unsubscribe",
        args: [
          {
            instType: leg.marketType === "spot" ? "SPOT" : "USDT-FUTURES",
            channel: "books5",
            instId: toBitgetSymbol(leg.asset),
          },
        ],
      })
    )
    return
  }
  if (exchangeId === "bybit" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        op: "unsubscribe",
        args: [`orderbook.50.${toBybitSymbol(leg.asset)}`],
      })
    )
    return
  }
  if (exchangeId === "kucoin" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        id: String(Date.now()),
        action: "UNSUBSCRIBE",
        channel: "obu",
        tradeType: "SPOT",
        symbol: toKucoinSymbol(leg.asset),
        depth: "5",
        rpiFilter: 0,
      })
    )
    return
  }
  if (exchangeId === "okx" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        op: "unsubscribe",
        args: [
          {
            channel: "books5",
            instId: toOkxSymbol(leg.asset),
          },
        ],
      })
    )
    return
  }
  if (exchangeId === "bingx" && leg.marketType === "spot") {
    ws.send(
      JSON.stringify({
        id: String(Date.now()),
        reqType: "unsub",
        dataType: `${toBingxSymbol(leg.asset)}@depth`,
      })
    )
  }
}

function startHeartbeat(ws: WebSocket, leg: ExchangeLegStreamSpec): ReturnType<typeof setInterval> | null {
  const exchangeId = leg.exchangeId.toLowerCase()

  if (exchangeId === "bitget") {
    return setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping")
      }
    }, 25_000)
  }

  if (exchangeId === "mexc" && leg.marketType === "future") {
    return setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ method: "ping" }))
      }
    }, 20_000)
  }

  if (exchangeId === "okx") {
    return setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send("ping")
      }
    }, 25_000)
  }

  return null
}

function handleExchangeControlMessage(
  leg: ExchangeLegStreamSpec,
  ws: WebSocket,
  payload: any | Uint8Array | string | null
): boolean {
  const exchangeId = leg.exchangeId.toLowerCase()

  if (exchangeId === "bingx") {
    if (typeof payload === "string") {
      const normalized = payload.trim().toLowerCase()
      if (normalized === "ping") {
        ws.send("Pong")
        return true
      }
      if (normalized === "pong") {
        return true
      }
    }
    if (payload?.ping != null) {
      ws.send(JSON.stringify({ pong: payload.ping }))
      return true
    }
    if ((payload?.code === 0 || payload?.success === true) && payload?.data == null) {
      return true
    }
  }

  if (exchangeId === "okx" && payload === "pong") {
    return true
  }

  if (exchangeId === "kucoin" && (payload?.type === "welcome" || payload?.type === "ack")) {
    return true
  }

  if (exchangeId === "bybit" && (payload?.op === "subscribe" || payload?.success === true)) {
    return true
  }

  return false
}

function parseExchangeDepthPayload(
  leg: ExchangeLegStreamSpec,
  payload: any | Uint8Array | string | null,
  state?: {
    getOrderBook: () => LocalOrderBookState | null
    setOrderBook: (next: LocalOrderBookState | null) => void
  }
): ExchangeDepthSnapshot | null {
  const exchangeId = leg.exchangeId.toLowerCase()

  if (!payload || typeof payload === "string") return null

  if (exchangeId === "mexc" && leg.marketType === "spot") {
    if (payload instanceof Uint8Array) {
      return parseMexcSpotProtobuf(payload)
    }
    if (payload?.code !== undefined && payload?.msg) return null
    if (payload?.channel === "push.personal.order") return null
    if (payload?.channel === "rs.error" || payload?.code === 1) return null
    if (payload?.method === "PING" || payload?.ping || payload?.op === "ping") return null
    return parseMexcDepthPayload(payload)
  }
  if (exchangeId === "mexc" && leg.marketType === "future") {
    if (payload?.success === false || payload?.error) return null
    if (payload?.channel || payload?.symbol || payload?.data) {
      return parseMexcFuturesDepthPayload(payload)
    }
    return null
  }
  if (exchangeId === "bitget") {
    if (payload === "pong" || payload?.event === "subscribe" || payload?.event === "unsubscribe") return null
    if (payload?.event === "error" || payload?.code === "30006" || payload?.code === "429") return null
    if (!payload?.arg || !payload?.data?.length) return null
    const first = payload.data[0]
    return buildDepthSnapshot(
      first?.bids,
      first?.asks,
      first?.ts ?? payload.ts ?? Date.now()
    )
  }

  if (exchangeId === "binance" && leg.marketType === "spot") {
    if (payload?.e !== "depthUpdate" && payload?.lastUpdateId == null) return null
    return buildDepthSnapshot(
      payload.bids ?? payload.b,
      payload.asks ?? payload.a,
      payload.E ?? payload.T ?? payload.lastUpdateId ?? payload.u ?? Date.now()
    )
  }
  if (exchangeId === "binance" && leg.marketType === "future") {
    if (payload?.e !== "depthUpdate" && payload?.lastUpdateId == null) return null
    return buildDepthSnapshot(
      payload.bids ?? payload.b,
      payload.asks ?? payload.a,
      payload.E ?? payload.T ?? payload.u ?? payload.lastUpdateId ?? Date.now()
    )
  }
  if (exchangeId === "gate" && leg.marketType === "spot") {
    if (payload?.event !== "update" || !payload?.result) return null
    const result = payload.result
    return buildDepthSnapshot(
      result.bids ?? result.b,
      result.asks ?? result.a,
      result.id ?? result.t ?? payload.time_ms ?? Date.now()
    )
  }
  if (exchangeId === "gate" && leg.marketType === "future") {
    if (!payload?.result) return null
    return buildGateFuturesSnapshot(payload.result, payload.time_ms ?? payload.time ?? Date.now())
  }
  if (exchangeId === "bybit" && leg.marketType === "spot") {
    if (!payload?.topic || !payload?.data) return null
    return buildBybitSpotSnapshot(payload, state)
  }
  if (exchangeId === "kucoin" && leg.marketType === "spot") {
    if (!payload?.d) return null
    return buildDepthSnapshot(
      payload.d.b,
      payload.d.a,
      payload.d.ts ?? payload.d.t ?? payload.d.time ?? payload.d.M ?? payload.P ?? Date.now()
    )
  }
  if (exchangeId === "okx" && leg.marketType === "spot") {
    if (!Array.isArray(payload?.data) || payload.data.length === 0) return null
    const entry = payload.data[0]
    return buildDepthSnapshot(
      entry?.bids,
      entry?.asks,
      entry?.ts ?? Date.now()
    )
  }
  if (exchangeId === "bingx" && leg.marketType === "spot") {
    return buildBingxSpotSnapshot(payload, state)
  }
  return null
}

function buildDepthSnapshot(
  bidsSource: unknown,
  asksSource: unknown,
  timestamp: unknown,
  gateFuturesMode = false,
  priceKey = "0",
  amountKey = "1"
): ExchangeDepthSnapshot | null {
  const bids = gateFuturesMode
    ? normalizeGateFuturesLevels(bidsSource, "bids")
    : normalizeLevels(bidsSource, priceKey, amountKey)
  const asks = gateFuturesMode
    ? normalizeGateFuturesLevels(asksSource, "asks")
    : normalizeLevels(asksSource, priceKey, amountKey)

  if (bids.length === 0 || asks.length === 0) return null

  return {
    bids,
    asks,
    timestamp: normalizeTimestamp(timestamp),
    bestBidPrice: bids[0].price,
    bestBidAmount: bids[0].amount,
    bestAskPrice: asks[0].price,
    bestAskAmount: asks[0].amount,
  }
}

function buildGateFuturesSnapshot(source: unknown, timestamp: unknown): ExchangeDepthSnapshot | null {
  if (!source || typeof source !== "object") return null

  const record = source as Record<string, unknown>
  const directBids = normalizeLevels(record.bids, "p", "s")
    .sort((left, right) => right.price - left.price)
    .slice(0, 10)
  const directAsks = normalizeLevels(record.asks, "p", "s")
    .sort((left, right) => left.price - right.price)
    .slice(0, 10)

  if (directBids.length > 0 && directAsks.length > 0) {
    return {
      bids: directBids,
      asks: directAsks,
      timestamp: normalizeTimestamp(record.t ?? timestamp),
      bestBidPrice: directBids[0].price,
      bestBidAmount: directBids[0].amount,
      bestAskPrice: directAsks[0].price,
      bestAskAmount: directAsks[0].amount,
    }
  }

  if (!Array.isArray(source)) return null

  const bids: ExchangeOrderLevel[] = []
  const asks: ExchangeOrderLevel[] = []

  for (const entry of source) {
    if (!entry || typeof entry !== "object") continue
    const level = entry as Record<string, unknown>
    const price = toNumber(level.p)
    const size = toNumber(level.s)
    if (price == null || size == null || size === 0) continue
    const normalized = { price, amount: Math.abs(size) }
    if (size > 0) {
      bids.push(normalized)
    } else {
      asks.push(normalized)
    }
  }

  bids.sort((left, right) => right.price - left.price)
  asks.sort((left, right) => left.price - right.price)

  if (bids.length === 0 || asks.length === 0) return null

  return {
    bids: bids.slice(0, 10),
    asks: asks.slice(0, 10),
    timestamp: normalizeTimestamp(timestamp),
    bestBidPrice: bids[0].price,
    bestBidAmount: bids[0].amount,
    bestAskPrice: asks[0].price,
    bestAskAmount: asks[0].amount,
  }
}

function normalizeGateFuturesLevels(source: unknown, side: "bids" | "asks"): ExchangeOrderLevel[] {
  if (!Array.isArray(source)) return []
  const items = source
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null
      const price = toNumber((entry as Record<string, unknown>).p)
      const rawSize = toNumber((entry as Record<string, unknown>).s)
      if (price == null || rawSize == null) return null
      const amount = Math.abs(rawSize)
      return amount > 0 ? { price, amount } : null
    })
    .filter((entry): entry is ExchangeOrderLevel => Boolean(entry))

  return side === "asks"
    ? items.sort((left, right) => left.price - right.price).slice(0, 10)
    : items.sort((left, right) => right.price - left.price).slice(0, 10)
}

function normalizeLevels(
  source: unknown,
  priceKey = "0",
  amountKey = "1"
): ExchangeOrderLevel[] {
  if (!Array.isArray(source)) return []
  return source
    .map((entry) => {
      if (Array.isArray(entry)) {
        const price = toNumber(entry[Number(priceKey)])
        const amount = toNumber(entry[Number(amountKey)])
        if (price == null || amount == null || amount <= 0) return null
        return { price, amount }
      }
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>
        const price =
          toNumber(record[priceKey]) ??
          toNumber(record.price) ??
          toNumber(record.p)
        const amount =
          toNumber(record[amountKey]) ??
          toNumber(record.quantity) ??
          toNumber(record.amount) ??
          toNumber(record.v) ??
          toNumber(record.q)
        if (price == null || amount == null || amount <= 0) return null
        return { price, amount }
      }
      return null
    })
    .filter((entry): entry is ExchangeOrderLevel => Boolean(entry))
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function normalizeTimestamp(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Date.now()
  }
  if (parsed > 1e17) {
    return Math.trunc(parsed / 1_000_000)
  }
  if (parsed > 1e14) {
    return Math.trunc(parsed / 1_000)
  }
  if (parsed < 1e12) {
    return Math.trunc(parsed * 1_000)
  }
  return Math.trunc(parsed)
}

function toBinanceSymbol(asset: string): string {
  return asset.replace("/", "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
}

function toMexcSymbol(asset: string): string {
  return asset.replace("/", "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
}

function toMexcFuturesSymbol(asset: string): string {
  return asset.replace("/", "_").replace(/[^A-Z0-9_]/gi, "").toUpperCase()
}

function toGateSymbol(asset: string): string {
  return asset.replace("/", "_").replace(/[^A-Z0-9_]/gi, "").toUpperCase()
}

function toGateSettle(asset: string): string {
  const [, quote = "USDT"] = asset.toUpperCase().split("/")
  return quote.toLowerCase()
}

function toBitgetSymbol(asset: string): string {
  return asset.replace("/", "").replace(/[^A-Z0-9]/gi, "").toUpperCase()
}

function toBybitSymbol(asset: string): string {
  return asset.replace("/", "").replace(/[^A-Z0-9]/gi, "").toUpperCase()
}

function toKucoinSymbol(asset: string): string {
  return asset.replace("/", "-").replace(/[^A-Z0-9-]/gi, "").toUpperCase()
}

function toOkxSymbol(asset: string): string {
  return asset.replace("/", "-").replace(/[^A-Z0-9-]/gi, "").toUpperCase()
}

function toBingxSymbol(asset: string): string {
  return asset.replace("/", "-").replace(/[^A-Z0-9-]/gi, "").toUpperCase()
}

function buildBybitSpotSnapshot(
  payload: any,
  state?: {
    getOrderBook: () => LocalOrderBookState | null
    setOrderBook: (next: LocalOrderBookState | null) => void
  }
): ExchangeDepthSnapshot | null {
  const messageType = payload?.type
  const data = payload?.data
  if (!data) return null

  if (!state) {
    return buildDepthSnapshot(data.b ?? data.bids, data.a ?? data.asks, payload.ts ?? Date.now())
  }

  const current =
    messageType === "snapshot" || !state.getOrderBook()
      ? { bids: new Map<string, number>(), asks: new Map<string, number>() }
      : state.getOrderBook()!

  if (messageType === "snapshot") {
    current.bids.clear()
    current.asks.clear()
  }

  applyPriceLevels(current.bids, data.b ?? data.bids)
  applyPriceLevels(current.asks, data.a ?? data.asks)
  state.setOrderBook(current)

  return snapshotFromLocalBook(current, payload.ts ?? Date.now())
}

function buildBingxSpotSnapshot(
  payload: any,
  state?: {
    getOrderBook: () => LocalOrderBookState | null
    setOrderBook: (next: LocalOrderBookState | null) => void
  }
): ExchangeDepthSnapshot | null {
  const embeddedData =
    typeof payload?.data === "string" ? safeJsonParse(payload.data) ?? payload.data : payload?.data
  const source = embeddedData?.data ?? embeddedData ?? payload
  if (!source) return null

  const bidsSource = source?.bids ?? source?.b
  const asksSource = source?.asks ?? source?.a
  const timestamp = source?.E ?? source?.T ?? source?.ts ?? source?.timestamp ?? payload?.ts ?? payload?.timestamp ?? Date.now()

  if (!state) {
    return buildDepthSnapshot(bidsSource, asksSource, timestamp)
  }

  const current = state.getOrderBook() ?? { bids: new Map<string, number>(), asks: new Map<string, number>() }
  applyPriceLevels(current.bids, bidsSource)
  applyPriceLevels(current.asks, asksSource)
  state.setOrderBook(current)
  return snapshotFromLocalBook(current, timestamp)
}

function applyPriceLevels(side: OrderBookSide, levelsSource: unknown) {
  if (!Array.isArray(levelsSource)) return
  for (const entry of levelsSource) {
    if (!Array.isArray(entry) || entry.length < 2) continue
    const price = toNumber(entry[0])
    const amount = toNumber(entry[1])
    if (price == null || amount == null) continue
    const priceKey = String(price)
    if (amount <= 0) {
      side.delete(priceKey)
      continue
    }
    side.set(priceKey, amount)
  }
}

function snapshotFromLocalBook(orderBook: LocalOrderBookState, timestamp: unknown): ExchangeDepthSnapshot | null {
  const bids = [...orderBook.bids.entries()]
    .map(([price, amount]) => ({ price: Number(price), amount }))
    .filter((level) => Number.isFinite(level.price) && level.amount > 0)
    .sort((left, right) => right.price - left.price)
    .slice(0, 10)

  const asks = [...orderBook.asks.entries()]
    .map(([price, amount]) => ({ price: Number(price), amount }))
    .filter((level) => Number.isFinite(level.price) && level.amount > 0)
    .sort((left, right) => left.price - right.price)
    .slice(0, 10)

  if (bids.length === 0 || asks.length === 0) return null

  return {
    bids,
    asks,
    timestamp: normalizeTimestamp(timestamp),
    bestBidPrice: bids[0].price,
    bestBidAmount: bids[0].amount,
    bestAskPrice: asks[0].price,
    bestAskAmount: asks[0].amount,
  }
}

async function decodeSocketPayload(rawPayload: string | ArrayBuffer | Blob): Promise<any | Uint8Array | string | null> {
  if (typeof rawPayload === "string") {
    return safeJsonParse(rawPayload) ?? rawPayload.trim()
  }

  const buffer = rawPayload instanceof Blob ? await rawPayload.arrayBuffer() : rawPayload
  const u8 = new Uint8Array(buffer)
  if (!looksLikeTextPayload(u8)) {
    const gzipBinary = await tryDecompressBinary(buffer, "gzip")
    const gzipDecoded = decodeMaybeJsonBinary(gzipBinary)
    if (gzipDecoded) return gzipDecoded
    const deflateBinary = await tryDecompressBinary(buffer, "deflate")
    const deflateDecoded = decodeMaybeJsonBinary(deflateBinary)
    if (deflateDecoded) return deflateDecoded
    const fflateDecoded = decodeCompressedBinaryWithFflate(u8)
    if (fflateDecoded) return fflateDecoded
    const directDecoded = decodeMaybeJsonBinary(u8, { allowPlainText: false })
    return directDecoded ?? u8
  }

  const directText = decodeUtf8(buffer)
  const directJson = safeJsonParse(directText)
  if (directJson) return directJson

  const gzipText = await tryDecompressText(buffer, "gzip")
  const gzipJson = safeJsonParse(gzipText)
  if (gzipJson) return gzipJson

  const deflateText = await tryDecompressText(buffer, "deflate")
  const deflateJson = safeJsonParse(deflateText)
  if (deflateJson) return deflateJson

  return directText ?? gzipText ?? deflateText
}

function decodeMaybeJsonBinary(
  payload: Uint8Array | null,
  options: { allowPlainText?: boolean } = {}
): any | string | null {
  if (!payload || payload.length === 0) return null
  const text = decodeUtf8(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength))
  if (!text) return null
  const json = safeJsonParse(text)
  if (json) return json
  return options.allowPlainText === false ? null : text
}

function decodeCompressedBinaryWithFflate(payload: Uint8Array): any | string | null {
  try {
    if (payload.length >= 2 && payload[0] === 0x1f && payload[1] === 0x8b) {
      return safeJsonParse(strFromU8(gunzipSync(payload))) ?? strFromU8(gunzipSync(payload))
    }
    const unzlibText = strFromU8(unzlibSync(payload))
    return safeJsonParse(unzlibText) ?? unzlibText
  } catch {
    return null
  }
}

function looksLikeTextPayload(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false
  const first = bytes[0]
  return first === 0x7b || first === 0x5b || first === 0x22
}

function safeJsonParse(source: string | null): any | null {
  if (!source) return null
  try {
    return JSON.parse(source)
  } catch {
    return null
  }
}

function decodeUtf8(buffer: ArrayBuffer): string | null {
  try {
    return new TextDecoder("utf-8").decode(new Uint8Array(buffer)).replace(/\u0000/g, "").trim()
  } catch {
    return null
  }
}

async function tryDecompressText(
  buffer: ArrayBuffer,
  format: "gzip" | "deflate"
): Promise<string | null> {
  if (typeof DecompressionStream === "undefined") {
    return null
  }

  try {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream(format))
    const response = new Response(stream)
    const text = await response.text()
    return text.replace(/\u0000/g, "").trim()
  } catch {
    return null
  }
}

async function tryDecompressBinary(
  buffer: ArrayBuffer,
  format: "gzip" | "deflate"
): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") {
    return null
  }

  try {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream(format))
    const decompressed = await new Response(stream).arrayBuffer()
    return new Uint8Array(decompressed)
  } catch {
    return null
  }
}

function parseMexcDepthPayload(payload: any): ExchangeDepthSnapshot | null {
  const source =
    payload?.d ??
    payload?.data ??
    payload?.publicLimitDepths ??
    payload?.depth ??
    payload?.book ??
    payload

  const bids =
    source?.bids ??
    source?.bidsList ??
    source?.bidList ??
    source?.b ??
    source?.bs

  const asks =
    source?.asks ??
    source?.asksList ??
    source?.askList ??
    source?.a ??
    source?.as

  return buildDepthSnapshot(
    bids,
    asks,
    source?.t ?? source?.ts ?? source?.timestamp ?? payload?.t ?? payload?.ts ?? payload?.sendtime ?? Date.now(),
    false,
    "price",
    "quantity"
  )
}

function parseMexcSpotProtobuf(payload: Uint8Array): ExchangeDepthSnapshot | null {
  try {
    const decoded = PushDataV3ApiWrapper.decode(payload)
    const depth =
      (decoded as any).publicLimitDepths ??
      (decoded as any).publiclimitdepths

    if (!depth) return null

    return buildDepthSnapshot(
      depth.bids ?? [],
      depth.asks ?? [],
      decoded.sendTime ?? decoded.createTime ?? Date.now(),
      false,
      "price",
      "quantity"
    )
  } catch {
    return null
  }
}

function parseMexcFuturesDepthPayload(payload: any): ExchangeDepthSnapshot | null {
  const source =
    payload?.data ??
    payload?.depth ??
    payload?.book ??
    payload

  const bids =
    source?.bids ??
    source?.b ??
    source?.buys

  const asks =
    source?.asks ??
    source?.a ??
    source?.sells

  return buildDepthSnapshot(
    bids,
    asks,
    source?.timestamp ?? source?.ts ?? payload?.ts ?? payload?.sendTime ?? Date.now()
  )
}
