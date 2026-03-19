import { log } from './logger'

/**
 * Fetch all published blog post slugs from the WordPress REST API.
 * Returns a Set of slugs that are actual blog posts (not categories, tags, etc.)
 */
export async function fetchPostSlugs(siteUrl: string): Promise<Set<string>> {
  const slugs = new Set<string>()
  const base = siteUrl.replace(/\/+$/, '')
  let page = 1
  const perPage = 100

  try {
    while (true) {
      const url = `${base}/wp-json/wp/v2/posts?per_page=${perPage}&page=${page}&_fields=slug&status=publish`
      const res = await fetch(url)

      if (!res.ok) {
        if (page === 1) {
          log('warn', `WordPress REST API niet beschikbaar: ${res.status}`, { url: base })
        }
        break
      }

      const posts = await res.json() as { slug: string }[]
      if (posts.length === 0) break

      for (const post of posts) {
        slugs.add(post.slug)
      }

      // Check if there are more pages
      const totalPages = parseInt(res.headers.get('x-wp-totalpages') || '1', 10)
      if (page >= totalPages) break
      page++
    }

    log('info', `${slugs.size} blog post slugs opgehaald via WordPress API`, { site: base })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    log('warn', `WordPress API niet bereikbaar: ${errMsg}`, { site: base })
  }

  return slugs
}
