import { log } from './logger'

export interface TranslationGroup {
  urls: Record<string, string> // lang → full URL
}

/**
 * Parse a sitemap XML and extract all URL pathnames + hreflang translation groups.
 * Works for both post-sitemap.xml and category-sitemap.xml.
 */
async function parseSitemap(sitemapUrl: string): Promise<{
  paths: Set<string>
  groups: TranslationGroup[]
}> {
  const paths = new Set<string>()
  const groups: TranslationGroup[] = []

  try {
    const res = await fetch(sitemapUrl)
    if (!res.ok) {
      log('warn', `Sitemap niet bereikbaar: ${res.status}`, { url: sitemapUrl })
      return { paths, groups }
    }

    const xml = await res.text()
    const urlBlocks = xml.split('<url>').slice(1)

    for (const block of urlBlocks) {
      const locMatch = block.match(/<loc>([^<]+)<\/loc>/)
      if (!locMatch) continue

      const loc = locMatch[1]

      // Skip index pages like /blog/ itself
      try {
        const p = new URL(loc).pathname
        if (p === '/blog/' || p === '/blog') continue
      } catch { continue }

      // Extract all hreflang links
      const hreflangs: Record<string, string> = {}
      const hreflangRegex = /hreflang="([^"]+)"\s+href="([^"]+)"/g
      let match
      while ((match = hreflangRegex.exec(block)) !== null) {
        if (match[1] === 'x-default') continue
        hreflangs[match[1]] = match[2]
      }

      // Add all hreflang paths
      for (const [, href] of Object.entries(hreflangs)) {
        try { paths.add(new URL(href).pathname) } catch {}
      }

      // Also add the <loc> path
      try { paths.add(new URL(loc).pathname) } catch {}

      if (Object.keys(hreflangs).length > 0) {
        groups.push({ urls: hreflangs })
      }
    }

    log('info', `Sitemap geparsed: ${paths.size} paden, ${groups.length} groepen`, { url: sitemapUrl })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    log('warn', `Sitemap niet bereikbaar: ${errMsg}`, { url: sitemapUrl })
  }

  return { paths, groups }
}

/**
 * Fetch post-sitemap.xml — returns valid post paths + translation groups (hreflang).
 */
export async function fetchPostSitemap(sitemapUrl: string): Promise<{
  validPaths: Set<string>
  groups: TranslationGroup[]
}> {
  const { paths, groups } = await parseSitemap(sitemapUrl)
  return { validPaths: paths, groups }
}

/**
 * Fetch category-sitemap.xml — returns all category paths to exclude.
 */
export async function fetchCategorySitemap(sitemapUrl: string): Promise<Set<string>> {
  const { paths } = await parseSitemap(sitemapUrl)
  return paths
}
