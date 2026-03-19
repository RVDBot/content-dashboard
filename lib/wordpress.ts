import { log } from './logger'

/**
 * Fetch all blog post slugs from the WordPress post sitemap XML.
 * Extracts slugs from <loc> URLs in the sitemap.
 */
export async function fetchPostSlugs(siteUrl: string): Promise<Set<string>> {
  const slugs = new Set<string>()
  const base = siteUrl.replace(/\/+$/, '')
  const sitemapUrl = `${base}/post-sitemap.xml`

  try {
    const res = await fetch(sitemapUrl)
    if (!res.ok) {
      log('warn', `Post sitemap niet bereikbaar: ${res.status}`, { url: sitemapUrl })
      return slugs
    }

    const xml = await res.text()

    // Extract all <loc> URLs from sitemap
    const locRegex = /<loc>([^<]+)<\/loc>/g
    let match
    while ((match = locRegex.exec(xml)) !== null) {
      const url = match[1]
      try {
        const path = new URL(url).pathname
        // Extract slug: last meaningful path segment
        const segments = path.replace(/\/+$/, '').split('/').filter(Boolean)
        const slug = segments[segments.length - 1]
        if (slug) slugs.add(slug)
      } catch { /* invalid url */ }
    }

    log('info', `${slugs.size} post slugs opgehaald uit sitemap`, { url: sitemapUrl })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    log('warn', `Sitemap niet bereikbaar: ${errMsg}`, { url: sitemapUrl })
  }

  return slugs
}
