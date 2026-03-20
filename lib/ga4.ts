import { BetaAnalyticsDataClient } from '@google-analytics/data'
import { log } from '@/lib/logger'

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

// Only organic search sessions
const ORGANIC_FILTER = {
  filter: {
    fieldName: 'sessionDefaultChannelGroup',
    stringFilter: {
      matchType: 'EXACT' as const,
      value: 'Organic Search',
    },
  },
}

type Row = { dimensionValues?: ({ value?: string | null } | null)[] | null; metricValues?: ({ value?: string | null } | null)[] | null }

async function paginatedReport(
  client: BetaAnalyticsDataClient,
  propertyId: string,
  config: {
    dateRanges: { startDate: string; endDate: string }[]
    dimensions: { name: string }[]
    metrics: { name: string }[]
    dimensionFilter?: object
  },
): Promise<Row[]> {
  const allRows: Row[] = []
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

function dimVal(row: Row, idx: number): string {
  return row.dimensionValues?.[idx]?.value || ''
}

function metricInt(row: Row, idx: number): number {
  return parseInt(row.metricValues?.[idx]?.value || '0', 10)
}

function metricFloat(row: Row, idx: number): number {
  return parseFloat(row.metricValues?.[idx]?.value || '0')
}

function formatDate(raw: string): string {
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
}

export async function fetchBlogArticles(
  credentials: GA4Credentials,
  propertyId: string,
): Promise<GA4ArticleData[]> {
  const client = createClient(credentials)
  const dateRanges = [{ startDate: '365daysAgo', endDate: 'today' }]

  // Three queries in parallel:
  // 1. pagePath + pageTitle: pageviews (all traffic, for title resolution)
  // 2. landingPage: revenue + transactions (organic only, landing page = blog article)
  // 3. pagePath: totalUsers (organic only)
  const [pageviewRows, revenueRows, organicUserRows] = await Promise.all([
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }],
      metrics: [{ name: 'screenPageViews' }],
    }),
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions: [{ name: 'landingPage' }],
      metrics: [
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      dimensionFilter: ORGANIC_FILTER,
    }),
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: ORGANIC_FILTER,
    }),
  ])

  // Build revenue map from landingPage (organic sessions starting on this page)
  // Strip query strings from landingPage — GA4 may include ?gclid= etc.
  const revenueByPath = new Map<string, { revenue: number; transactions: number }>()
  for (const row of revenueRows) {
    const rawPath = dimVal(row, 0)
    const path = rawPath.split('?')[0]
    const revenue = metricFloat(row, 0)
    const transactions = metricInt(row, 1)
    const existing = revenueByPath.get(path)
    if (existing) {
      existing.revenue += revenue
      existing.transactions += transactions
    } else {
      revenueByPath.set(path, { revenue, transactions })
    }
  }

  // Log revenue data for debugging
  let totalRevenue = 0
  for (const rev of revenueByPath.values()) totalRevenue += rev.revenue
  log('info', `GA4 revenue data: ${revenueRows.length} rijen, ${revenueByPath.size} unieke paden, totale omzet: €${totalRevenue.toFixed(2)}`)
  if (revenueByPath.size > 0) {
    const topPaths = [...revenueByPath.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([p, r]) => `${p} (€${r.revenue.toFixed(2)})`)
    log('info', `Top 5 revenue paden: ${topPaths.join(', ')}`)
  }

  // Build organic users map
  const organicByPath = new Map<string, number>()
  for (const row of organicUserRows) {
    const path = dimVal(row, 0)
    organicByPath.set(path, (organicByPath.get(path) || 0) + metricInt(row, 0))
  }

  // Build articles from pageview data, aggregate by pagePath
  // First pass: aggregate pageviews and pick best title
  const byPath = new Map<string, GA4ArticleData>()
  for (const row of pageviewRows) {
    const pagePath = dimVal(row, 0)
    const pageTitle = dimVal(row, 1)
    const pageviews = metricInt(row, 0)

    const existing = byPath.get(pagePath)
    if (existing) {
      existing.pageviews += pageviews
      if (pageviews > 0 && pageviews >= existing.pageviews - pageviews) {
        existing.pageTitle = pageTitle
      }
    } else {
      byPath.set(pagePath, {
        pagePath,
        pageTitle,
        pageviews,
        organicUsers: 0,
        revenue: 0,
        transactions: 0,
      })
    }
  }

  // Second pass: merge organic users and revenue into aggregated articles
  for (const [pagePath, article] of byPath) {
    article.organicUsers = organicByPath.get(pagePath) || 0
    const rev = revenueByPath.get(pagePath)
    if (rev) {
      article.revenue = rev.revenue
      article.transactions = rev.transactions
    }
  }

  // Add pages that only have organic/revenue data but no pageviews
  for (const path of new Set([...organicByPath.keys(), ...revenueByPath.keys()])) {
    if (!byPath.has(path)) {
      const rev = revenueByPath.get(path)
      byPath.set(path, {
        pagePath: path,
        pageTitle: '',
        pageviews: 0,
        organicUsers: organicByPath.get(path) || 0,
        revenue: rev?.revenue || 0,
        transactions: rev?.transactions || 0,
      })
    }
  }

  return [...byPath.values()]
}

