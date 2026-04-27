import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import type { TranscriptEntry } from '../types/ipc'

/**
 * 会議1件ぶんをユーザーが Finder で直接開けるフォルダとして書き出す。
 * 既定の親ディレクトリは ~/Documents/Mienaq/。
 * サブフォルダは "YYYY-MM-DD HH-mm タイトル" の形式。
 */

export interface ArchivePayload {
  id: number
  title: string
  startedAt: number
  endedAt: number
  transcript: TranscriptEntry[]
  summaryMarkdown: string
  imageDataUrls: string[]
  companyProfile?: string
  language?: 'ja' | 'en'
}

export interface ArchiveResult {
  folderPath: string
  files: string[]
}

function baseArchiveDir(): string {
  // Documents フォルダ直下にアプリ専用の親フォルダ。
  // Windows の OneDrive リダイレクトや非英語ロケールでも正しい実体パスを返すため、
  // os.homedir() ではなく app.getPath('documents') を使う。
  return path.join(app.getPath('documents'), 'Mienaq')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatLocalTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}-${pad2(d.getMinutes())}`
}

// Windows/macOS 両方で使えるよう、ファイル名に使えない記号を全部 _ に
function sanitize(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) // 長すぎるとパス制限にかかる
}

function formatTranscriptText(
  transcript: TranscriptEntry[],
  lang: 'ja' | 'en' = 'ja',
): string {
  const selfLabel = lang === 'en' ? 'You' : '自分'
  const otherLabel = lang === 'en' ? 'Them' : '相手'
  return transcript
    .map((t) => {
      const who =
        t.speaker === 'self'
          ? selfLabel
          : t.speaker === 'other'
            ? otherLabel
            : '---'
      const time = new Date(t.timestamp).toISOString()
      return `[${time}] [${who}] ${t.text}`
    })
    .join('\n')
}

function writeImage(
  dataUrl: string,
  folder: string,
  idx: number,
): string | null {
  const m = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/)
  if (!m) return null
  const ext = m[1] === 'jpg' ? 'jpeg' : m[1]
  const fileName = `slide-${pad2(idx + 1)}.${ext}`
  const full = path.join(folder, fileName)
  fs.writeFileSync(full, Buffer.from(m[2], 'base64'))
  return fileName
}

export function archiveMeeting(payload: ArchivePayload): ArchiveResult {
  const parent = baseArchiveDir()
  fs.mkdirSync(parent, { recursive: true })

  const stamp = formatLocalTimestamp(payload.startedAt || Date.now())
  const titlePart = sanitize(payload.title || '会議')
  const folderName = `${stamp} ${titlePart}`
  let folder = path.join(parent, folderName)

  // 万が一衝突（同分に2件）したらサフィックス追加
  let suffix = 0
  while (fs.existsSync(folder)) {
    suffix++
    folder = path.join(parent, `${folderName} (${suffix})`)
  }
  fs.mkdirSync(folder, { recursive: true })

  const files: string[] = []
  const lang = payload.language ?? 'ja'

  // summary.md
  const summaryHeader =
    lang === 'en'
      ? `# ${payload.title || 'Meeting'}\n\n- Date: ${new Date(payload.startedAt).toISOString()}\n- Duration: ${Math.round((payload.endedAt - payload.startedAt) / 60000)} min\n\n---\n\n`
      : `# ${payload.title || '会議'}\n\n- 日時: ${new Date(payload.startedAt).toLocaleString('ja-JP')}\n- 所要: ${Math.round((payload.endedAt - payload.startedAt) / 60000)} 分\n\n---\n\n`
  const summaryBody = payload.summaryMarkdown || (lang === 'en' ? '_(no summary generated)_' : '_(要約未生成)_')
  fs.writeFileSync(path.join(folder, 'summary.md'), summaryHeader + summaryBody, 'utf-8')
  files.push('summary.md')

  // transcript.txt
  fs.writeFileSync(
    path.join(folder, 'transcript.txt'),
    formatTranscriptText(payload.transcript, lang),
    'utf-8',
  )
  files.push('transcript.txt')

  // images/
  if (payload.imageDataUrls.length > 0) {
    const imgDir = path.join(folder, 'images')
    fs.mkdirSync(imgDir, { recursive: true })
    payload.imageDataUrls.forEach((url, i) => {
      const name = writeImage(url, imgDir, i)
      if (name) files.push(`images/${name}`)
    })
  }

  // meeting.json（メタ情報、再インポートや他ツール連携用）
  const meta = {
    id: payload.id,
    title: payload.title,
    startedAt: payload.startedAt,
    endedAt: payload.endedAt,
    durationMs: Math.max(0, payload.endedAt - payload.startedAt),
    language: lang,
    transcriptEntries: payload.transcript.length,
    imageCount: payload.imageDataUrls.length,
    companyProfile: payload.companyProfile ?? '',
  }
  fs.writeFileSync(
    path.join(folder, 'meeting.json'),
    JSON.stringify(meta, null, 2),
    'utf-8',
  )
  files.push('meeting.json')

  return { folderPath: folder, files }
}

export function archiveBaseDir(): string {
  return baseArchiveDir()
}
