import { getDb, GA4Property } from '@/lib/db'
import { fetchSearchConsoleData, SearchQueryRow } from '@/lib/search-console'
import { expandSeedKeywords, AutocompleteTopic } from '@/lib/autocomplete'
import { log } from '@/lib/logger'

// Brand fit patterns for speedropeshop.com
const BRAND_PATTERNS: { pattern: RegExp; score: number }[] = [
  { pattern: /speed\s*rope|freestyle\s*rope|beaded\s*rope|pvc\s*rope|long\s*handle/i, score: 100 },
  { pattern: /jump\s*rope|skipping\s*rope|springtouw|springseil|cuerda\s*de\s*saltar|corda\s*per\s*saltare|corde\s*[àa]\s*sauter/i, score: 80 },
  { pattern: /crossfit|wod|double\s*under|triple\s*under|cross\s*training/i, score: 60 },
  { pattern: /fitness|workout|cardio|hiit|exercise|training|sport/i, score: 40 },
]

function getBrandFitScore(keyword: string): number {
  for (const { pattern, score } of BRAND_PATTERNS) {
    if (pattern.test(keyword)) return score
  }
  return 10
}

function getDifficultyScore(position: number | null): number {
  if (!position || position === 0) return 15
  if (position <= 3) return 90
  if (position <= 10) return 70
  if (position <= 20) return 50
  if (position <= 50) return 30
  return 15
}

function getDifficultyLabel(position: number | null): string {
  if (!position || position === 0) return 'easy'
  if (position <= 10) return 'hard'
  if (position <= 30) return 'medium'
  return 'easy'
}

function estimatedCTR(): number {
  return 0.05
}

function normalizeLog(value: number, maxValue: number): number {
  if (value <= 0) return 0
  return Math.min(100, (Math.log10(value + 1) / Math.log10(maxValue + 1)) * 100)
}

function getSetting(key: string): string {
  const db = getDb()
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value || ''
}

function getConversionMetrics(): { conversionRate: number; avgOrderValue: number } {
  const db = getDb()
  const result = db.prepare(`
    SELECT
      SUM(revenue) as total_revenue,
      SUM(transactions) as total_transactions,
      SUM(organic_users) as total_organic_users
    FROM articles
    WHERE organic_users > 0
  `).get() as { total_revenue: number; total_transactions: number; total_organic_users: number } | undefined

  if (!result || !result.total_organic_users || !result.total_transactions) {
    return { conversionRate: 0.02, avgOrderValue: 30 }
  }

  return {
    conversionRate: result.total_transactions / result.total_organic_users,
    avgOrderValue: result.total_revenue / result.total_transactions,
  }
}

/** Generate an article title suggestion from a keyword */
function generateTitleSuggestion(keyword: string, type: string): string {
  const kw = keyword.trim()
  const capitalized = kw.charAt(0).toUpperCase() + kw.slice(1)

  // Already a question — use as-is
  if (/^(how|what|why|when|where|which|can|is|are|do|does)\b/i.test(kw)) {
    return capitalized + (kw.endsWith('?') ? '' : '?')
  }

  // "X vs Y" → comparison article
  if (/\bvs\.?\b/i.test(kw)) {
    return `${capitalized}: Differences, Pros & Cons`
  }

  // "X for Y" → guide
  if (/\bfor\b/i.test(kw)) {
    return `${capitalized}: Complete Guide`
  }

  // Question type from expansion
  if (type === 'question') {
    return capitalized + (kw.endsWith('?') ? '' : '?')
  }

  // Default: make it a guide/article
  return `${capitalized}: Everything You Need to Know`
}

interface OpportunityData {
  keyword: string
  titleSuggestion: string
  source: string
  language: string
  monthlyImpressions: number
  currentPosition: number | null
  bestPage: string | null
  type: string
}

