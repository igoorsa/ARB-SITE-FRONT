"use client"

import type { ReactNode } from "react"
import { Activity, TrendingUp, Wifi, WifiOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface HeaderProps {
  isConnected: boolean
  lastUpdate: Date | null
  leading?: ReactNode
}

export function Header({ isConnected, lastUpdate, leading }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {leading}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <TrendingUp className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Arbitrage Monitor</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {lastUpdate && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                Última atualização:{" "}
                {lastUpdate.toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            <Badge
              variant={isConnected ? "default" : "destructive"}
              className="flex items-center gap-2"
            >
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span className="hidden sm:inline">Conectado</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">Desconectado</span>
                </>
              )}
            </Badge>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 animate-pulse text-primary" />
              <span className="text-sm font-medium text-foreground">Live</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
