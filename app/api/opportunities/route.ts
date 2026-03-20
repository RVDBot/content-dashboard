import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { refreshOpportunities } from '@/lib/opportunities-refresh'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const db = getDb()

  if (refresh) {
    try {
      const result = await refreshOpportunities()
      log('info', `Opportunities handmatig ververst: ${result.count}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log('error', `Opportunities refresh fout: ${msg}`)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const opportunities = db.prepare(`
    SELECT * FROM opportunities ORDER BY priority_score DESC
  `).all()

  return NextResponse.json({ opportunities, cached: !refresh })
}

export async function PATCH(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const body = await req.json()
  const { id, status } = body

  if (!id || !status) {
    return NextResponse.json({ error: 'id en status zijn verplicht' }, { status: 400 })
  }

  const validStatuses = ['new', 'planned', 'written', 'dismissed']
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `Ongeldige status. Kies uit: ${validStatuses.join(', ')}` }, { status: 400 })
  }

  const db = getDb()
  db.prepare('UPDATE opportunities SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, id)

  return NextResponse.json({ ok: true })
}