export async function refreshOpportunities(): Promise<{ count: number }> {
  const db = getDb()
  const clientEmail = getSetting('ga4_client_email')
  const privateKey = getSetting('ga4_private_key')

  if (!clientEmail || !privateKey) {
    throw new Error('GA4 credentials niet geconfigureerd')
  }

  const credentials = { clientEmail, privateKey }
  const properties = db.prepare("SELECT * FROM ga4_properties WHERE search_console_url != ''").all() as GA4Property[]

  if (properties.length === 0) {
    throw new Error('Geen properties met Search Console URL geconfigureerd')
  }

  // 1. Fetch Search Console data
  const allQueries: (SearchQueryRow & { language: string })[] = []
  for (const prop of properties) {
    try {
      const rows = await fetchSearchConsoleData(credentials, prop.search_console_url, 90)
      for (const row of rows) {
        allQueries.push({ ...row, language: prop.language })
      }
    } catch (e) {
      log('error', `Search Console fout voor ${prop.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Store search queries
  const upsertQuery = db.prepare(`
    INSERT INTO search_queries (query, page_url, language, clicks, impressions, ctr, position, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(query, page_url) DO UPDATE SET
      clicks = ?, impressions = ?, ctr = ?, position = ?, language = ?, updated_at = CURRENT_TIMESTAMP
  `)

  const insertQueries = db.transaction((queries: typeof allQueries) => {
    for (const q of queries) {
      upsertQuery.run(
        q.query, q.page, q.language, q.clicks, q.impressions, q.ctr, q.position,
        q.clicks, q.impressions, q.ctr, q.position, q.language,
      )
    }
  })
  insertQueries(allQueries)

  log('info', `Search queries opgeslagen: ${allQueries.length}`)

  // 2. Identify content gaps from Search Console
  const gapQueries = db.prepare(`
    SELECT query, language,
      SUM(impressions) as total_impressions,
      SUM(clicks) as total_clicks,
      MIN(position) as best_position,
      (SELECT page_url FROM search_queries sq2
       WHERE sq2.query = sq.query AND sq2.position = (SELECT MIN(position) FROM search_queries sq3 WHERE sq3.query = sq.query)
       LIMIT 1) as best_page
    FROM search_queries sq
    GROUP BY query
    HAVING total_impressions > 100
    ORDER BY total_impressions DESC
    LIMIT 1000
  `).all() as {
    query: string; language: string; total_impressions: number;
    total_clicks: number; best_position: number; best_page: string | null
  }[]

  // 3. Expand seed keywords (Answer The Public style)
  const seedKeywords = db.prepare('SELECT keyword, language FROM seed_keywords WHERE active = 1').all() as { keyword: string; language: string }[]
  let autocompleteTopics: AutocompleteTopic[] = []
  if (seedKeywords.length > 0) {
    autocompleteTopics = await expandSeedKeywords(seedKeywords)
  }

  // 4. Build opportunity map
  const { conversionRate, avgOrderValue } = getConversionMetrics()
  const maxImpressions = Math.max(1, ...gapQueries.map(q => q.total_impressions))

  const existingArticles = db.prepare('SELECT url FROM articles').all() as { url: string }[]
  const existingUrls = new Set(existingArticles.map(a => a.url.toLowerCase()))

  // Build SC impressions lookup for autocomplete topics
  const scByQuery = new Map<string, { impressions: number; position: number; page: string | null }>()
  for (const gap of gapQueries) {
    scByQuery.set(gap.query.toLowerCase(), {
      impressions: Math.round(gap.total_impressions / 3),
      position: gap.best_position,
      page: gap.best_page,
    })
  }

  const opportunityMap = new Map<string, OpportunityData>()

  // SC content gaps
  for (const gap of gapQueries) {
    const key = gap.query.toLowerCase()
    opportunityMap.set(key, {
      keyword: gap.query,
      titleSuggestion: generateTitleSuggestion(gap.query, 'direct'),
      source: 'search_console',
      language: gap.language,
      monthlyImpressions: Math.round(gap.total_impressions / 3),
      currentPosition: gap.best_position,
      bestPage: gap.best_page,
      type: 'direct',
    })
  }

  // Autocomplete topics — enriched with SC data if available
  for (const topic of autocompleteTopics) {
    const key = topic.keyword.toLowerCase()
    if (opportunityMap.has(key)) continue // SC data takes priority

    const scData = scByQuery.get(key)
    opportunityMap.set(key, {
      keyword: topic.keyword,
      titleSuggestion: generateTitleSuggestion(topic.keyword, topic.type),
      source: 'autocomplete',
      language: topic.language,
      monthlyImpressions: scData?.impressions || 0,
      currentPosition: scData?.position || null,
      bestPage: scData?.page || null,
      type: topic.type,
    })
  }

  // 5. Score and upsert
  const upsertOpp = db.prepare(`
    INSERT INTO opportunities (keyword, title_suggestion, source, language, monthly_impressions, estimated_volume,
      current_position, difficulty, expected_traffic, expected_revenue, brand_fit_score,
      priority_score, has_existing_content, existing_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(keyword) DO UPDATE SET
      title_suggestion = ?, source = ?, language = ?, monthly_impressions = ?, estimated_volume = ?,
      current_position = ?, difficulty = ?, expected_traffic = ?, expected_revenue = ?,
      brand_fit_score = ?, priority_score = ?, has_existing_content = ?, existing_url = ?,
      updated_at = CURRENT_TIMESTAMP
  `)

  let count = 0
  const insertOpps = db.transaction((opps: OpportunityData[]) => {
    for (const opp of opps) {
      const brandFit = getBrandFitScore(opp.keyword)
      const difficultyScore = getDifficultyScore(opp.currentPosition)
      const difficulty = getDifficultyLabel(opp.currentPosition)
      const estimatedVolume = opp.monthlyImpressions || 50
      const expectedTraffic = Math.round(estimatedVolume * estimatedCTR())
      const expectedRevenue = Math.round(expectedTraffic * conversionRate * avgOrderValue * 100) / 100

      const volumeScore = normalizeLog(opp.monthlyImpressions, maxImpressions)
      const maxRevenue = maxImpressions * estimatedCTR() * conversionRate * avgOrderValue
      const revenueScore = normalizeLog(expectedRevenue, maxRevenue)

      const priorityScore = Math.round(
        volumeScore * 0.30 +
        revenueScore * 0.30 +
        difficultyScore * 0.20 +
        brandFit * 0.20
      )

      const hasExisting = opp.bestPage ? existingUrls.has(opp.bestPage.toLowerCase()) : false
      const existingUrl = hasExisting ? opp.bestPage : null

      upsertOpp.run(
        opp.keyword, opp.titleSuggestion, opp.source, opp.language, opp.monthlyImpressions, estimatedVolume,
        opp.currentPosition, difficulty, expectedTraffic, expectedRevenue, brandFit,
        priorityScore, hasExisting ? 1 : 0, existingUrl,
        // ON CONFLICT params:
        opp.titleSuggestion, opp.source, opp.language, opp.monthlyImpressions, estimatedVolume,
        opp.currentPosition, difficulty, expectedTraffic, expectedRevenue, brandFit,
        priorityScore, hasExisting ? 1 : 0, existingUrl,
      )
      count++
    }
  })

  insertOpps([...opportunityMap.values()])

  log('info', `Opportunities ververst: ${count} totaal (${autocompleteTopics.length} autocomplete topics, conv.ratio: ${(conversionRate * 100).toFixed(2)}%, gem. orderwaarde: €${avgOrderValue.toFixed(2)})`)

  return { count }
}
