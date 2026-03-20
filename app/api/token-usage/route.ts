import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { getTokenUsage } from '@/lib/ai-suggestions'

export async function GET(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  return NextResponse.json(getTokenUsage())
}
