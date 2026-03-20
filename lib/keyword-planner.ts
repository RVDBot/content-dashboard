import { getDb } from '@/lib/db'
import { log } from '@/lib/logger'

interface KeywordVolume {
  keyword: string
  avgMonthlySearches: number
  competition: string
}

interface Credentials {
  developerToken: string
  clientId: string
  clientSecret: string
  refreshToken: string
  customerId: string
}

async function getAccessToken(clientId: string, clientSecret: string, refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OAuth2 token refresh mislukt: ${err}`)
  }

  const data = await res.json()
  return data.access_token
}

export async function fetchKeywordVolumes(
  credentials: Credentials,
  keywords: string[],
): Promise<Map<string, KeywordVolume>> {
  const db = getDb()
  const results = new Map<string, KeywordVolume>()

  // Check cache first (7 days)
  const uncached: string[] = []
  for (const kw of keywords) {
    const cached = db.prepare(
      `SELECT keyword, avg_monthly_searches, competition FROM keyword_volumes
       WHERE keyword = ? AND fetched_at > datetime('now', '-7 days')`
    ).get(kw.toLowerCase()) as { keyword: string; avg_monthly_searches: number; competition: string } | undefined

    if (cached) {
      results.set(kw.toLowerCase(), {
        keyword: cached.keyword,
        avgMonthlySearches: cached.avg_monthly_searches,
        competition: cached.competition,
      })
    } else {
      uncached.push(kw)
    }
  }

  if (uncached.length === 0) {
    log('info', `Keyword Planner: alle ${keywords.length} keywords uit cache`)
    return results
  }

  log('info', `Keyword Planner: ${uncached.length} keywords ophalen (${results.size} uit cache)`)

  const accessToken = await getAccessToken(credentials.clientId, credentials.clientSecret, credentials.refreshToken)

  // Google Ads API batches max ~20 keywords per request for best results
  const batchSize = 20
  for (let i = 0; i < uncached.length; i += batchSize) {
    const batch = uncached.slice(i, i + batchSize)

    const customerId = credentials.customerId.replace(/-/g, '')
    const res = await fetch(
      `https://googleads.googleapis.com/v23/customers/${customerId}:generateKeywordIdeas`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'developer-token': credentials.developerToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keywordSeed: { keywords: batch },
          keywordPlanNetwork: 'GOOGLE_SEARCH',
        }),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      log('error', `Keyword Planner API fout: ${err}`)
      throw new Error(`Keyword Planner API fout: ${res.status}`)
    }

    const data = await res.json()

    // Build a lookup from the response
    const responseLookup = new Map<string, { searches: number; competition: string }>()
    for (const result of data.results || []) {
      const text = result.text?.toLowerCase()
      const metrics = result.keywordIdeaMetrics
      if (text && metrics) {
        responseLookup.set(text, {
          searches: parseInt(metrics.avgMonthlySearches || '0', 10),
          competition: metrics.competition || 'UNSPECIFIED',
        })
      }
    }

    // Match our requested keywords to results
    const upsert = db.prepare(`
      INSERT INTO keyword_volumes (keyword, avg_monthly_searches, competition, fetched_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(keyword) DO UPDATE SET
        avg_monthly_searches = ?, competition = ?, fetched_at = CURRENT_TIMESTAMP
    `)

    for (const kw of batch) {
      const key = kw.toLowerCase()
      const match = responseLookup.get(key)
      const searches = match?.searches || 0
      const competition = match?.competition || 'UNSPECIFIED'

      results.set(key, { keyword: kw, avgMonthlySearches: searches, competition })
      upsert.run(key, searches, competition, searches, competition)
    }

    // Rate limit between batches
    if (i + batchSize < uncached.length) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  log('info', `Keyword Planner: ${results.size} keywords verwerkt`)
  return results
}

export function getAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/adwords',
    access_type: 'offline',
    prompt: 'consent',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export async function exchangeCodeForToken(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange mislukt: ${err}`)
  }

  const data = await res.json()
  if (!data.refresh_token) {
    throw new Error('Geen refresh token ontvangen. Probeer opnieuw met prompt=consent.')
  }
  return data.refresh_token
}
