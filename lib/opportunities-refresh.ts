import { getDb, GA4Property } from '@/lib/db'
import { fetchSearchConsoleData, SearchQueryRow } from '@/lib/search-console'
import { fetchSuggestionsForSeedKeywords } from '@/lib/autocomplete'
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
  if (!position || position === 0) return 15 // No existing ranking — new content needed
  if (position <= 3) return 90
  if (position <= 10) return 70
  if (position <= 20) return 50
  if (position <= 50) return 30
  return 15
}

function getDifficultyLabel(position: number | null): string {
  if (!position || position === 0) return 'easy' // No competition yet
  if (position <= 10) return 'hard'
  if (position <= 30) return 'medium'
  return 'easy'
}

// Estimated CTR for target position 5
function estimatedCTR(): number {
  return 0.05 // ~5% CTR for position 5
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
    return { conversionRate: 0.02, avgOrderValue: 30 } // Defaults
  }

  return {
    conversionRate: result.total_transactions / result.total_organic_users,
    avgOrderValue: result.total_revenue / result.total_transactions,
  }
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

  // 2. Identify content gaps: high impressions but no good ranking
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

  // 3. Fetch autocomplete suggestions for seed keywords
  const seedKeywords = db.prepare('SELECT keyword, language FROM seed_keywords WHERE active = 1').all() as { keyword: string; language: string }[]
  let autocompleteSuggestions: string[] = []
  if (seedKeywords.length > 0) {
    const suggestionsMap = await fetchSuggestionsForSeedKeywords(seedKeywords)
    const allSuggestions = new Set<string>()
    for (const suggestions of suggestionsMap.values()) {
      for (const s of suggestions) allSuggestions.add(s.toLowerCase())
    }
    autocompleteSuggestions = [...allSuggestions]
  }

  // 4. Calculate scores
  const { conversionRate, avgOrderValue } = getConversionMetrics()
  const maxImpressions = Math.max(1, ...gapQueries.map(q => q.total_impressions))

  // Build existing URLs set for matching
  const existingArticles = db.prepare('SELECT url FROM articles').all() as { url: string }[]
  const existingUrls = new Set(existingArticles.map(a => a.url.toLowerCase()))

  // Combine SC gaps + autocomplete into opportunities
  interface OpportunityData {
    keyword: string
    source: string
    language: string
    monthlyImpressions: number
    currentPosition: number | null
    bestPage: string | null
  }

  const opportunityMap = new Map<string, OpportunityData>()

  for (const gap of gapQueries) {
    const key = gap.query.toLowerCase()
    opportunityMap.set(key, {
      keyword: gap.query,
      source: 'search_console',
      language: gap.language,
      monthlyImpressions: Math.round(gap.total_impressions / 3), // 3 months → monthly
      currentPosition: gap.best_position,
      bestPage: gap.best_page,
    })
  }

  for (const suggestion of autocompleteSuggestions) {
    if (!opportunityMap.has(suggestion)) {
      opportunityMap.set(suggestion, {
        keyword: suggestion,
        source: 'autocomplete',
        language: 'en',
        monthlyImpressions: 0,
        currentPosition: null,
        bestPage: null,
      })
    }
  }

  // 5. Score and upsert
  const upsertOpp = db.prepare(`
    INSERT INTO opportunities (keyword, source, language, monthly_impressions, estimated_volume,
      current_position, difficulty, expected_traffic, expected_revenue, brand_fit_score,
      priority_score, has_existing_content, existing_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(keyword) DO UPDATE SET
      source = ?, language = ?, monthly_impressions = ?, estimated_volume = ?,
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
      const estimatedVolume = opp.monthlyImpressions || 50 // Autocomplete gets minimum estimate
      const expectedTraffic = Math.round(estimatedVolume * estimatedCTR())
      const expectedRevenue = Math.round(expectedTraffic * conversionRate * avgOrderValue * 100) / 100

      // Normalize for scoring
      const volumeScore = normalizeLog(opp.monthlyImpressions, maxImpressions)
      const maxRevenue = maxImpressions * estimatedCTR() * conversionRate * avgOrderValue
      const revenueScore = normalizeLog(expectedRevenue, maxRevenue)

      const priorityScore = Math.round(
        volumeScore * 0.30 +
        revenueScore * 0.30 +
        difficultyScore * 0.20 +
        brandFit * 0.20
      )

      // Check existing content
      const hasExisting = opp.bestPage ? existingUrls.has(opp.bestPage.toLowerCase()) : false
      const existingUrl = hasExisting ? opp.bestPage : null

      upsertOpp.run(
        opp.keyword, opp.source, opp.language, opp.monthlyImpressions, estimatedVolume,
        opp.currentPosition, difficulty, expectedTraffic, expectedRevenue, brandFit,
        priorityScore, hasExisting ? 1 : 0, existingUrl,
        // ON CONFLICT params:
        opp.source, opp.language, opp.monthlyImpressions, estimatedVolume,
        opp.currentPosition, difficulty, expectedTraffic, expectedRevenue, brandFit,
        priorityScore, hasExisting ? 1 : 0, existingUrl,
      )
      count++
    }
  })

  insertOpps([...opportunityMap.values()])

  log('info', `Opportunities ververst: ${count} totaal (conv.ratio: ${(conversionRate * 100).toFixed(2)}%, gem. orderwaarde: €${avgOrderValue.toFixed(2)})`)

  return { count }
}
