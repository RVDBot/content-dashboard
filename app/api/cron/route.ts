import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { log } from '@/lib/logger'
import { refreshData } from '@/lib/refresh'
import { refreshOpportunities } from '@/lib/opportunities-refresh'

function getSetting(key: string): string {
  const db = getDb()
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
}

function setSetting(key: string, value: string) {
  const db = getDb()
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?')
    .run(key, value, value)
}

function shouldRefresh(): boolean {
  const frequency = getSetting('refresh_frequency') || 'weekly'
  const lastRefresh = getSetting('last_auto_refresh')

  if (!lastRefresh) return true

  const last = new Date(lastRefresh).getTime()
  const now = Date.now()
  const hoursSince = (now - last) / (1000 * 60 * 60)

  switch (frequency) {
    case 'daily': return hoursSince >= 22
    case 'weekly': return hoursSince >= 166
    case 'monthly': return hoursSince >= 718
    default: return hoursSince >= 166
  }
}

/**
 * Cron endpoint — call this daily from an external scheduler.
 * It checks the refresh_frequency setting and only triggers
 * a data refresh when it's time.
 *
 * Protect with a secret token via CRON_SECRET env var.
 * Call: GET /api/cron?secret=your-secret
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const token = req.nextUrl.searchParams.get('secret')
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!shouldRefresh()) {
    const lastRefresh = getSetting('last_auto_refresh')
    const frequency = getSetting('refresh_frequency') || 'weekly'
    log('info', `Cron: overgeslagen (${frequency}), laatst ververst: ${lastRefresh}`)
    return NextResponse.json({
      refreshed: false,
      reason: `Not due yet (${frequency})`,
      lastRefresh,
    })
  }

  log('info', 'Cron: auto-refresh gestart')

  try {
    const result = await refreshData()

    // Refresh opportunities after article data
    let opportunityCount = 0
    try {
      const oppResult = await refreshOpportunities()
      opportunityCount = oppResult.count
      log('info', `Cron: opportunities ververst: ${opportunityCount}`)
    } catch (e) {
      log('error', `Cron: opportunities refresh fout: ${e instanceof Error ? e.message : String(e)}`)
    }

    setSetting('last_auto_refresh', new Date().toISOString())

    log('info', `Cron: auto-refresh voltooid`, {
      articles: result.articles?.length || 0,
      daily: result.daily?.length || 0,
      opportunities: opportunityCount,
    })

    return NextResponse.json({
      refreshed: true,
      articles: result.articles?.length || 0,
      daily: result.daily?.length || 0,
      opportunities: opportunityCount,
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    log('error', `Cron: refresh fout`, { error: errMsg })
    return NextResponse.json({ refreshed: false, error: errMsg }, { status: 500 })
  }
}
