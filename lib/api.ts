import type {
  AssetNetworksResponse,
  CandleData,
  HealthStatus,
  SnapshotResponse,
  SpreadItem,
} from "./types"

const DEFAULT_HTTP_BASE_URL = "http://127.0.0.1:8000"
const DEFAULT_WS_BASE_URL = "ws://127.0.0.1:8000"

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback
  return candidate.replace(/\/+$/, "")
}

function resolveWebSocketBaseUrl(): string {
  const configuredWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim()
  if (configuredWsUrl) {
    if (
      typeof window !== "undefined" &&
      ["127.0.0.1", "localhost"].includes(window.location.hostname) === false
    ) {
      try {
        const url = new URL(configuredWsUrl)
        if (["127.0.0.1", "localhost"].includes(url.hostname)) {
          url.hostname = window.location.hostname
          return normalizeBaseUrl(url.toString(), DEFAULT_WS_BASE_URL)
        }
      } catch {
        return normalizeBaseUrl(configuredWsUrl, DEFAULT_WS_BASE_URL)
      }
    }
    return normalizeBaseUrl(configuredWsUrl, DEFAULT_WS_BASE_URL)
  }

  const apiUrl = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL, DEFAULT_HTTP_BASE_URL)
  if (apiUrl.startsWith("https://")) {
    return apiUrl.replace(/^https:\/\//, "wss://")
  }
  if (apiUrl.startsWith("http://")) {
    return apiUrl.replace(/^http:\/\//, "ws://")
  }

  return DEFAULT_WS_BASE_URL
}

const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL, DEFAULT_HTTP_BASE_URL)
const WS_BASE_URL = resolveWebSocketBaseUrl()

export const apiConfig = {
  baseUrl: API_BASE_URL,
  wsUrl: WS_BASE_URL,
}

interface LatestParams {
  pair_type?: string
  spot_exchange?: string | string[]
  futures_exchange?: string | string[]
  coin?: string
  pair_key?: string
  min_entry_spread_pct?: number
  min_exit_spread_pct?: number
  min_entry_volume_usdt?: number
  limit?: number
  compact?: boolean
  delta?: boolean
  lite?: boolean
  msgpack?: boolean
}

interface CandleParams {
  pair_type?: string
  pair_key?: string
  spot_exchange?: string | string[]
  futures_exchange?: string | string[]
  coin?: string
  minutes?: number
  start?: string
  end?: string
  limit?: number
}

interface NetworkParams {
  pair_key?: string
  spot_exchange?: string
  futures_exchange?: string
  spot_symbol?: string
  future_symbol?: string
  coin?: string
}

function buildQueryString(params: Record<string, string | number | string[] | undefined>): string {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value.length > 0) {
        searchParams.append(key, value.join(","))
      }
      continue
    }
    if (value !== undefined && value !== "") {
      searchParams.append(key, String(value))
    }
  }
  return searchParams.toString()
}

export async function fetchHealth(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE_URL}/health`)
  if (!response.ok) {
    throw new Error("Falha ao verificar status da API")
  }
  return response.json()
}

export async function fetchLatest(params: LatestParams = {}): Promise<SpreadItem[]> {
  const queryString = buildQueryString(params)
  const url = `${API_BASE_URL}/latest${queryString ? `?${queryString}` : ""}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error("Falha ao buscar dados mais recentes")
  }
  const data = (await response.json()) as
    | SpreadItem[]
    | SnapshotResponse
    | { items?: SpreadItem[] | unknown[][]; columns?: string[] }
  if (Array.isArray(data)) {
    return data
  }
  if (Array.isArray(data.items) && Array.isArray(data.columns) && Array.isArray(data.items[0])) {
    return (data.items as unknown[][])
      .map((row) => liteRowToSpreadItem(row, data.columns!))
      .filter((item): item is SpreadItem => Boolean(item))
  }
  return (data.items as SpreadItem[]) ?? []
}

export async function fetchCandles(params: CandleParams): Promise<CandleData[]> {
  const queryString = buildQueryString(params)
  const url = `${API_BASE_URL}/candles${queryString ? `?${queryString}` : ""}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error("Falha ao buscar dados de candles")
  }
  const data = (await response.json()) as CandleData[] | { items?: CandleData[] }
  return Array.isArray(data) ? data : (data.items ?? [])
}

export async function fetchNetworks(params: NetworkParams): Promise<AssetNetworksResponse> {
  const queryString = buildQueryString(params)
  const url = `${API_BASE_URL}/networks${queryString ? `?${queryString}` : ""}`
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error("Falha ao buscar dados de redes")
  }
  return response.json()
}

export function createWebSocketUrl(params: LatestParams & { interval_seconds?: number }): string {
  const queryString = buildQueryString(params)
  return `${WS_BASE_URL}/ws/spreads${queryString ? `?${queryString}` : ""}`
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
