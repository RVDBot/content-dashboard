import { getDb, GA4Property } from '@/lib/db'
import { fetchSearchConsoleData, SearchQueryRow } from '@/lib/search-console'
import { expandSeedKeywords, AutocompleteTopic } from '@/lib/autocomplete'
import { generateArticleSuggestions, ArticleSuggestion } from '@/lib/ai-suggestions'
import { log } from '@/lib/logger'

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
    SELECT SUM(revenue) as total_revenue, SUM(transactions) as total_transactions,
      SUM(organic_users) as total_organic_users
    FROM articles WHERE organic_users > 0
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
  db.transaction((queries: typeof allQueries) => {
    for (const q of queries) {
      upsertQuery.run(q.query, q.page, q.language, q.clicks, q.impressions, q.ctr, q.position,
        q.clicks, q.impressions, q.ctr, q.position, q.language)
    }
  })(allQueries)
  log('info', `Search queries opgeslagen: ${allQueries.length}`)

  // 2. Content gaps from Search Console
  const gapQueries = db.prepare(`
    SELECT query, language, SUM(impressions) as total_impressions, SUM(clicks) as total_clicks,
      MIN(position) as best_position,
      (SELECT page_url FROM search_queries sq2
       WHERE sq2.query = sq.query AND sq2.position = (SELECT MIN(position) FROM search_queries sq3 WHERE sq3.query = sq.query)
       LIMIT 1) as best_page
    FROM search_queries sq GROUP BY query
    HAVING total_impressions > 100
    ORDER BY total_impressions DESC LIMIT 1000
  `).all() as {
    query: string; language: string; total_impressions: number;
    total_clicks: number; best_position: number; best_page: string | null
  }[]

  // 3. Expand seed keywords
  const seedKeywords = db.prepare('SELECT keyword, language FROM seed_keywords WHERE active = 1').all() as { keyword: string; language: string }[]
  let autocompleteTopics: AutocompleteTopic[] = []
  if (seedKeywords.length > 0) {
    autocompleteTopics = await expandSeedKeywords(seedKeywords)
  }

  // 4. Build keyword data
  const scByQuery = new Map<string, { impressions: number; position: number; page: string | null }>()
  for (const gap of gapQueries) {
    scByQuery.set(gap.query.toLowerCase(), {
      impressions: Math.round(gap.total_impressions / 3),
      position: gap.best_position, page: gap.best_page,
    })
  }

  const allKeywords = new Map<string, KeywordData>()
  for (const gap of gapQueries) {
    allKeywords.set(gap.query.toLowerCase(), {
      keyword: gap.query, source: 'search_console', language: gap.language,
      monthlyImpressions: Math.round(gap.total_impressions / 3),
      currentPosition: gap.best_position, bestPage: gap.best_page, type: 'direct',
    })
  }
  for (const topic of autocompleteTopics) {
    const key = topic.keyword.toLowerCase()
    if (allKeywords.has(key)) continue
    const scData = scByQuery.get(key)
    allKeywords.set(key, {
      keyword: topic.keyword, source: 'autocomplete', language: topic.language,
      monthlyImpressions: scData?.impressions || 0,
      currentPosition: scData?.position || null, bestPage: scData?.page || null, type: topic.type,
    })
  }

  log('info', `Keywords verzameld: ${allKeywords.size} (${gapQueries.length} SC, ${autocompleteTopics.length} autocomplete)`)

  // Helper: find matching keywords using substring/fuzzy matching
  function findMatchingKeywords(targetKws: string[]): KeywordData[] {
    const matched: KeywordData[] = []
    const matchedKeys = new Set<string>()

    for (const target of targetKws) {
      const t = target.toLowerCase().trim()

      // Exact match first
      const exact = allKeywords.get(t)
      if (exact && !matchedKeys.has(t)) {
        matched.push(exact)
        matchedKeys.add(t)
        continue
      }

      // Substring match: find all keywords that contain this target or vice versa
      for (const [key, data] of allKeywords) {
        if (matchedKeys.has(key)) continue
        if (key.includes(t) || t.includes(key)) {
          matched.push(data)
          matchedKeys.add(key)
        }
      }
    }

    return matched
  }

  // 5. AI suggestions — only if no existing opportunities, or explicitly forced
  const anthropicKey = getSetting('anthropic_api_key')
  const aiModel = getSetting('ai_model') || 'claude-haiku-4-5-20251001'
  const existingOpps = db.prepare('SELECT COUNT(*) as count FROM opportunities').get() as { count: number }

  let aiSuggestions: ArticleSuggestion[] | null = null

  if (anthropicKey && existingOpps.count === 0) {
    // First time — generate AI suggestions
    try {
      const kwInputs = [...allKeywords.values()].map(k => ({
        keyword: k.keyword, monthlyImpressions: k.monthlyImpressions, type: k.type,
      }))
      aiSuggestions = await generateArticleSuggestions(anthropicKey, aiModel, kwInputs)
      log('info', `AI: ${aiSuggestions.length} artikel-ideeën gegenereerd`)
    } catch (e) {
      log('error', `AI suggesties fout: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (existingOpps.count > 0) {
    log('info', 'Bestaande opportunities gevonden — AI suggesties overgeslagen, alleen metrics bijgewerkt')
  }

  // 6. Upsert opportunities
  const { conversionRate, avgOrderValue } = getConversionMetrics()
  const existingArticles = db.prepare('SELECT url FROM articles').all() as { url: string }[]
  const existingUrls = new Set(existingArticles.map(a => a.url.toLowerCase()))
  const maxImpressions = Math.max(1, ...[...allKeywords.values()].map(k => k.monthlyImpressions))
  const CTR = 0.05

  let count = 0

  if (aiSuggestions && aiSuggestions.length > 0) {
    // Insert new AI-generated opportunities
    const insertOpp = db.prepare(`
      INSERT INTO opportunities (keyword, title_suggestion, description, source, language,
        monthly_impressions, estimated_volume, current_position, difficulty,
        expected_traffic, expected_revenue, brand_fit_score, priority_score,
        has_existing_content, existing_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)

    db.transaction((suggestions: ArticleSuggestion[]) => {
      for (const s of suggestions) {
        const matchedKws = findMatchingKeywords(s.targetKeywords)

        let totalImpressions = 0
        let bestPosition: number | null = null
        let bestPage: string | null = null

        for (const data of matchedKws) {
          totalImpressions += data.monthlyImpressions
          if (data.currentPosition && (!bestPosition || data.currentPosition < bestPosition)) {
            bestPosition = data.currentPosition
            bestPage = data.bestPage
          }
        }

        log('info', `AI artikel "${s.title}": ${matchedKws.length} keyword matches, ${totalImpressions} imp/mnd`)

        const brandFit = Math.max(...s.targetKeywords.map(k => getBrandFitScore(k)), getBrandFitScore(s.title))
        const diffScore = getDifficultyScore(bestPosition)
        const difficulty = getDifficultyLabel(bestPosition)
        const volume = totalImpressions || 50
        const traffic = Math.round(volume * CTR)
        const revenue = Math.round(traffic * conversionRate * avgOrderValue * 100) / 100
        const volScore = normalizeLog(totalImpressions, maxImpressions)
        const maxRev = maxImpressions * CTR * conversionRate * avgOrderValue
        const revScore = normalizeLog(revenue, maxRev)
        const priority = Math.round(volScore * 0.30 + revScore * 0.30 + diffScore * 0.20 + brandFit * 0.20)
        const hasExisting = bestPage ? existingUrls.has(bestPage.toLowerCase()) : false
        const desc = `${s.description}\n\nDoelzoekwoorden: ${s.targetKeywords.join(', ')}`

        insertOpp.run(
          s.targetKeywords[0] || s.title, s.title, desc, `ai_${s.angle}`, 'en',
          totalImpressions, volume, bestPosition, difficulty,
          traffic, revenue, brandFit, priority,
          hasExisting ? 1 : 0, hasExisting ? bestPage : null,
        )
        count++
      }
    })(aiSuggestions)
  } else if (existingOpps.count > 0) {
    // Update metrics on existing opportunities without regenerating
    const opps = db.prepare('SELECT id, keyword, description FROM opportunities').all() as { id: number; keyword: string; description: string | null }[]
    const updateOpp = db.prepare(`
      UPDATE opportunities SET monthly_impressions = ?, estimated_volume = ?,
        current_position = ?, difficulty = ?, expected_traffic = ?, expected_revenue = ?,
        brand_fit_score = ?, priority_score = ?, has_existing_content = ?, existing_url = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)

    db.transaction(() => {
      for (const opp of opps) {
        const kwMatch = opp.description?.match(/Doelzoekwoorden: (.+)$/)
        const targetKws = kwMatch ? kwMatch[1].split(', ') : [opp.keyword]

        const matchedKws = findMatchingKeywords(targetKws)

        let totalImpressions = 0
        let bestPosition: number | null = null
        let bestPage: string | null = null

        for (const data of matchedKws) {
          totalImpressions += data.monthlyImpressions
          if (data.currentPosition && (!bestPosition || data.currentPosition < bestPosition)) {
            bestPosition = data.currentPosition
            bestPage = data.bestPage
          }
        }

        const brandFit = Math.max(...targetKws.map(k => getBrandFitScore(k)))
        const diffScore = getDifficultyScore(bestPosition)
        const difficulty = getDifficultyLabel(bestPosition)
        const volume = totalImpressions || 50
        const traffic = Math.round(volume * CTR)
        const revenue = Math.round(traffic * conversionRate * avgOrderValue * 100) / 100
        const volScore = normalizeLog(totalImpressions, maxImpressions)
        const maxRev = maxImpressions * CTR * conversionRate * avgOrderValue
        const revScore = normalizeLog(revenue, maxRev)
        const priority = Math.round(volScore * 0.30 + revScore * 0.30 + diffScore * 0.20 + brandFit * 0.20)
        const hasExisting = bestPage ? existingUrls.has(bestPage.toLowerCase()) : false

        updateOpp.run(totalImpressions, volume, bestPosition, difficulty,
          traffic, revenue, brandFit, priority,
          hasExisting ? 1 : 0, hasExisting ? bestPage : null, opp.id)
        count++
      }
    })()
  } else {
    log('info', 'Geen Anthropic API key — geen opportunities gegenereerd')
  }

  log('info', `Opportunities ververst: ${count} (AI: ${aiSuggestions ? 'ja' : 'nee/cached'})`)
  return { count }
}
