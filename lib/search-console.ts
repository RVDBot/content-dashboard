import { google } from 'googleapis'
import { log } from '@/lib/logger'

interface Credentials {
  clientEmail: string
  privateKey: string
}

export interface SearchQueryRow {
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

function createAuth(credentials: Credentials) {
  let privateKey = credentials.privateKey.trim().replace(/\\n/g, '\n')
  privateKey = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----\s*/, '-----BEGIN PRIVATE KEY-----\n')
    .replace(/\s*-----END PRIVATE KEY-----/, '\n-----END PRIVATE KEY-----\n')

  return new google.auth.JWT({
    email: credentials.clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
  })
}

export async function fetchSearchConsoleData(
  credentials: Credentials,
  siteUrl: string,
  days: number = 90,
): Promise<SearchQueryRow[]> {
  const auth = createAuth(credentials)
  const searchconsole = google.searchconsole({ version: 'v1', auth })

  const endDate = new Date()
  endDate.setDate(endDate.getDate() - 3) // SC data has ~3 day delay
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - days)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  const allRows: SearchQueryRow[] = []
  let startRow = 0
  const rowLimit = 25000

  while (true) {
    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: fmt(startDate),
        endDate: fmt(endDate),
        dimensions: ['query', 'page'],
        rowLimit,
        startRow,
      },
    })

    const rows = response.data.rows
    if (!rows || rows.length === 0) break

    for (const row of rows) {
      allRows.push({
        query: row.keys?.[0] || '',
        page: row.keys?.[1] || '',
        clicks: row.clicks || 0,
        impressions: row.impressions || 0,
        ctr: row.ctr || 0,
        position: row.position || 0,
      })
    }

    if (rows.length < rowLimit) break
    startRow += rowLimit
  }

  log('info', `Search Console: ${allRows.length} rijen opgehaald voor ${siteUrl}`)
  return allRows
}
