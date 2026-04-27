import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type { MeetingSummary } from '../types/ipc'

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (db) return db
  const dataDir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  db = new Database(path.join(dataDir, 'teleprompter.db'))
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS meetings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      transcript TEXT NOT NULL,
      summary_markdown TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
    CREATE TABLE IF NOT EXISTS meeting_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
      image_path TEXT NOT NULL,
      captured_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_meeting_images_meeting ON meeting_images(meeting_id);
  `)
  // 後から追加したカラム（既存DBのマイグレーション）
  const cols = db
    .prepare(`PRAGMA table_info(meetings)`)
    .all() as Array<{ name: string }>
  if (!cols.some((c) => c.name === 'folder_path')) {
    db.exec(`ALTER TABLE meetings ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''`)
  }
  return db
}

function imagesDir(): string {
  const dir = path.join(app.getPath('userData'), 'data', 'images')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeImage(dataUrl: string, meetingId: number, idx: number): string {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/)
  if (!m) throw new Error('invalid dataUrl')
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1]
  const filePath = path.join(
    imagesDir(),
    `meeting-${meetingId}-${idx}.${ext}`,
  )
  fs.writeFileSync(filePath, Buffer.from(m[2], 'base64'))
  return filePath
}

export function insertMeeting(args: {
  title: string
  startedAt: number
  endedAt: number
  transcript: string
  summaryMarkdown: string
  imageDataUrls: string[]
  folderPath?: string
}): MeetingSummary {
  const d = getDb()
  const stmt = d.prepare(`
    INSERT INTO meetings(title, started_at, ended_at, duration_ms, transcript, summary_markdown, folder_path)
    VALUES (@title, @startedAt, @endedAt, @durationMs, @transcript, @summaryMarkdown, @folderPath)
  `)
  const info = stmt.run({
    title: args.title,
    startedAt: args.startedAt,
    endedAt: args.endedAt,
    durationMs: Math.max(0, args.endedAt - args.startedAt),
    transcript: args.transcript,
    summaryMarkdown: args.summaryMarkdown,
    folderPath: args.folderPath ?? '',
  })
  const meetingId = Number(info.lastInsertRowid)
  const imgStmt = d.prepare(
    `INSERT INTO meeting_images(meeting_id, image_path, captured_at) VALUES (?, ?, ?)`,
  )
  const paths: string[] = []
  args.imageDataUrls.forEach((url, idx) => {
    try {
      const p = writeImage(url, meetingId, idx)
      imgStmt.run(meetingId, p, Date.now())
      paths.push(p)
    } catch {
      // skip broken entry
    }
  })

  return {
    id: meetingId,
    title: args.title,
    date: new Date(args.startedAt).toISOString(),
    durationMs: Math.max(0, args.endedAt - args.startedAt),
    transcript: args.transcript,
    summaryMarkdown: args.summaryMarkdown,
    imagePaths: paths,
    folderPath: args.folderPath ?? '',
  }
}

export function updateMeetingFolder(id: number, folderPath: string): void {
  const d = getDb()
  d.prepare(`UPDATE meetings SET folder_path = ? WHERE id = ?`).run(
    folderPath,
    id,
  )
}

export function listMeetings(): MeetingSummary[] {
  const d = getDb()
  const rows = d
    .prepare(
      `SELECT id, title, started_at as startedAt, ended_at as endedAt,
              duration_ms as durationMs, transcript, summary_markdown as summaryMarkdown,
              folder_path as folderPath
       FROM meetings ORDER BY started_at DESC`,
    )
    .all() as Array<{
    id: number
    title: string
    startedAt: number
    endedAt: number
    durationMs: number
    transcript: string
    summaryMarkdown: string
    folderPath: string
  }>

  const imgStmt = d.prepare(
    `SELECT image_path FROM meeting_images WHERE meeting_id = ? ORDER BY captured_at ASC`,
  )
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    date: new Date(r.startedAt).toISOString(),
    durationMs: r.durationMs,
    transcript: r.transcript,
    summaryMarkdown: r.summaryMarkdown,
    imagePaths: (imgStmt.all(r.id) as Array<{ image_path: string }>).map(
      (x) => x.image_path,
    ),
    folderPath: r.folderPath,
  }))
}

export function getMeeting(id: number): MeetingSummary | null {
  const d = getDb()
  const row = d
    .prepare(
      `SELECT id, title, started_at as startedAt, ended_at as endedAt,
              duration_ms as durationMs, transcript, summary_markdown as summaryMarkdown,
              folder_path as folderPath
       FROM meetings WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number
        title: string
        startedAt: number
        endedAt: number
        durationMs: number
        transcript: string
        summaryMarkdown: string
        folderPath: string
      }
    | undefined
  if (!row) return null
  const images = (
    d
      .prepare(
        `SELECT image_path FROM meeting_images WHERE meeting_id = ? ORDER BY captured_at ASC`,
      )
      .all(row.id) as Array<{ image_path: string }>
  ).map((x) => x.image_path)
  return {
    id: row.id,
    title: row.title,
    date: new Date(row.startedAt).toISOString(),
    durationMs: row.durationMs,
    transcript: row.transcript,
    summaryMarkdown: row.summaryMarkdown,
    imagePaths: images,
    folderPath: row.folderPath,
  }
}
