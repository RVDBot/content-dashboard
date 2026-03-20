import { getDb, GA4Property } from '@/lib/db'
import { fetchSearchConsoleData, SearchQueryRow } from '@/lib/search-console'
import { expandSeedKeywords, AutocompleteTopic } from '@/lib/autocomplete'
import { generateArticleSuggestions, ArticleSuggestion } from '@/lib/ai-suggestions'
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

interface KeywordData {
  keyword: string
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

  // 4. Build keyword data map — combine SC gaps + autocomplete
  const scByQuery = new Map<string, { impressions: number; position: number; page: string | null }>()
  for (const gap of gapQueries) {
    scByQuery.set(gap.query.toLowerCase(), {
      impressions: Math.round(gap.total_impressions / 3),
      position: gap.best_position,
      page: gap.best_page,
    })
  }

  const allKeywords = new Map<string, KeywordData>()

  for (const gap of gapQueries) {
    allKeywords.set(gap.query.toLowerCase(), {
      keyword: gap.query,
      source: 'search_console',
      language: gap.language,
      monthlyImpressions: Math.round(gap.total_impressions / 3),
      currentPosition: gap.best_position,
      bestPage: gap.best_page,
      type: 'direct',
    })
  }

  for (const topic of autocompleteTopics) {
    const key = topic.keyword.toLowerCase()
    if (allKeywords.has(key)) continue
    const scData = scByQuery.get(key)
    allKeywords.set(key, {
      keyword: topic.keyword,
      source: 'autocomplete',
      language: topic.language,
      monthlyImpressions: scData?.impressions || 0,
      currentPosition: scData?.position || null,
      bestPage: scData?.page || null,
      type: topic.type,
    })
  }

  log('info', `Totaal keywords verzameld: ${allKeywords.size} (${gapQueries.length} SC gaps, ${autocompleteTopics.length} autocomplete)`)

  // 5. AI clustering — group keywords into article suggestions
  const anthropicKey = getSetting('anthropic_api_key')
  const { conversionRate, avgOrderValue } = getConversionMetrics()
  const existingArticles = db.prepare('SELECT url FROM articles').all() as { url: string }[]
  const existingUrls = new Set(existingArticles.map(a => a.url.toLowerCase()))

  // Get unique languages from keywords
  const languages = new Set<string>()
  for (const kw of allKeywords.values()) languages.add(kw.language)

  let aiSuggestions: ArticleSuggestion[] = []

