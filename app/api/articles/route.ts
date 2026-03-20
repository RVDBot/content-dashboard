import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { getCachedData, refreshData } from '@/lib/refresh'

export async function GET(req: NextRequest) {
  const denied = requireAuth(req); if (denied) return denied
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'

  if (!refresh) {
    const cached = await getCachedData()
    if (cached) return NextResponse.json(cached)
  }

  const result = await refreshData()
  return NextResponse.json(result)
}
