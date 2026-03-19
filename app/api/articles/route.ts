import { NextRequest, NextResponse } from 'next/server'
import { getDb, GA4Property } from '@/lib/db'
import { fetchBlogArticles } from '@/lib/ga4'
import { log } from '@/lib/logger'
import { requireAuth } from '@/lib/auth-guard'

function getCredentials() {
  const db = getDb()
  const get = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
  return {
    clientEmail: get('ga4_client_email'),
    privateKey: get('ga4_private_key'),
  }
}

export async function GET(req: NextRequest) {
  const denied = requireAuth(req); if (denied) return denied
  const refresh = req.nextUrl.searchParams.get('refresh') === '1'
  const db = getDb()

  // Return cached data if available and no refresh requested
  if (!refresh) {
    const cached = db.prepare('SELECT * FROM articles ORDER BY revenue DESC').all() as {
      url: string; title: string; language: string | null; pageviews: number; sessions: number; revenue: number; transactions: number
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

  // Check credentials
  const credentials = getCredentials()
  if (!credentials.clientEmail || !credentials.privateKey) {
    log('warn', 'GA4 service account niet geconfigureerd')
    return NextResponse.json({
      error: 'GA4 service account niet geconfigureerd. Ga naar Instellingen.',
      articles: [],
    })
  }

  // Get all properties
  const properties = db.prepare('SELECT * FROM ga4_properties').all() as GA4Property[]
  if (properties.length === 0) {
    log('warn', 'Geen GA4 properties geconfigureerd')
    return NextResponse.json({
      error: 'Geen GA4 properties geconfigureerd. Voeg properties toe in Instellingen.',
      articles: [],
    })
  }

  const errors: string[] = []

  // Upsert statement
  const upsert = db.prepare(`
    INSERT INTO articles (url, title, language, pageviews, sessions, revenue, transactions, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title,
      language = excluded.language,
      pageviews = excluded.pageviews,
      sessions = excluded.sessions,
      revenue = excluded.revenue,
      transactions = excluded.transactions,
      updated_at = CURRENT_TIMESTAMP
  `)

  // Fetch from each property
  for (const prop of properties) {
    try {
      log('info', `GA4 data ophalen voor ${prop.name}`, {
        property_id: prop.property_id,
        language: prop.language,
        key_length: credentials.privateKey.length,
        key_starts: credentials.privateKey.substring(0, 30),
        key_has_real_newlines: credentials.privateKey.includes('\n'),
        key_has_literal_backslash_n: credentials.privateKey.includes('\\n'),
      })
      const ga4Data = await fetchBlogArticles(credentials, prop.property_id, prop.blog_path)
      const baseUrl = prop.base_url.replace(/\/$/, '')

      for (const row of ga4Data) {
        const fullUrl = baseUrl ? `${baseUrl}${row.pagePath}` : row.pagePath
        upsert.run(fullUrl, row.pageTitle, prop.language, row.pageviews, row.sessions, row.revenue, row.transactions)
      }
      log('info', `${ga4Data.length} artikelen opgehaald voor ${prop.name}`, { language: prop.language })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      errors.push(`${prop.name}: ${errMsg}`)
      log('error', `GA4 ophalen mislukt voor ${prop.name}`, { error: errMsg, property_id: prop.property_id })
    }
  }

  const articles = db.prepare('SELECT * FROM articles ORDER BY revenue DESC').all() as {
    url: string; title: string; language: string | null; pageviews: number; sessions: number; revenue: number; transactions: number
  }[]

  log('info', `Data vernieuwd: ${articles.length} artikelen`, { errors: errors.length || undefined })

  return NextResponse.json({
    articles: articles.map(a => ({
      ...a,
      revenuePerSession: a.sessions > 0 ? a.revenue / a.sessions : 0,
    })),
    cached: false,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
