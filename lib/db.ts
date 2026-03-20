import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), 'data', 'content-dashboard.db')

const dir = path.dirname(DB_PATH)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS ga4_properties (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      language    TEXT NOT NULL,
      property_id TEXT NOT NULL,
      base_url    TEXT NOT NULL DEFAULT '',
      blog_path   TEXT NOT NULL DEFAULT '/blog/',
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      url           TEXT NOT NULL UNIQUE,
      title         TEXT,
      language      TEXT,
      pageviews     INTEGER NOT NULL DEFAULT 0,
      sessions      INTEGER NOT NULL DEFAULT 0,
      revenue       REAL NOT NULL DEFAULT 0,
      transactions  INTEGER NOT NULL DEFAULT 0,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS article_daily (
      url         TEXT NOT NULL,
      date        TEXT NOT NULL,
      pageviews   INTEGER NOT NULL DEFAULT 0,
      sessions    INTEGER NOT NULL DEFAULT 0,
      revenue     REAL NOT NULL DEFAULT 0,
      transactions INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (url, date)
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT NOT NULL DEFAULT 'info',
      message    TEXT NOT NULL,
      meta       TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Migrations
  try { db.exec(`ALTER TABLE articles ADD COLUMN language TEXT`) } catch {}
  try { db.exec(`ALTER TABLE articles ADD COLUMN group_id INTEGER`) } catch {}
  try { db.exec(`ALTER TABLE ga4_properties ADD COLUMN post_sitemap_path TEXT NOT NULL DEFAULT '/post-sitemap.xml'`) } catch {}
  try { db.exec(`ALTER TABLE ga4_properties ADD COLUMN category_sitemap_path TEXT NOT NULL DEFAULT '/category-sitemap.xml'`) } catch {}
  try { db.exec(`ALTER TABLE articles ADD COLUMN organic_users INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE article_daily ADD COLUMN organic_users INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE ga4_properties ADD COLUMN search_console_url TEXT NOT NULL DEFAULT ''`) } catch {}

  // Content opportunity tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS search_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      page_url TEXT,
      language TEXT,
      clicks INTEGER NOT NULL DEFAULT 0,
      impressions INTEGER NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(query, page_url)
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      title_suggestion TEXT,
      description TEXT,
      source TEXT NOT NULL DEFAULT 'search_console',
      language TEXT,
      monthly_impressions INTEGER NOT NULL DEFAULT 0,
      estimated_volume INTEGER NOT NULL DEFAULT 0,
      current_position REAL,
      difficulty TEXT NOT NULL DEFAULT 'medium',
      expected_traffic INTEGER NOT NULL DEFAULT 0,
      expected_revenue REAL NOT NULL DEFAULT 0,
      brand_fit_score REAL NOT NULL DEFAULT 0,
      priority_score REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      has_existing_content INTEGER NOT NULL DEFAULT 0,
      existing_url TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS seed_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      language TEXT NOT NULL DEFAULT 'en',
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS autocomplete_cache (
      keyword TEXT NOT NULL,
      language TEXT NOT NULL,
      suggestions TEXT NOT NULL DEFAULT '[]',
      fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(keyword, language)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunities_keyword ON opportunities(keyword);
  `)
}

export interface GA4Property {
  id: number
  name: string
  language: string
  property_id: string
  base_url: string
  blog_path: string
  post_sitemap_path: string
  category_sitemap_path: string
  search_console_url: string
  created_at: string
}
