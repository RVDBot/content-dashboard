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
}

export interface GA4Property {
  id: number
  name: string
  language: string
  property_id: string
  base_url: string
  blog_path: string
  created_at: string
}
