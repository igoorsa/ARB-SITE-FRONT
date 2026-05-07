import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { PreferencesProvider } from '@/components/preferences-provider'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });
const logoIcon = '/logo.png?v=20260506'

export const metadata: Metadata = {
  title: 'Monitor Arb - Inteligencia de Arbitragem',
  description: 'Monitor de arbitragem entre mercados spot e futuros de criptomoedas em tempo real',
  icons: {
    icon: logoIcon,
    shortcut: logoIcon,
    apple: logoIcon,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className="dark bg-background" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background">
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  )
}
