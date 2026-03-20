import { NextRequest, NextResponse } from 'next/server'
import { getDb, GA4Property } from '@/lib/db'
import { fetchBlogArticles, fetchBlogArticlesDaily } from '@/lib/ga4'
import { fetchPostSitemap, fetchCategorySitemap } from '@/lib/wordpress'
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
      url: string; title: string; language: string | null; group_id: number | null; pageviews: number; sessions: number; revenue: number; transactions: number
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

  // Fetch sitemaps from the EN site (or first property) for translation groups
  const enProp = properties.find(p => p.language === 'en') || properties[0]
  const enBase = enProp.base_url.replace(/\/+$/, '')

  // Fetch all sitemaps in parallel: EN post-sitemap for groups + each property's sitemaps
  const postSitemapUrls = new Set<string>()
  const categorySitemapUrls = new Set<string>()
  for (const prop of properties) {
    const base = prop.base_url.replace(/\/+$/, '')
    if (base && prop.post_sitemap_path) postSitemapUrls.add(`${base}${prop.post_sitemap_path}`)
    if (base && prop.category_sitemap_path) categorySitemapUrls.add(`${base}${prop.category_sitemap_path}`)
  }

  log('info', `Sitemaps ophalen: ${postSitemapUrls.size} post-sitemaps, ${categorySitemapUrls.size} category-sitemaps`)

  const [postResults, categoryResults] = await Promise.all([
    Promise.all([...postSitemapUrls].map(url => fetchPostSitemap(url))),
    Promise.all([...categorySitemapUrls].map(url => fetchCategorySitemap(url))),
  ])

  // Merge all valid post paths
  const validPaths = new Set<string>()
  let groups = postResults[0]?.groups || []
  for (const result of postResults) {
    for (const p of result.validPaths) validPaths.add(p)
    // Use the EN site's groups (first result) for translation mapping
    // but merge groups from other sitemaps if they add new ones
  }

  // Use the EN property's sitemap for canonical translation groups
  const enSitemapUrl = `${enBase}${enProp.post_sitemap_path}`
  const enResult = postResults.find((_, i) => [...postSitemapUrls][i] === enSitemapUrl)
  if (enResult) groups = enResult.groups

  // Merge all category paths to exclude
  const categoryPaths = new Set<string>()
  for (const catSet of categoryResults) {
    for (const p of catSet) categoryPaths.add(p)
  }

  // Remove category paths from valid paths
  for (const cp of categoryPaths) validPaths.delete(cp)

  log('info', `Sitemap resultaat: ${validPaths.size} geldige paden, ${categoryPaths.size} categorie-paden, ${groups.length} vertaalgroepen`)

  // Build a path → group index mapping from hreflang data
  const pathToGroup = new Map<string, number>()
  groups.forEach((group, idx) => {
    for (const [, url] of Object.entries(group.urls)) {
      try {
        pathToGroup.set(new URL(url).pathname, idx)
      } catch { /* skip */ }
    }
  })

  // Clear old data on refresh
  db.prepare('DELETE FROM articles').run()
  db.prepare('DELETE FROM article_daily').run()

  const upsertArticle = db.prepare(`
    INSERT INTO articles (url, title, language, group_id, pageviews, sessions, revenue, transactions, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(url) DO UPDATE SET
      title = excluded.title,
      language = excluded.language,
      group_id = excluded.group_id,
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

      // Fetch aggregate (365 days) — no dimension filter, filter server-side
      const ga4Data = await fetchBlogArticles(credentials, prop.property_id)
      let included = 0
      let skipped = 0
      for (const row of ga4Data) {
        if (validPaths.size > 0 && !validPaths.has(row.pagePath)) {
          skipped++
          continue
        }
        const groupId = pathToGroup.get(row.pagePath) ?? null
        const baseUrl = prop.base_url.replace(/\/$/, '')
        const fullUrl = baseUrl ? `${baseUrl}${row.pagePath}` : row.pagePath
        upsertArticle.run(fullUrl, row.pageTitle, prop.language, groupId, row.pageviews, row.sessions, row.revenue, row.transactions)
        included++
      }

      // Fetch daily (30 days)
      const dailyData = await fetchBlogArticlesDaily(credentials, prop.property_id)
      let dailyIncluded = 0
      let dailySkipped = 0
      for (const row of dailyData) {
        if (validPaths.size > 0 && !validPaths.has(row.pagePath)) {
          dailySkipped++
          continue
        }
        const baseUrl = prop.base_url.replace(/\/$/, '')
        const fullUrl = baseUrl ? `${baseUrl}${row.pagePath}` : row.pagePath
        upsertDaily.run(fullUrl, row.date, row.pageviews, row.sessions, row.revenue, row.transactions)
        dailyIncluded++
      }

      log('info', `${prop.name}: ${included} artikelen (${skipped} gefilterd), ${dailyIncluded} dagelijkse rijen (${dailySkipped} gefilterd) van ${dailyData.length} totaal`)
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      errors.push(`${prop.name}: ${errMsg}`)
      log('error', `GA4 ophalen mislukt voor ${prop.name}`, { error: errMsg, property_id: prop.property_id })
    }
  }

  const articles = db.prepare('SELECT * FROM articles ORDER BY revenue DESC').all() as {
    url: string; title: string; language: string | null; group_id: number | null; pageviews: number; sessions: number; revenue: number; transactions: number
  }[]

  const daily = db.prepare('SELECT * FROM article_daily ORDER BY date ASC').all() as {
    url: string; date: string; pageviews: number; sessions: number; revenue: number; transactions: number
  }[]

  log('info', `Data vernieuwd: ${articles.length} artikelen, ${daily.length} dagelijkse rijen`, {
    translation_groups: groups.length,
    valid_paths: validPaths.size,
    category_paths: categoryPaths.size,
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