  if (anthropicKey) {
    const keywordInputs = [...allKeywords.values()].map(k => ({
      keyword: k.keyword,
      monthlyImpressions: k.monthlyImpressions,
      type: k.type,
      language: k.language,
    }))

    for (const lang of languages) {
      try {
        const suggestions = await generateArticleSuggestions(anthropicKey, keywordInputs, lang)
        aiSuggestions.push(...suggestions)
      } catch (e) {
        log('error', `AI suggesties fout (${lang}): ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    log('info', `AI suggesties: ${aiSuggestions.length} artikelen gegenereerd`)
  } else {
    log('info', 'Geen Anthropic API key geconfigureerd — AI suggesties overgeslagen')
  }

  // 6. Clear old opportunities and insert new ones
  db.prepare('DELETE FROM opportunities').run()

  const insertOpp = db.prepare(`
    INSERT INTO opportunities (keyword, title_suggestion, description, source, language,
      monthly_impressions, estimated_volume, current_position, difficulty,
      expected_traffic, expected_revenue, brand_fit_score, priority_score,
      has_existing_content, existing_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `)

  const maxImpressions = Math.max(1, ...[...allKeywords.values()].map(k => k.monthlyImpressions))

  let count = 0

  if (aiSuggestions.length > 0) {
    // AI mode: each suggestion = one opportunity, with aggregated metrics from target keywords
    const insertAI = db.transaction((suggestions: ArticleSuggestion[]) => {
      for (const suggestion of suggestions) {
        // Aggregate metrics from target keywords
        let totalImpressions = 0
        let bestPosition: number | null = null
        let bestPage: string | null = null

        for (const targetKw of suggestion.targetKeywords) {
          const kwData = allKeywords.get(targetKw.toLowerCase())
          if (kwData) {
            totalImpressions += kwData.monthlyImpressions
            if (kwData.currentPosition && (!bestPosition || kwData.currentPosition < bestPosition)) {
              bestPosition = kwData.currentPosition
              bestPage = kwData.bestPage
            }
          }
        }

        const primaryKeyword = suggestion.targetKeywords[0] || suggestion.title
        const brandFit = Math.max(...suggestion.targetKeywords.map(k => getBrandFitScore(k)), getBrandFitScore(suggestion.title))
        const difficultyScore = getDifficultyScore(bestPosition)
        const difficulty = getDifficultyLabel(bestPosition)
        const estimatedVolume = totalImpressions || 50
        const expectedTraffic = Math.round(estimatedVolume * estimatedCTR())
        const expectedRevenue = Math.round(expectedTraffic * conversionRate * avgOrderValue * 100) / 100

        const volumeScore = normalizeLog(totalImpressions, maxImpressions)
        const maxRevenue = maxImpressions * estimatedCTR() * conversionRate * avgOrderValue
        const revenueScore = normalizeLog(expectedRevenue, maxRevenue)

        const priorityScore = Math.round(
          volumeScore * 0.30 +
          revenueScore * 0.30 +
          difficultyScore * 0.20 +
          brandFit * 0.20
        )

        const hasExisting = bestPage ? existingUrls.has(bestPage.toLowerCase()) : false
        const description = `${suggestion.description}\n\nDoelzoekwoorden: ${suggestion.targetKeywords.join(', ')}`

        insertOpp.run(
          primaryKeyword, suggestion.title, description,
          `ai_${suggestion.angle}`, suggestion.language,
          totalImpressions, estimatedVolume, bestPosition, difficulty,
          expectedTraffic, expectedRevenue, brandFit, priorityScore,
          hasExisting ? 1 : 0, hasExisting ? bestPage : null,
        )
        count++
      }
    })
    insertAI(aiSuggestions)
  } else {
    // Fallback: store keywords as individual opportunities (no AI)
    const insertKeywords = db.transaction((keywords: KeywordData[]) => {
      for (const kw of keywords) {
        const brandFit = getBrandFitScore(kw.keyword)
        const difficultyScore = getDifficultyScore(kw.currentPosition)
        const difficulty = getDifficultyLabel(kw.currentPosition)
        const estimatedVolume = kw.monthlyImpressions || 50
        const expectedTraffic = Math.round(estimatedVolume * estimatedCTR())
        const expectedRevenue = Math.round(expectedTraffic * conversionRate * avgOrderValue * 100) / 100

        const volumeScore = normalizeLog(kw.monthlyImpressions, maxImpressions)
        const maxRevenue = maxImpressions * estimatedCTR() * conversionRate * avgOrderValue
        const revenueScore = normalizeLog(expectedRevenue, maxRevenue)

        const priorityScore = Math.round(
          volumeScore * 0.30 +
          revenueScore * 0.30 +
          difficultyScore * 0.20 +
          brandFit * 0.20
        )

        const hasExisting = kw.bestPage ? existingUrls.has(kw.bestPage.toLowerCase()) : false

        // Simple title suggestion
        const capitalized = kw.keyword.charAt(0).toUpperCase() + kw.keyword.slice(1)
        let title = `${capitalized}: Everything You Need to Know`
        if (/^(how|what|why|when|where|which|can|is|are)\b/i.test(kw.keyword)) {
          title = capitalized + (kw.keyword.endsWith('?') ? '' : '?')
        } else if (/\bvs\.?\b/i.test(kw.keyword)) {
          title = `${capitalized}: Differences, Pros & Cons`
        } else if (/\bfor\b/i.test(kw.keyword)) {
          title = `${capitalized}: Complete Guide`
        }

        insertOpp.run(
          kw.keyword, title, null, kw.source, kw.language,
          kw.monthlyImpressions, estimatedVolume, kw.currentPosition, difficulty,
          expectedTraffic, expectedRevenue, brandFit, priorityScore,
          hasExisting ? 1 : 0, hasExisting ? kw.bestPage : null,
        )
        count++
      }
    })
    insertKeywords([...allKeywords.values()])
  }

  log('info', `Opportunities ververst: ${count} totaal (AI: ${aiSuggestions.length > 0 ? 'ja' : 'nee'}, conv.ratio: ${(conversionRate * 100).toFixed(2)}%, gem. orderwaarde: €${avgOrderValue.toFixed(2)})`)

  return { count }
}
