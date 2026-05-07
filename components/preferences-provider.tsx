"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type AppLanguage = "pt" | "en"
export type AppTheme = "dark" | "light"

type TranslationKey = keyof typeof translations.pt

interface PreferencesContextValue {
  language: AppLanguage
  theme: AppTheme
  locale: string
  setLanguage: (language: AppLanguage) => void
  setTheme: (theme: AppTheme) => void
  toggleLanguage: () => void
  toggleTheme: () => void
  t: (key: TranslationKey) => string
}

const STORAGE_KEY = "monitor-arb:preferences"
const LEGACY_PANEL_SETTINGS_KEY = "arbitrage-monitor:panel-settings"

const translations = {
  pt: {
    languageName: "Portugues",
    themeDark: "Escuro",
    themeLight: "Claro",
    openMonitoring: "Comecar gratis",
    enterMonitor: "Testar plano gratis",
    viewUsageRules: "Ver regras de uso",
    operationalIntelligence: "Plano gratis disponivel para novos usuarios",
    landingTitle: "Teste oportunidades de arbitragem antes de investir.",
    landingDescription:
      "Comece pelo plano gratis, acompanhe spreads, liquidez, funding, taxas e redes em tempo real, e entenda se a operacao faz sentido para voce antes de colocar capital ou contratar um plano pago.",
    freePlanTitle: "Comece sem custo",
    freePlanDescription: "Use o plano gratis para conhecer o painel, testar filtros e analisar oportunidades reais sem compromisso.",
    freePlanPointOne: "Sem investimento inicial na plataforma",
    freePlanPointTwo: "Analise por par com dados de book, taxas e redes",
    freePlanPointThree: "Upgrade apenas quando precisar de mais recursos",
    developingTitle: "Por que testar primeiro",
    developingDescription:
      "Arbitragem exige velocidade, criterio e validacao. O plano gratis permite conhecer o fluxo, comparar mercados e entender custos antes de assumir qualquer compromisso maior.",
    rulesTitle: "Regras de uso",
    rulesDescription:
      "O painel foi criado para apoiar analise operacional. O usuario deve validar execucao, riscos, taxas e disponibilidade diretamente nas corretoras antes de qualquer decisao.",
    capabilityRealtimeTitle: "Monitoramento em tempo real",
    capabilityRealtimeDescription: "Leitura de books, spreads e volumes entre mercados spot/spot e spot/futuros.",
    capabilityPairTitle: "Analise por par",
    capabilityPairDescription: "Tela dedicada com book, taxas, redes e contexto operacional para cada oportunidade.",
    capabilityPipelineTitle: "Pipeline distribuido",
    capabilityPipelineDescription: "Workers, filas e snapshots em baixa latencia para manter o painel atualizado.",
    ruleData: "Os dados exibidos sao informativos e dependem da disponibilidade das corretoras.",
    ruleSpreads: "Spreads podem mudar rapidamente; confirme liquidez, taxas e rede antes de executar qualquer operacao.",
    ruleStale: "O monitor descarta oportunidades com dados obsoletos, mas instabilidades externas podem afetar a leitura.",
    ruleAdvice: "O uso da plataforma nao representa recomendacao financeira ou promessa de resultado.",
    validatingAccess: "Validando acesso",
    validatingDescription: "Aguarde enquanto sua sessao e verificada.",
    authDescription: "Entre com sua conta para acessar o painel.",
    signIn: "Entrar",
    signOut: "Sair",
    lastUpdate: "Ultima atualizacao",
    connected: "Conectado",
    disconnected: "Desconectado",
    live: "Live",
    workspace: "Workspace",
    monitor: "Monitor",
    settings: "Configuracoes",
    account: "Conta",
    accountArea: "Area do usuario",
    accountDescription: "Dados da sua conta e limites do plano atual.",
    accountLoadError: "Nao foi possivel carregar os dados da conta.",
    signedInAs: "Conectado como",
    currentPlan: "Plano atual",
    planLimits: "Limites do plano",
    accountSettings: "Configuracoes da conta",
    accountSettingsDescription: "Essas informacoes vem da autenticacao e sao usadas apenas para identificar seu acesso.",
    refreshAccount: "Atualizar dados",
    userIdentifier: "ID do usuario",
    email: "E-mail",
    username: "Usuario",
    unlimited: "Ilimitado",
    monitoredItems: "Itens no monitor",
    realtimeItems: "Itens em tempo real",
    websocketConnections: "Conexoes simultaneas",
    requestsPerMinute: "Requisicoes por minuto",
    updateInterval: "Intervalo de atualizacao",
    candleHistory: "Historico de candles",
    minutesShort: "min",
    terms: "Termos",
    demoMode: "Modo Demo",
    demoDescription: "Exibindo dados de demonstracao. Configure NEXT_PUBLIC_API_URL e NEXT_PUBLIC_WS_URL para conectar a sua API.",
    spotFutureDescription: "Oportunidades entre mercado futuro e mercado spot.",
    spotSpotDescription: "Oportunidades entre duas corretoras spot.",
    results: "resultados",
    filters: "Filtros",
    active: "Ativos",
    searchCoin: "Buscar moeda (ex: BTC, ETH)",
    spotBuy: "Spot compra",
    spotSell: "Spot venda",
    spotExchange: "Exchange Spot",
    futuresExchange: "Exchange Futuros",
    spotBuyExchange: "Exchange Spot compra",
    spotSellExchange: "Exchange Spot venda",
    futures: "Futuros",
    all: "Todas",
    selected: "selecionada(s)",
    minSpread: "Spread Min",
    minSpreadFull: "Spread Minimo (%)",
    apply: "Aplicar",
    clear: "Limpar",
    clearDraft: "Limpar rascunho",
    opportunities: "Oportunidades",
    monitoredAssets: "ativos monitorados",
    avgSpread: "Spread Medio",
    entrySpreadSubtitle: "spread de entrada",
    maxSpread: "Maior Spread",
    bestOpportunity: "melhor oportunidade",
    totalVolume: "Volume Total",
    availableLiquidity: "liquidez disponivel",
    noOpportunities: "Nenhuma oportunidade encontrada",
    noOpportunitiesDescription: "Aguardando dados ou ajuste os filtros para ver mais resultados",
    pair: "Par",
    spot: "Spot",
    funding: "Funding",
    profit: "Lucro",
    entrySpread: "Spread Entrada",
    exitSpread: "Spread Saida",
    buyBook: "Book Compra",
    sellBook: "Book Venda",
    spotBook: "Book Spot",
    futureBook: "Book Future",
    volume24h: "Volume 24h",
    action: "Acao",
    buy: "Compra",
    sell: "Venda",
    analyze: "Analisar",
    settingsDescription: "Preferencias locais do painel. Elas ficam salvas neste navegador e nao alteram dados das corretoras.",
    defaultView: "Visualizacao padrao",
    defaultViewDescription: "Escolha qual mercado abrir ao entrar no monitor.",
    panelLanguage: "Idioma do painel",
    panelLanguageDescription: "Alterna os textos do site entre portugues e ingles.",
    theme: "Tema",
    themeDescription: "Alterna todo o site entre visual escuro e uma base mais clara.",
    compactNumbers: "Numeros compactos",
    compactNumbersDescription: "Mantem valores grandes em formato K/M para leitura rapida.",
    confirmBeforeAnalysis: "Confirmar antes de analisar",
    confirmBeforeAnalysisDescription: "Reserva para exigir confirmacao antes de abrir uma tela dedicada.",
    restoreDefault: "Restaurar padrao",
    termsTitle: "Termos e isencao de responsabilidade",
    termsDescription: "Texto operacional de protecao para uso da plataforma. Para publicacao formal, revise com um advogado.",
    termInfoTitle: "Uso informativo",
    termInfoText:
      "As informacoes exibidas no Monitor Arb sao fornecidas exclusivamente para fins informativos, educacionais e de analise operacional. Nada na plataforma deve ser interpretado como recomendacao de investimento, consultoria financeira, juridica, fiscal ou promessa de resultado.",
    termRiskTitle: "Risco de mercado",
    termRiskText:
      "Operacoes com criptoativos envolvem risco elevado, volatilidade, slippage, falhas de execucao, indisponibilidade de corretoras, alteracoes de taxas, limites de saque/deposito e perdas financeiras. O usuario e o unico responsavel por validar e executar qualquer decisao.",
    termThirdPartyTitle: "Dados de terceiros",
    termThirdPartyText:
      "Books, volumes, funding, redes, taxas e demais informacoes dependem de APIs, WebSockets, infraestrutura e disponibilidade de terceiros. A plataforma pode apresentar atrasos, dados incompletos, divergencias ou interrupcoes sem aviso previo.",
    termNoGuaranteeTitle: "Sem garantia de oportunidade",
    termNoGuaranteeText:
      "Spreads identificados podem desaparecer antes da execucao e podem nao considerar todos os custos, limites, impostos, riscos operacionais ou restricoes da conta do usuario. O Monitor Arb nao garante captura de lucro, liquidez ou viabilidade operacional.",
    termResponsibilityTitle: "Responsabilidade do usuario",
    termResponsibilityText:
      "Ao utilizar o painel, o usuario declara compreender os riscos e concorda em verificar diretamente nas corretoras todas as informacoes relevantes antes de agir. O uso inadequado, automatizado ou em desacordo com regras de terceiros e de responsabilidade exclusiva do usuario.",
    termLiabilityTitle: "Limitacao de responsabilidade",
    termLiabilityText:
      "Na maxima extensao permitida pela lei aplicavel, os desenvolvedores e operadores da plataforma nao se responsabilizam por perdas, danos, lucros cessantes, erros de dados, indisponibilidade, falhas de rede, bloqueios de conta ou decisoes tomadas com base nas informacoes exibidas.",
    updating: "Atualizando",
    updatingCandles: "Atualizando candles...",
    noData: "Sem dados disponiveis",
    waitingChartData: "Aguardando dados do grafico",
    time: "Horario",
    variation: "Variacao",
  },
  en: {
    languageName: "English",
    themeDark: "Dark",
    themeLight: "Light",
    openMonitoring: "Start free",
    enterMonitor: "Try free plan",
    viewUsageRules: "View usage rules",
    operationalIntelligence: "Free plan available for new users",
    landingTitle: "Test arbitrage opportunities before investing.",
    landingDescription:
      "Start with the free plan, track spreads, liquidity, funding, fees, and network data in real time, and decide whether the workflow fits you before putting capital to work or choosing a paid plan.",
    freePlanTitle: "Start at no cost",
    freePlanDescription: "Use the free plan to explore the dashboard, test filters, and analyze real opportunities without commitment.",
    freePlanPointOne: "No upfront platform investment",
    freePlanPointTwo: "Pair analysis with book, fee, and network data",
    freePlanPointThree: "Upgrade only when you need more resources",
    developingTitle: "Why test first",
    developingDescription:
      "Arbitrage requires speed, discipline, and validation. The free plan lets you understand the workflow, compare markets, and review costs before making a larger commitment.",
    rulesTitle: "Usage rules",
    rulesDescription:
      "The dashboard supports operational analysis. Users must validate execution, risk, fees, and availability directly on the exchanges before making decisions.",
    capabilityRealtimeTitle: "Real-time monitoring",
    capabilityRealtimeDescription: "Order books, spreads, and volume tracking across spot/spot and spot/futures markets.",
    capabilityPairTitle: "Pair analysis",
    capabilityPairDescription: "Dedicated view with book data, fees, networks, and operational context for each opportunity.",
    capabilityPipelineTitle: "Distributed pipeline",
    capabilityPipelineDescription: "Workers, queues, and low-latency snapshots designed to keep the dashboard updated.",
    ruleData: "Displayed data is informational and depends on exchange availability.",
    ruleSpreads: "Spreads can change quickly; confirm liquidity, fees, and networks before executing any trade.",
    ruleStale: "The monitor filters stale opportunities, but external instability may affect readings.",
    ruleAdvice: "Platform usage does not represent financial advice or a promise of results.",
    validatingAccess: "Validating access",
    validatingDescription: "Please wait while your session is verified.",
    authDescription: "Sign in to access the dashboard.",
    signIn: "Sign in",
    signOut: "Sign out",
    lastUpdate: "Last update",
    connected: "Connected",
    disconnected: "Disconnected",
    live: "Live",
    workspace: "Workspace",
    monitor: "Monitor",
    settings: "Settings",
    account: "Account",
    accountArea: "User area",
    accountDescription: "Your account data and current plan limits.",
    accountLoadError: "Could not load account data.",
    signedInAs: "Signed in as",
    currentPlan: "Current plan",
    planLimits: "Plan limits",
    accountSettings: "Account settings",
    accountSettingsDescription: "This information comes from authentication and is only used to identify your access.",
    refreshAccount: "Refresh data",
    userIdentifier: "User ID",
    email: "Email",
    username: "Username",
    unlimited: "Unlimited",
    monitoredItems: "Monitor items",
    realtimeItems: "Real-time items",
    websocketConnections: "Simultaneous connections",
    requestsPerMinute: "Requests per minute",
    updateInterval: "Update interval",
    candleHistory: "Candle history",
    minutesShort: "min",
    terms: "Terms",
    demoMode: "Demo Mode",
    demoDescription: "Showing demonstration data. Configure NEXT_PUBLIC_API_URL and NEXT_PUBLIC_WS_URL to connect your API.",
    spotFutureDescription: "Opportunities between futures and spot markets.",
    spotSpotDescription: "Opportunities between two spot exchanges.",
    results: "results",
    filters: "Filters",
    active: "Active",
    searchCoin: "Search coin (ex: BTC, ETH)",
    spotBuy: "Spot buy",
    spotSell: "Spot sell",
    spotExchange: "Spot exchange",
    futuresExchange: "Futures exchange",
    spotBuyExchange: "Spot buy exchange",
    spotSellExchange: "Spot sell exchange",
    futures: "Futures",
    all: "All",
    selected: "selected",
    minSpread: "Min Spread",
    minSpreadFull: "Minimum Spread (%)",
    apply: "Apply",
    clear: "Clear",
    clearDraft: "Clear draft",
    opportunities: "Opportunities",
    monitoredAssets: "monitored assets",
    avgSpread: "Avg Spread",
    entrySpreadSubtitle: "entry spread",
    maxSpread: "Max Spread",
    bestOpportunity: "best opportunity",
    totalVolume: "Total Volume",
    availableLiquidity: "available liquidity",
    noOpportunities: "No opportunities found",
    noOpportunitiesDescription: "Waiting for data or adjust filters to see more results",
    pair: "Pair",
    spot: "Spot",
    funding: "Funding",
    profit: "Profit",
    entrySpread: "Entry Spread",
    exitSpread: "Exit Spread",
    buyBook: "Buy Book",
    sellBook: "Sell Book",
    spotBook: "Spot Book",
    futureBook: "Future Book",
    volume24h: "24h Volume",
    action: "Action",
    buy: "Buy",
    sell: "Sell",
    analyze: "Analyze",
    settingsDescription: "Local dashboard preferences. They are saved in this browser and do not change exchange data.",
    defaultView: "Default view",
    defaultViewDescription: "Choose which market opens when entering the monitor.",
    panelLanguage: "Dashboard language",
    panelLanguageDescription: "Switch site text between Portuguese and English.",
    theme: "Theme",
    themeDescription: "Switch the whole site between dark mode and a lighter base.",
    compactNumbers: "Compact numbers",
    compactNumbersDescription: "Keep large values in K/M format for quick reading.",
    confirmBeforeAnalysis: "Confirm before analysis",
    confirmBeforeAnalysisDescription: "Reserved to require confirmation before opening a dedicated view.",
    restoreDefault: "Restore default",
    termsTitle: "Terms and disclaimer",
    termsDescription: "Operational protection text for platform usage. For formal publication, review with a lawyer.",
    termInfoTitle: "Informational use",
    termInfoText:
      "Information displayed in Monitor Arb is provided exclusively for informational, educational, and operational analysis purposes. Nothing in the platform should be interpreted as investment advice, financial, legal, tax consulting, or a promise of results.",
    termRiskTitle: "Market risk",
    termRiskText:
      "Crypto operations involve high risk, volatility, slippage, execution failures, exchange outages, fee changes, deposit/withdrawal limits, and financial losses. The user is solely responsible for validating and executing any decision.",
    termThirdPartyTitle: "Third-party data",
    termThirdPartyText:
      "Books, volumes, funding, networks, fees, and other information depend on third-party APIs, WebSockets, infrastructure, and availability. The platform may show delays, incomplete data, divergences, or interruptions without prior notice.",
    termNoGuaranteeTitle: "No opportunity guarantee",
    termNoGuaranteeText:
      "Identified spreads may disappear before execution and may not include every cost, limit, tax, operational risk, or account restriction. Monitor Arb does not guarantee profit capture, liquidity, or operational feasibility.",
    termResponsibilityTitle: "User responsibility",
    termResponsibilityText:
      "By using the dashboard, the user declares they understand the risks and agree to verify all relevant information directly on exchanges before acting. Improper, automated, or third-party-rule-violating usage is the user's exclusive responsibility.",
    termLiabilityTitle: "Limitation of liability",
    termLiabilityText:
      "To the maximum extent permitted by applicable law, platform developers and operators are not responsible for losses, damages, lost profits, data errors, outages, network failures, account blocks, or decisions made based on displayed information.",
    updating: "Updating",
    updatingCandles: "Updating candles...",
    noData: "No data available",
    waitingChartData: "Waiting for chart data",
    time: "Time",
    variation: "Change",
  },
} as const

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