export async function fetchBlogArticlesDaily(
  credentials: GA4Credentials,
  propertyId: string,
  chartDays: number = 30,
): Promise<GA4DailyData[]> {
  const client = createClient(credentials)
  const dateRanges = [{ startDate: `${chartDays}daysAgo`, endDate: 'today' }]

  // Three queries in parallel:
  // 1. pagePath + date: pageviews (all traffic)
  // 2. landingPage + date: revenue + transactions (organic only)
  // 3. pagePath + date: totalUsers (organic only)
  const [pageviewRows, revenueRows, organicUserRows] = await Promise.all([
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'date' }],
      metrics: [{ name: 'screenPageViews' }],
    }),
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions: [{ name: 'landingPage' }, { name: 'date' }],
      metrics: [
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      dimensionFilter: ORGANIC_FILTER,
    }),
    paginatedReport(client, propertyId, {
      dateRanges,
      dimensions: [{ name: 'pagePath' }, { name: 'date' }],
      metrics: [{ name: 'totalUsers' }],
      dimensionFilter: ORGANIC_FILTER,
    }),
  ])

  // Build revenue map: path|date → { revenue, transactions }
  // Strip query strings from landingPage
  const revenueByKey = new Map<string, { revenue: number; transactions: number }>()
  for (const row of revenueRows) {
    const path = dimVal(row, 0).split('?')[0]
    const date = formatDate(dimVal(row, 1))
    const key = `${path}|${date}`
    const revenue = metricFloat(row, 0)
    const transactions = metricInt(row, 1)
    const existing = revenueByKey.get(key)
    if (existing) {
      existing.revenue += revenue
      existing.transactions += transactions
    } else {
      revenueByKey.set(key, { revenue, transactions })
    }
  }

  // Build organic users map: path|date → users
  const organicByKey = new Map<string, number>()
  for (const row of organicUserRows) {
    const path = dimVal(row, 0)
    const date = formatDate(dimVal(row, 1))
    const key = `${path}|${date}`
    organicByKey.set(key, (organicByKey.get(key) || 0) + metricInt(row, 0))
  }

  // Build daily data from pageviews, then merge revenue + organic users
  const byKey = new Map<string, GA4DailyData>()
  for (const row of pageviewRows) {
    const pagePath = dimVal(row, 0)
    const date = formatDate(dimVal(row, 1))
    const key = `${pagePath}|${date}`
    const pageviews = metricInt(row, 0)

    const existing = byKey.get(key)
    if (existing) {
      existing.pageviews += pageviews
    } else {
      byKey.set(key, {
        pagePath,
        date,
        pageviews,
        organicUsers: 0,
        revenue: 0,
        transactions: 0,
      })
    }
  }

  // Merge organic users and revenue into aggregated daily data
  for (const [key, entry] of byKey) {
    entry.organicUsers = organicByKey.get(key) || 0
    const rev = revenueByKey.get(key)
    if (rev) {
      entry.revenue = rev.revenue
      entry.transactions = rev.transactions
    }
  }

  // Add entries with only organic/revenue data
  for (const key of new Set([...organicByKey.keys(), ...revenueByKey.keys()])) {
    if (!byKey.has(key)) {
      const [pagePath, date] = key.split('|')
      const rev = revenueByKey.get(key)
      byKey.set(key, {
        pagePath,
        date,
        pageviews: 0,
        organicUsers: organicByKey.get(key) || 0,
        revenue: rev?.revenue || 0,
        transactions: rev?.transactions || 0,
      })
    }
  }

  return [...byKey.values()]
}
