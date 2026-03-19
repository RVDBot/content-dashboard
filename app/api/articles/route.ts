import { NextRequest, NextResponse } from 'next/server'
import { getDb } from '@/lib/db'
import { fetchBlogArticles } from '@/lib/ga4'

function getSettings() {
  const db = getDb()
  const get = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
  return {
    propertyId: get('ga4_property_id'),
    clientEmail: get('ga4_client_email'),
    privateKey: get('ga4_private_key'),
    storeUrl: get('wc_store_url'),
  }
}

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const db = getDb()

  // Return cached data if available and no refresh requested
  if (!refresh) {
    const cached = db.prepare('SELECT * FROM articles ORDER BY revenue DESC').all() as {
      url: string; title: string; pageviews: number; sessions: number; revenue: number; transactions: number
    }[]
    if (cached.length > 0) {
      return NextResponse.json({
        articles: cached.map(a => ({
          ...a,
          revenuePerSession: a.sessions > 0 ? a.revenue / a.sessions : 0,
        })),
        cached: true,
      })
    }
  }

  // Fetch from GA4
  const settings = getSettings()
  if (!settings.propertyId || !settings.clientEmail || !settings.privateKey) {
    return NextResponse.json({
      error: 'GA4 instellingen niet geconfigureerd. Ga naar Instellingen.',
      articles: [],
    })
  }

  try {
    const ga4Data = await fetchBlogArticles({
      propertyId: settings.propertyId,
      clientEmail: settings.clientEmail,
      privateKey: settings.privateKey,
    })

    // Build full URL from path
    const baseUrl = (settings.storeUrl || '').replace(/\/$/, '')

    // Upsert articles
    const upsert = db.prepare(`
      INSERT INTO articles (url, title, pageviews, sessions, revenue, transactions, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        pageviews = excluded.pageviews,
        sessions = excluded.sessions,
        revenue = excluded.revenue,
        transactions = excluded.transactions,
        updated_at = CURRENT_TIMESTAMP
    `)

    for (const row of ga4Data) {
      const fullUrl = baseUrl ? `${baseUrl}${row.pagePath}` : row.pagePath
      upsert.run(fullUrl, row.pageTitle, row.pageviews, row.sessions, row.revenue, row.transactions)
    }

    const articles = db.prepare('SELECT * FROM articles ORDER BY revenue DESC').all() as {
      url: string; title: string; pageviews: number; sessions: number; revenue: number; transactions: number
    }[]

    return NextResponse.json({
      articles: articles.map(a => ({
        ...a,
        revenuePerSession: a.sessions > 0 ? a.revenue / a.sessions : 0,
      })),
      cached: false,
    })
  } catch (e) {
    return NextResponse.json({
      error: `GA4 ophalen mislukt: ${e instanceof Error ? e.message : String(e)}`,
      articles: [],
    })
  }
}
