"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import { Activity, Wifi, WifiOff } from "lucide-react"
import { AuthLogoutButton } from "@/components/auth-provider"
import { usePreferences } from "@/components/preferences-provider"
import { Badge } from "@/components/ui/badge"

interface HeaderProps {
  isConnected: boolean
  lastUpdate: Date | null
  leading?: ReactNode
}

const LOGO_SRC = "/logo.png?v=20260506"

export function Header({ isConnected, lastUpdate, leading }: HeaderProps) {
  const { t, locale } = usePreferences()

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {leading}
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
              <Image src={LOGO_SRC} alt="Monitor Arb" width={36} height={36} className="h-9 w-9 rounded-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Monitor Arb</h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {lastUpdate && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                {t("lastUpdate")}:{" "}
                {lastUpdate.toLocaleTimeString(locale, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            )}
            <Badge variant={isConnected ? "default" : "destructive"} className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3" />
                  <span className="hidden sm:inline">{t("connected")}</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" />
                  <span className="hidden sm:inline">{t("disconnected")}</span>
                </>
              )}
            </Badge>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 animate-pulse text-primary" />
              <span className="text-sm font-medium text-foreground">{t("live")}</span>
            </div>
            <AuthLogoutButton />
          </div>
        </div>
      </div>
    </header>
  )
}
