import { log } from './logger'

export interface TranslationGroup {
  urls: Record<string, string> // lang → full URL
}

/**
 * Parse the post-sitemap.xml to extract:
 * 1. Valid post URLs (to filter out category pages)
 * 2. Translation mappings between languages via hreflang tags
 *
 * Returns a map of URL pathname → group ID, so all language versions
 * of the same article share the same group.
 */
export async function fetchSitemapTranslations(siteUrl: string): Promise<{
  validPaths: Set<string>
  groups: TranslationGroup[]
}> {
  const base = siteUrl.replace(/\/+$/, '')
  const sitemapUrl = `${base}/post-sitemap.xml`
  const validPaths = new Set<string>()
  const groups: TranslationGroup[] = []

  try {
    const res = await fetch(sitemapUrl)
    if (!res.ok) {
      log('warn', `Sitemap niet bereikbaar: ${res.status}`, { url: sitemapUrl })
      return { validPaths, groups }
    }

    const xml = await res.text()

    // Split into <url> blocks
    const urlBlocks = xml.split('<url>').slice(1) // skip before first <url>

    for (const block of urlBlocks) {
      // Extract <loc>
      const locMatch = block.match(/<loc>([^<]+)<\/loc>/)
      if (!locMatch) continue

      const loc = locMatch[1]

      // Skip the /blog/ index page
      try {
        const path = new URL(loc).pathname
        if (path === '/blog/' || path === '/blog') continue
      } catch { continue }

      // Extract all hreflang links
      const hreflangs: Record<string, string> = {}
      const hreflangRegex = /hreflang="([^"]+)"\s+href="([^"]+)"/g
      let match
      while ((match = hreflangRegex.exec(block)) !== null) {
        const lang = match[1]
        const href = match[2]
        if (lang === 'x-default') continue
        hreflangs[lang] = href
      }

      // Add all paths from this group as valid
      for (const [, href] of Object.entries(hreflangs)) {
        try {
          validPaths.add(new URL(href).pathname)
        } catch { /* skip invalid */ }
      }

      // Also add the <loc> path
      try {
        validPaths.add(new URL(loc).pathname)
      } catch { /* skip */ }

      if (Object.keys(hreflangs).length > 0) {
        groups.push({ urls: hreflangs })
      }
    }

    log('info', `Sitemap geparsed: ${groups.length} artikelen, ${validPaths.size} geldige paden`, { url: sitemapUrl })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    log('warn', `Sitemap niet bereikbaar: ${errMsg}`, { url: sitemapUrl })
  }

  return { validPaths, groups }
}
