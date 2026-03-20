import { BetaAnalyticsDataClient } from '@google-analytics/data'

interface GA4Credentials {
  clientEmail: string
  privateKey: string
}

export interface GA4ArticleData {
  pagePath: string
  pageTitle: string
  pageviews: number
  organicUsers: number
  revenue: number
  transactions: number
}

export interface GA4DailyData {
  pagePath: string
  date: string // YYYY-MM-DD
  pageviews: number
  organicUsers: number
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

const ORGANIC_FILTER = {
  filter: {
    fieldName: 'sessionDefaultChannelGroup',
    stringFilter: {
      matchType: 'EXACT' as const,
      value: 'Organic Search',
    },
  },
}

async function paginatedReport(
  client: BetaAnalyticsDataClient,
  propertyId: string,
  config: {
    dateRanges: { startDate: string; endDate: string }[]
    dimensions: { name: string }[]
    metrics: { name: string }[]
    dimensionFilter?: object
  },
) {
  const allRows: { dimensionValues?: ({ value?: string | null } | null)[] | null; metricValues?: ({ value?: string | null } | null)[] | null }[] = []
  let offset = 0
  const pageSize = 10000

  while (true) {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      ...config,
      limit: pageSize,
      offset,
    })

    if (!response.rows || response.rows.length === 0) break
    allRows.push(...response.rows)
    if (response.rows.length < pageSize) break
    offset += pageSize
  }

  return allRows
}

export async function fetchBlogArticles(
  credentials: GA4Credentials,
  propertyId: string,
): Promise<GA4ArticleData[]> {
  const client = createClient(credentials)
  const dateRanges = [{ startDate: '365daysAgo', endDate: 'today' }]
  const dimensions = [{ name: 'pagePath' }, { name: 'pageTitle' }]

  // Two queries in parallel:
  // 1. All traffic: revenue, pageviews, transactions (no channel filter)
  // 2. Organic only: unique users
  const [allTrafficRows, organicRows] = await Promise.all([
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions,
      metrics: [
        { name: 'screenPageViews' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
    }),
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: ORGANIC_FILTER,
    }),
  ])

  // Build organic users map
  const organicByPath = new Map<string, number>()
  for (const row of organicRows) {
    const path = row.dimensionValues?.[0]?.value || ''
    const users = parseInt(row.metricValues?.[0]?.value || '0', 10)
    organicByPath.set(path, (organicByPath.get(path) || 0) + users)
  }

  // Aggregate all-traffic by pagePath: sum metrics, keep title from row with most pageviews
  const byPath = new Map<string, GA4ArticleData>()
  for (const row of allTrafficRows) {
    const pagePath = row.dimensionValues?.[0]?.value || ''
    const pageTitle = row.dimensionValues?.[1]?.value || ''
    const pageviews = parseInt(row.metricValues?.[0]?.value || '0', 10)
    const revenue = parseFloat(row.metricValues?.[1]?.value || '0')
    const transactions = parseInt(row.metricValues?.[2]?.value || '0', 10)

    const existing = byPath.get(pagePath)
    if (existing) {
      existing.pageviews += pageviews
      existing.revenue += revenue
      existing.transactions += transactions
      if (pageviews > 0 && pageviews >= existing.pageviews - pageviews) {
        existing.pageTitle = pageTitle
      }
    } else {
      byPath.set(pagePath, {
        pagePath,
        pageTitle,
        pageviews,
        organicUsers: 0,
        revenue,
        transactions,
      })
    }
  }

  // Merge organic users into results
  for (const [path, users] of organicByPath) {
    const article = byPath.get(path)
    if (article) {
      article.organicUsers = users
    } else {
      // Article only has organic traffic, no other traffic
      byPath.set(path, {
        pagePath: path,
        pageTitle: '',
        pageviews: 0,
        organicUsers: users,
        revenue: 0,
        transactions: 0,
      })
    }
  }

  return [...byPath.values()]
}

export async function fetchBlogArticlesDaily(
  credentials: GA4Credentials,
  propertyId: string,
): Promise<GA4DailyData[]> {
  const client = createClient(credentials)
  const dateRanges = [{ startDate: '30daysAgo', endDate: 'today' }]
  const dimensions = [{ name: 'pagePath' }, { name: 'date' }]

  // Two queries in parallel:
  // 1. All traffic: revenue, pageviews, transactions
  // 2. Organic only: unique users
  const [allTrafficRows, organicRows] = await Promise.all([
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions,
      metrics: [
        { name: 'screenPageViews' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
    }),
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions,
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: ORGANIC_FILTER,
    }),
  ])

  // Build organic users map: path+date → users
  const organicByKey = new Map<string, number>()
  for (const row of organicRows) {
    const path = row.dimensionValues?.[0]?.value || ''
    const rawDate = row.dimensionValues?.[1]?.value || ''
    const date = rawDate.length === 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate
    const key = `${path}|${date}`
    const users = parseInt(row.metricValues?.[0]?.value || '0', 10)
    organicByKey.set(key, (organicByKey.get(key) || 0) + users)
  }

  // Build results from all-traffic data, merge organic users
  const byKey = new Map<string, GA4DailyData>()
  for (const row of allTrafficRows) {
    const pagePath = row.dimensionValues?.[0]?.value || ''
    const rawDate = row.dimensionValues?.[1]?.value || ''
    const date = rawDate.length === 8 ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : rawDate
    const key = `${pagePath}|${date}`
    const pageviews = parseInt(row.metricValues?.[0]?.value || '0', 10)
    const revenue = parseFloat(row.metricValues?.[1]?.value || '0')
    const transactions = parseInt(row.metricValues?.[2]?.value || '0', 10)

    const existing = byKey.get(key)
    if (existing) {
      existing.pageviews += pageviews
      existing.revenue += revenue
      existing.transactions += transactions
    } else {
      byKey.set(key, {
        pagePath,
        date,
        pageviews,
        organicUsers: organicByKey.get(key) || 0,
        revenue,
        transactions,
      })
    }
  }

  // Add entries that only have organic traffic
  for (const [key, users] of organicByKey) {
    if (!byKey.has(key)) {
      const [pagePath, date] = key.split('|')
      byKey.set(key, {
        pagePath,
        date,
        pageviews: 0,
        organicUsers: users,
        revenue: 0,
        transactions: 0,
      })
    }
  }

  return [...byKey.values()]
}
