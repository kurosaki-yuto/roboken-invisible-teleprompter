import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

// Prisma v7: requires driver adapter; PrismaLibSql takes a config (not a pre-created client)
const dbPath = path.join(app.getPath('userData'), 'meetings.db')
const adapter = new PrismaLibSql({ url: `file:${dbPath}` })
const prisma = new PrismaClient({ adapter })

interface SaveMeetingOptions {
  transcript: string
  imageDataUrls: string[]
  imagesDir: string
  durationSeconds?: number
}

interface MeetingRecord {
  id: number
  title: string
  date: Date
  durationSeconds: number
  summary: string
  totalTranscript: string
}

/** 全議事録を返す（一覧画面用）*/
export async function getAllMeetings(): Promise<MeetingRecord[]> {
  return prisma.meeting.findMany({
    orderBy: { date: 'desc' },
    select: {
      id: true,
      title: true,
      date: true,
      durationSeconds: true,
      summary: true,
      totalTranscript: true
    }
  })
}

/** 特定の議事録を詳細付きで返す */
export async function getMeeting(id: number): Promise<unknown> {
  return prisma.meeting.findUnique({
    where: { id },
    include: { images: { orderBy: { timestamp: 'asc' } } }
  })
}

/** 設定値を取得する（存在しない場合は空文字を返す） */
export async function getSetting(key: string): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row?.value ?? ''
}

/** 設定値を保存する */
export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value }
  })
}

/** アプリ起動時に Setting テーブルが存在しない旧 DB を安全にアップグレード */
export async function runMigrations(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Setting" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "value" TEXT NOT NULL DEFAULT ''
    )
  `)
}

/** 会議終了時に AI 要約を生成して SQLite に保存 */
export async function saveMeeting({
  transcript,
  imageDataUrls,
  imagesDir,
  durationSeconds
}: SaveMeetingOptions): Promise<unknown> {
  const apiKey = (import.meta as unknown as { env: Record<string, string> }).env[
    'VITE_GEMINI_API_KEY'
  ]
  let summary = ''

  if (apiKey && transcript.trim().length > 0) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const prompt = `以下の商談会話ログを構造化した議事録にしてください。
マークダウン形式で、以下のセクションを含めてください：
- **決定事項**
- **相手の主な懸念点**
- **次回のアクション（ToDoリスト形式）**
- **会話サマリー**

【会話ログ】
${transcript.slice(0, 10000)}`

      const result = await model.generateContent(prompt)
      summary = result.response.text()
    } catch (err) {
      console.error('[meetingService] AI summary error:', err)
      summary = `（要約生成に失敗しました）\n\n${transcript.slice(0, 500)}`
    }
  } else {
    summary = transcript.slice(0, 500)
  }

  // 会議タイトルを日時から生成
  const now = new Date()
  const title = `商談 ${now.getFullYear()}/${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`

  // 画像を保存してパスを収集
  const imagePaths: { path: string; timestamp: Date }[] = []
  if (imageDataUrls.length > 0) {
    fs.mkdirSync(imagesDir, { recursive: true })
    for (let i = 0; i < imageDataUrls.length; i++) {
      const dataUrl = imageDataUrls[i]
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const filename = `slide_${Date.now()}_${i}.png`
      const filepath = path.join(imagesDir, filename)
      fs.writeFileSync(filepath, Buffer.from(base64, 'base64'))
      imagePaths.push({ path: filepath, timestamp: new Date() })
    }
  }

  const meeting = await prisma.meeting.create({
    data: {
      title,
      totalTranscript: transcript,
      summary,
      durationSeconds: durationSeconds ?? 0,
      images: {
        create: imagePaths.map((img) => ({
          imagePath: img.path,
          timestamp: img.timestamp
        }))
      }
    },
    include: { images: true }
  })

  console.log('[meetingService] Meeting saved:', meeting.id)
  return meeting
}
