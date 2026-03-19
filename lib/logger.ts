import { getDb } from './db'

export function log(level: 'info' | 'error' | 'warn', message: string, meta?: Record<string, unknown>) {
  try {
    const db = getDb()
    db.prepare('INSERT INTO logs (level, message, meta) VALUES (?, ?, ?)')
      .run(level, message, meta ? JSON.stringify(meta) : null)
  } catch {
    console.error(`[${level}] ${message}`, meta)
  }
}
