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

export async function fetchAllPages(
  credentials: GA4Credentials,
  propertyId: string,
  startDate: string,
  endDate: string,
  includeDateDimension: boolean = false,
): Promise<(GA4ArticleData | GA4DailyData)[]> {
  const client = createClient(credentials)
  const allRows: (GA4ArticleData | GA4DailyData)[] = []
  let offset = 0
  const pageSize = 10000

  const dimensions = includeDateDimension
    ? [{ name: 'pagePath' }, { name: 'date' }]
    : [{ name: 'pagePath' }, { name: 'pageTitle' }]

  while (true) {
    const [response] = await client.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [{ startDate, endDate }],
      dimensions,
      metrics: [
        { name: 'screenPageViews' },
        { name: 'sessions' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      ...(!includeDateDimension ? {
        orderBys: [{ metric: { metricName: 'purchaseRevenue' }, desc: true }],
      } : {}),
      limit: pageSize,
      offset,
    })

    if (!response.rows || response.rows.length === 0) break

    for (const row of response.rows) {
      const pagePath = row.dimensionValues?.[0]?.value || ''
      const pageviews = parseInt(row.metricValues?.[0]?.value || '0', 10)
      const sessions = parseInt(row.metricValues?.[1]?.value || '0', 10)
      const revenue = parseFloat(row.metricValues?.[2]?.value || '0')
      const transactions = parseInt(row.metricValues?.[3]?.value || '0', 10)

      if (includeDateDimension) {
        const raw = row.dimensionValues?.[1]?.value || ''
        const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
        allRows.push({ pagePath, date, pageviews, sessions, revenue, transactions })
      } else {
        const pageTitle = row.dimensionValues?.[1]?.value || ''
        allRows.push({ pagePath, pageTitle, pageviews, sessions, revenue, transactions })
      }
    }

    if (response.rows.length < pageSize) break
    offset += pageSize
  }

  return allRows
}

export async function fetchBlogArticles(
  credentials: GA4Credentials,
  propertyId: string,
): Promise<GA4ArticleData[]> {
  return fetchAllPages(credentials, propertyId, '365daysAgo', 'today', false) as Promise<GA4ArticleData[]>
}

export async function fetchBlogArticlesDaily(
  credentials: GA4Credentials,
  propertyId: string,
): Promise<GA4DailyData[]> {
  return fetchAllPages(credentials, propertyId, '30daysAgo', 'today', true) as Promise<GA4DailyData[]>
}
