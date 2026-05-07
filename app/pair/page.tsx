import { Suspense } from "react"
import { AuthProvider } from "@/components/auth-provider"
import { PairMonitorPage } from "@/components/pair-monitor-page"

export default function PairPage() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <PairMonitorPage />
      </Suspense>
    </AuthProvider>
  )
}
