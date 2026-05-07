export interface SpreadItem {
  pair_key: string
  pair_type?: "spot_future" | "spot_spot" | string
  symbol: string
  spot_exchange: string
  futures_exchange: string
  spot_symbol?: string
  future_symbol?: string
  entry_spread_pct: number
  exit_spread_pct: number
  entry_volume_usdt: number
  exit_volume_usdt?: number
  spot_volume_24h_usdt?: number
  future_volume_24h_usdt?: number
  best_spot_bid?: number
  best_spot_ask?: number
  best_future_bid?: number
  best_future_ask?: number
  funding_rate?: number
  updated_at: string
}

export interface SnapshotResponse {
  type: "snapshot"
  generated_at: string
  filters: {
    pair_type: string | null
    spot_exchange: string | null
    futures_exchange: string | null
    coin: string | null
    pair_key: string | null
    min_entry_spread_pct: number | null
    min_exit_spread_pct: number | null
    min_entry_volume_usdt: number | null
    interval_seconds: number
    limit: number
  }
  count: number
  items: SpreadItem[]
}

export interface CandleData {
  minute_start: string
  minute_end: string
  entry_open: number
  entry_high: number
  entry_low: number
  entry_close: number
  exit_open: number
  exit_high: number
  exit_low: number
  exit_close: number
  tick_count: number
  entry_volume_usdt?: number
  exit_volume_usdt?: number
}

export interface HealthStatus {
  status: string
  influx: string
  redis: string
}

export interface AccountPlan {
  key: string
  name: string
  description: string
  max_ws_items: number | null
  max_latest_items: number | null
  max_ws_connections: number
  http_requests_per_minute: number
  ws_interval_seconds: number
  candle_max_minutes: number | null
  max_entry_spread_pct_by_pair_type: Record<string, number | null>
}

export interface AccountProfile {
  sub: string
  email: string | null
  username: string | null
  plan: AccountPlan
}

export interface AssetNetworkRecord {
  exchange_id: string
  asset: string
  network_key: string
  network_name: string
  deposit_enabled?: boolean | null
  withdraw_enabled?: boolean | null
  deposit_fee?: number | null
  withdraw_fee?: number | null
  deposit_min?: number | null
  withdraw_min?: number | null
  contract_address?: string | null
}

export interface ExchangeNetworksSnapshot {
  exchange_id: string
  success: boolean
  error?: string | null
  networks: AssetNetworkRecord[]
}

export interface AssetNetworksResponse {
  pair_key?: string | null
  symbol: string
  asset: string
  updated_at?: string | null
  exchanges: ExchangeNetworksSnapshot[]
}

export interface FilterState {
  spot_exchange: string[]
  futures_exchange: string[]
  coin: string
  min_entry_spread_pct: number
  refresh_interval_seconds: number
}
