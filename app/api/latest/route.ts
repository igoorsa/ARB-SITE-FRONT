import { NextRequest, NextResponse } from "next/server"

const DEFAULT_HTTP_BASE_URL = "http://127.0.0.1:8000"

function getBackendBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL?.trim() || DEFAULT_HTTP_BASE_URL).replace(/\/+$/, "")
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.search
  const targetUrl = `${getBackendBaseUrl()}/latest${search}`

  try {
    const response = await fetch(targetUrl, { cache: "no-store" })
    const body = await response.text()

    return new NextResponse(body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
      },
    })
  } catch {
    return NextResponse.json(
      { detail: "Falha ao conectar com o backend em /latest." },
      { status: 502 },
    )
  }
}
