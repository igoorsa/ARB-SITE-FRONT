"use client"

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

  return {
    legABook,
    legBBook,
    isConnected: activeLegCount > 0 && connectedCount === activeLegCount,
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
      const snapshot = await parseExchangeDepthMessage(leg, event.data)
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
    return new WebSocket("wss://wbs-api.mexc.com/ws")
  }
  if (exchangeId === "mexc" && leg.marketType === "future") {
    return new WebSocket("wss://contract.mexc.com/edge")
  }
  if (exchangeId === "bitget" && (leg.marketType === "spot" || leg.marketType === "future")) {
    return new WebSocket("wss://ws.bitget.com/v2/ws/public")
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

  return null
}

async function parseExchangeDepthMessage(
  leg: ExchangeLegStreamSpec,
  rawPayload: string | ArrayBuffer | Blob
): Promise<ExchangeDepthSnapshot | null> {
  const exchangeId = leg.exchangeId.toLowerCase()

  const payload = await decodeSocketPayload(rawPayload)
  if (!payload) return null

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
  return Number.isFinite(parsed) ? parsed : Date.now()
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

async function decodeSocketPayload(rawPayload: string | ArrayBuffer | Blob): Promise<any | Uint8Array | null> {
  if (typeof rawPayload === "string") {
    return safeJsonParse(rawPayload)
  }

  const buffer = rawPayload instanceof Blob ? await rawPayload.arrayBuffer() : rawPayload
  const u8 = new Uint8Array(buffer)
  if (!looksLikeTextPayload(u8)) {
    const gzipBinary = await tryDecompressBinary(buffer, "gzip")
    if (gzipBinary) return gzipBinary
    const deflateBinary = await tryDecompressBinary(buffer, "deflate")
    return deflateBinary ?? u8
  }

  const directText = decodeUtf8(buffer)
  const directJson = safeJsonParse(directText)
  if (directJson) return directJson

  const gzipText = await tryDecompressText(buffer, "gzip")
  const gzipJson = safeJsonParse(gzipText)
  if (gzipJson) return gzipJson

  const deflateText = await tryDecompressText(buffer, "deflate")
  return safeJsonParse(deflateText)
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
