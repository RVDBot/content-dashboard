import { BetaAnalyticsDataClient } from '@google-analytics/data'

interface GA4Credentials {
  clientEmail: string
  privateKey: string
}

export interface GA4ArticleData {
  pagePath: string
  pageTitle: string
  pageviews: number
  sessions: number
  revenue: number
  transactions: number
}

export interface GA4DailyData {
  pagePath: string
  date: string // YYYY-MM-DD
  pageviews: number
  sessions: number
  revenue: number
  transactions: number
}

function createClient(credentials: GA4Credentials) {
  let privateKey = credentials.privateKey.trim()
  privateKey = privateKey.replace(/\\n/g, '\n')
  privateKey = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----\s*/, '-----BEGIN PRIVATE KEY-----\n')
    .replace(/\s*-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----\n')

  return new BetaAnalyticsDataClient({
    credentials: {
      client_email: credentials.clientEmail,
      private_key: privateKey,
    },
  })
}

export async function fetchBlogArticles(
  credentials: GA4Credentials,
  propertyId: string,
): Promise<GA4ArticleData[]> {
  const client = createClient(credentials)

  // Fetch with pagePath + pageTitle dimensions
  const allRows: { pagePath: string; pageTitle: string; pageviews: number; sessions: number; revenue: number; transactions: number }[] = []
  let offset = 0
  const pageSize = 10000

  while (true) {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '365daysAgo', endDate: 'today' }],
      dimensions: [
        { name: 'pagePath' },
        { name: 'pageTitle' },
      ],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      limit: pageSize,
      offset,
    })

    if (!response.rows || response.rows.length === 0) break

    for (const row of response.rows) {
      allRows.push({
        pagePath: row.dimensionValues?.[0]?.value || '',
        pageTitle: row.dimensionValues?.[1]?.value || '',
        pageviews: parseInt(row.metricValues?.[0]?.value || '0', 10),
        sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
        revenue: parseFloat(row.metricValues?.[2]?.value || '0'),
        transactions: parseInt(row.metricValues?.[3]?.value || '0', 10),
      })
    }

    if (response.rows.length < pageSize) break
    offset += pageSize
  }

  // Aggregate by pagePath: sum metrics, keep title from row with most pageviews
  const byPath = new Map<string, GA4ArticleData>()
  for (const row of allRows) {
    const existing = byPath.get(row.pagePath)
    if (existing) {
      existing.pageviews += row.pageviews
      existing.sessions += row.sessions
      existing.revenue += row.revenue
      existing.transactions += row.transactions
      if (row.pageviews > 0 && row.pageviews >= existing.pageviews - row.pageviews) {
        existing.pageTitle = row.pageTitle
      }
    } else {
      byPath.set(row.pagePath, { ...row })
    }
  }

  return [...byPath.values()]
}

export async function fetchBlogArticlesDaily(
  credentials: GA4Credentials,
  propertyId: string,
): Promise<GA4DailyData[]> {
  const client = createClient(credentials)
  const allRows: GA4DailyData[] = []
  let offset = 0
  const pageSize = 10000

  while (true) {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [
        { name: 'pagePath' },
        { name: 'date' },
      ],
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      limit: pageSize,
      offset,
    })

    if (!response.rows || response.rows.length === 0) break

    for (const row of response.rows) {
      const raw = row.dimensionValues?.[1]?.value || ''
      const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
      allRows.push({
        pagePath: row.dimensionValues?.[0]?.value || '',
        date,
        pageviews: parseInt(row.metricValues?.[0]?.value || '0', 10),
        sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
        revenue: parseFloat(row.metricValues?.[2]?.value || '0'),
        transactions: parseInt(row.metricValues?.[3]?.value || '0', 10),
      })
    }

    if (response.rows.length < pageSize) break
    offset += pageSize
  }

  return allRows
}
