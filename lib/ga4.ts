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
  blogPath: string = '/blog/'
): Promise<GA4ArticleData[]> {
  const client = createClient(credentials)

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
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          matchType: 'CONTAINS',
          value: blogPath,
        },
      },
    },
    orderBys: [{ metric: { metricName: 'purchaseRevenue' }, desc: true }],
    limit: 500,
  })

  if (!response.rows) return []

  return response.rows.map(row => ({
    pagePath: row.dimensionValues?.[0]?.value || '',
    pageTitle: row.dimensionValues?.[1]?.value || '',
    pageviews: parseInt(row.metricValues?.[0]?.value || '0', 10),
    sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
    revenue: parseFloat(row.metricValues?.[2]?.value || '0'),
    transactions: parseInt(row.metricValues?.[3]?.value || '0', 10),
  }))
}

export async function fetchBlogArticlesDaily(
  credentials: GA4Credentials,
  propertyId: string,
  blogPath: string = '/blog/'
): Promise<GA4DailyData[]> {
  const client = createClient(credentials)

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
    dimensionFilter: {
      filter: {
        fieldName: 'pagePath',
        stringFilter: {
          matchType: 'CONTAINS',
          value: blogPath,
        },
      },
    },
    limit: 10000,
  })

  if (!response.rows) return []

  return response.rows.map(row => {
    const raw = row.dimensionValues?.[1]?.value || '' // 20260319
    const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw
    return {
      pagePath: row.dimensionValues?.[0]?.value || '',
      date,
      pageviews: parseInt(row.metricValues?.[0]?.value || '0', 10),
      sessions: parseInt(row.metricValues?.[1]?.value || '0', 10),
      revenue: parseFloat(row.metricValues?.[2]?.value || '0'),
      transactions: parseInt(row.metricValues?.[3]?.value || '0', 10),
    }
  })
}
