import { Suspense } from "react"
import { PairMonitorPage } from "@/components/pair-monitor-page"

export default function PairPage() {
  return (
    <Suspense fallback={null}>
      <PairMonitorPage />
    </Suspense>
  )
}
