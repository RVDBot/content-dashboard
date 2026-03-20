import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = requireAuth(req)
  if (authError) return authError

  const { id } = await params
  const db = getDb()
  const opp = db.prepare('SELECT * FROM opportunities WHERE id = ?').get(parseInt(id))

  if (!opp) {
    return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  }

  return NextResponse.json(opp)
}
