import { getDb } from '@/lib/db'

const CACHE_DAYS = 7

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function fetchAutocompleteSuggestions(
  query: string,
  language: string = 'en',
): Promise<string[]> {
  const db = getDb()

  // Check cache
  const cached = db.prepare(
    `SELECT suggestions, fetched_at FROM autocomplete_cache WHERE keyword = ? AND language = ?`
  ).get(query, language) as { suggestions: string; fetched_at: string } | undefined

  if (cached) {
    const age = (Date.now() - new Date(cached.fetched_at).getTime()) / (1000 * 60 * 60 * 24)
    if (age < CACHE_DAYS) {
      return JSON.parse(cached.suggestions)
    }
  }

  // Fetch from Google
  const langMap: Record<string, string> = {
    nl: 'nl', en: 'en', de: 'de', es: 'es', it: 'it', fr: 'fr',
  }
  const hl = langMap[language] || 'en'
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=${hl}`

  const res = await fetch(url)
  if (!res.ok) return []

  const data = await res.json()
  const suggestions: string[] = Array.isArray(data[1]) ? data[1] : []

  // Cache result
  db.prepare(
    `INSERT INTO autocomplete_cache (keyword, language, suggestions, fetched_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(keyword, language) DO UPDATE SET suggestions = ?, fetched_at = CURRENT_TIMESTAMP`
  ).run(query, language, JSON.stringify(suggestions), JSON.stringify(suggestions))

  await sleep(200) // Rate limit

  return suggestions
}

export async function fetchSuggestionsForSeedKeywords(
  seedKeywords: { keyword: string; language: string }[],
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>()
  for (const seed of seedKeywords) {
    const suggestions = await fetchAutocompleteSuggestions(seed.keyword, seed.language)
    results.set(`${seed.keyword}|${seed.language}`, suggestions)
  }
  return results
}
