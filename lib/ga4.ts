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

export async function fetchBlogArticles(
  credentials: GA4Credentials,
  propertyId: string,
  blogPath: string = '/blog/'
): Promise<GA4ArticleData[]> {
  const { clientEmail, privateKey } = credentials

  const client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    },
  })

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
