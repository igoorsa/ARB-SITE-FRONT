import { NextRequest, NextResponse } from "next/server"

const DEFAULT_HTTP_BASE_URL = "http://127.0.0.1:8000"
const BACKEND_TIMEOUT_MS = 8_000

export const dynamic = "force-dynamic"

function getBackendBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_HTTP_BASE_URL).replace(/\/+$/, "")
}

export async function GET(request: NextRequest) {
  const targetUrl = `${getBackendBaseUrl()}/me`

  try {
    const response = await fetchBackend(targetUrl, request.headers.get("authorization"))
    const body = await response.text()

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        pragma: "no-cache",
        expires: "0",
      },
    })
  } catch {
    return NextResponse.json(
      { detail: "Falha ao conectar com o backend em /me." },
      {
        status: 502,
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          pragma: "no-cache",
          expires: "0",
        },
      },
    )
  }
}

async function fetchBackend(url: string, authorization: string | null): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS)
  try {
    return await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
      headers: authorization ? { authorization } : undefined,
    })
  } finally {
    clearTimeout(timeout)
  }
}
