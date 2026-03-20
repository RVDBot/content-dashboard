import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { requireAuth } from '@/lib/auth-guard'
import { refreshOpportunities, getArticleBenchmarks, getRevenuePerVisitor } from '@/lib/opportunities-refresh'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const authError = requireAuth(req)
  if (authError) return authError

  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const regenerate = req.nextUrl.searchParams.get('regenerate') === '1'
  const db = getDb()

  if (regenerate) {
    // Clear existing opportunities so AI generates fresh suggestions
    db.prepare('DELETE FROM opportunities').run()
    log('info', 'Opportunities gewist — nieuwe AI suggesties worden gegenereerd')
  }

  if (refresh || regenerate) {
    try {
      const result = await refreshOpportunities()
      log('info', `Opportunities ${regenerate ? 'opnieuw gegenereerd' : 'ververst'}: ${result.count}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log('error', `Opportunities refresh fout: ${msg}`)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  const opportunities = db.prepare(`
    SELECT * FROM opportunities ORDER BY priority_score DESC
  `).all()

  const benchmarks = getArticleBenchmarks()
  const revenuePerVisitor = getRevenuePerVisitor()

  return NextResponse.json({
    opportunities,
    cached: !refresh,
    benchmarks: {
      avgRevenuePerArticle: benchmarks.avgRevenuePerArticle,
      articleCount: benchmarks.articleCount,
      revenuePerVisitor,
    },
  })
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
