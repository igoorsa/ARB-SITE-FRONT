"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, BarChart3, CheckCircle2, Clock3, Languages, Moon, ShieldCheck, Signal, Sun, Workflow } from "lucide-react"
import { AuthCallbackHandler, signInRedirect } from "@/components/auth-provider"
import { usePreferences } from "@/components/preferences-provider"
import { Button } from "@/components/ui/button"

const LOGO_SRC = "/logo.png?v=20260506"

export default function LandingPage() {
  const { language, theme, toggleLanguage, toggleTheme, t } = usePreferences()
  const isLight = theme === "light"
  const capabilities = [
    { title: t("capabilityRealtimeTitle"), description: t("capabilityRealtimeDescription"), icon: Signal },
    { title: t("capabilityPairTitle"), description: t("capabilityPairDescription"), icon: BarChart3 },
    { title: t("capabilityPipelineTitle"), description: t("capabilityPipelineDescription"), icon: Workflow },
  ]
  const freePlanPoints = [t("freePlanPointOne"), t("freePlanPointTwo"), t("freePlanPointThree")]
  const rules = [t("ruleData"), t("ruleSpreads"), t("ruleStale"), t("ruleAdvice")]

  return (
    <main className="min-h-screen bg-background text-foreground">
      <AuthCallbackHandler />
      <header className="border-b border-border bg-card/70 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
              <Image src={LOGO_SRC} alt="Monitor Arb" width={36} height={36} className="h-9 w-9 rounded-full object-contain" priority />
            </span>
            <span className="text-lg font-semibold">Monitor Arb</span>
          </Link>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={toggleLanguage}>
              <Languages className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">{language === "pt" ? "EN" : "PT"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={toggleTheme}>
              {isLight ? <Moon className="h-4 w-4 sm:mr-2" /> : <Sun className="h-4 w-4 sm:mr-2" />}
              <span className="hidden sm:inline">{isLight ? t("themeDark") : t("themeLight")}</span>
            </Button>
            <Button size="sm" onClick={() => signInRedirect("/monitor")}>
                <span className="hidden sm:inline">{t("openMonitoring")}</span>
                <ArrowRight className="h-4 w-4 sm:ml-2" />
            </Button>
          </div>
        </div>
      </header>

      <section className="border-b border-border">
        <div className="container mx-auto grid min-h-[calc(100vh-73px)] items-center gap-10 px-4 py-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm text-muted-foreground">
              <Clock3 className="h-4 w-4 text-primary" />
              {t("operationalIntelligence")}
            </div>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">{t("landingTitle")}</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{t("landingDescription")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="h-12 px-5" onClick={() => signInRedirect("/monitor")}>
                  {t("enterMonitor")}
                  <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 px-5">
                <Link href="#regras">{t("viewUsageRules")}</Link>
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="mb-5">
              <div className="mb-2 text-sm font-medium uppercase tracking-[0.16em] text-primary">
                Free
              </div>
              <h2 className="text-2xl font-semibold text-foreground">{t("freePlanTitle")}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("freePlanDescription")}</p>
            </div>

            <div className="space-y-3">
              {freePlanPoints.map((point) => (
                <div key={point} className="flex items-start gap-3 rounded-lg bg-secondary/45 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm leading-5 text-foreground">{point}</span>
                </div>
              ))}
            </div>

            <Button className="mt-6 h-11 w-full" onClick={() => signInRedirect("/monitor")}>
              {t("enterMonitor")}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border py-12">
        <div className="container mx-auto px-4">
          <div className="mb-8 max-w-2xl">
            <h2 className="text-2xl font-semibold">{t("developingTitle")}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("developingDescription")}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {capabilities.map((item) => (
              <article key={item.title} className="rounded-lg border border-border bg-card p-5">
                <item.icon className="mb-4 h-5 w-5 text-primary" />
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="regras" className="py-12">
        <div className="container mx-auto grid gap-8 px-4 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold">{t("rulesTitle")}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("rulesDescription")}</p>
          </div>

          <div className="grid gap-3">
            {rules.map((rule, index) => (
              <div key={rule} className="flex gap-4 rounded-lg border border-border bg-card p-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold">
                  {index + 1}
                </span>
                <p className="text-sm leading-6 text-muted-foreground">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