function readInitialPreferences(): { language: AppLanguage; theme: AppTheme } {
  if (typeof window === "undefined") {
    return { language: "pt", theme: "dark" }
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<{ language: AppLanguage; theme: AppTheme }>
      return {
        language: parsed.language === "en" ? "en" : "pt",
        theme: parsed.theme === "light" ? "light" : "dark",
      }
    }

    const legacy = window.sessionStorage.getItem(LEGACY_PANEL_SETTINGS_KEY)
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy) as Partial<{ language: AppLanguage; theme: AppTheme }>
      return {
        language: parsedLegacy.language === "en" ? "en" : "pt",
        theme: parsedLegacy.theme === "light" ? "light" : "dark",
      }
    }
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }

  return { language: "pt", theme: "dark" }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState(() => readInitialPreferences())

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle("light", preferences.theme === "light")
    root.classList.toggle("dark", preferences.theme === "dark")
    root.lang = preferences.language === "pt" ? "pt-BR" : "en"
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  }, [preferences])

  const setLanguage = useCallback((language: AppLanguage) => {
    setPreferences((current) => ({ ...current, language }))
  }, [])

  const setTheme = useCallback((theme: AppTheme) => {
    setPreferences((current) => ({ ...current, theme }))
  }, [])

  const toggleLanguage = useCallback(() => {
    setPreferences((current) => ({ ...current, language: current.language === "pt" ? "en" : "pt" }))
  }, [])

  const toggleTheme = useCallback(() => {
    setPreferences((current) => ({ ...current, theme: current.theme === "dark" ? "light" : "dark" }))
  }, [])

  const contextValue = useMemo<PreferencesContextValue>(() => {
    const language = preferences.language
    return {
      language,
      theme: preferences.theme,
      locale: language === "pt" ? "pt-BR" : "en-US",
      setLanguage,
      setTheme,
      toggleLanguage,
      toggleTheme,
      t: (key) => translations[language][key] ?? key,
    }
  }, [preferences, setLanguage, setTheme, toggleLanguage, toggleTheme])

  return <PreferencesContext.Provider value={contextValue}>{children}</PreferencesContext.Provider>
}

export function usePreferences() {
  const context = useContext(PreferencesContext)
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider")
  }
  return context
}
