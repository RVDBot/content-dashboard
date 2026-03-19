import { NextRequest, NextResponse } from 'next/server'
import { getDb, GA4Property } from '@/lib/db'
import { fetchBlogArticles, fetchBlogArticlesDaily } from '@/lib/ga4'
import { fetchPostSlugs } from '@/lib/wordpress'
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

function extractSlug(pagePath: string): string {
  const match = pagePath.match(/\/blog\/(.+?)\/?\s*$/)
  if (match) return match[1]
  const segments = pagePath.replace(/\/+$/, '').split('/')
  return segments[segments.length - 1] || pagePath
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
      const daily = db.prepare('SELECT * FROM article_daily ORDER BY date ASC').all() as {
        url: string; date: string; pageviews: number; sessions: number; revenue: number; transactions: number
      }[]
      return NextResponse.json({
        articles: cached.map(a => ({
          ...a,
          revenuePerSession: a.sessions > 0 ? a.revenue / a.sessions : 0,
        })),
        daily,
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
      daily: [],
    })
  }

  // Get all properties
  const properties = db.prepare('SELECT * FROM ga4_properties').all() as GA4Property[]
  if (properties.length === 0) {
    log('warn', 'Geen GA4 properties geconfigureerd')
    return NextResponse.json({
      error: 'Geen GA4 properties geconfigureerd. Voeg properties toe in Instellingen.',
      articles: [],
      daily: [],
    })
  }

  const errors: string[] = []

  // Fetch valid blog post slugs from WordPress REST API
  // Use the first property's base_url or wc_store_url
  const siteUrl = properties[0]?.base_url ||
    (db.prepare('SELECT value FROM settings WHERE key = ?').get('wc_store_url') as { value: string } | undefined)?.value || ''
  let validSlugs: Set<string> | null = null
  if (siteUrl) {
    validSlugs = await fetchPostSlugs(siteUrl)
    if (validSlugs.size === 0) {
      log('warn', 'Geen post slugs gevonden via WordPress API, alle artikelen worden getoond')
      validSlugs = null // fallback: show all
    }
  }

  // Clear old data on refresh
  db.prepare('DELETE FROM articles').run()
  db.prepare('DELETE FROM article_daily').run()

  const upsertArticle = db.prepare(`
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

  const upsertDaily = db.prepare(`
    INSERT INTO article_daily (url, date, pageviews, sessions, revenue, transactions)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(url, date) DO UPDATE SET
      pageviews = excluded.pageviews,
      sessions = excluded.sessions,
      revenue = excluded.revenue,
      transactions = excluded.transactions
  `)

  for (const prop of properties) {
    try {
      log('info', `GA4 data ophalen voor ${prop.name}`, { property_id: prop.property_id, language: prop.language })
      const baseUrl = prop.base_url.replace(/\/$/, '')

      // Fetch aggregate (365 days)
      const ga4Data = await fetchBlogArticles(credentials, prop.property_id, prop.blog_path)
      let skipped = 0
      for (const row of ga4Data) {
        const slug = extractSlug(row.pagePath)
        if (validSlugs && !validSlugs.has(slug)) {
          skipped++
          continue
        }
        const fullUrl = baseUrl ? `${baseUrl}${row.pagePath}` : row.pagePath
        upsertArticle.run(fullUrl, row.pageTitle, prop.language, row.pageviews, row.sessions, row.revenue, row.transactions)
      }

      // Fetch daily (30 days)
      const dailyData = await fetchBlogArticlesDaily(credentials, prop.property_id, prop.blog_path)
      for (const row of dailyData) {
        const slug = extractSlug(row.pagePath)
        if (validSlugs && !validSlugs.has(slug)) continue
        const fullUrl = baseUrl ? `${baseUrl}${row.pagePath}` : row.pagePath
        upsertDaily.run(fullUrl, row.date, row.pageviews, row.sessions, row.revenue, row.transactions)
      }

      log('info', `${ga4Data.length - skipped} artikelen (${skipped} gefilterd) + dagelijkse data voor ${prop.name}`)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      errors.push(`${prop.name}: ${errMsg}`)
      log('error', `GA4 ophalen mislukt voor ${prop.name}`, { error: errMsg, property_id: prop.property_id })
    }
  }

  const articles = db.prepare('SELECT * FROM articles ORDER BY revenue DESC').all() as {
    url: string; title: string; language: string | null; pageviews: number; sessions: number; revenue: number; transactions: number
  }[]

  const daily = db.prepare('SELECT * FROM article_daily ORDER BY date ASC').all() as {
    url: string; date: string; pageviews: number; sessions: number; revenue: number; transactions: number
  }[]

  log('info', `Data vernieuwd: ${articles.length} artikelen, ${daily.length} dagelijkse rijen`, {
    valid_slugs: validSlugs?.size || 'niet beschikbaar',
    errors: errors.length || undefined,
  })

  return NextResponse.json({
    articles: articles.map(a => ({
      ...a,
      revenuePerSession: a.sessions > 0 ? a.revenue / a.sessions : 0,
    })),
    daily,
    cached: false,
    ...(errors.length > 0 ? { errors } : {}),
  })
}
