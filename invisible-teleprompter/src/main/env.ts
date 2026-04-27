import fs from 'fs'
import path from 'path'
import { app } from 'electron'

// 開発時の利便性のため、プロジェクトルートの .env を読み込む。
// 配布ビルドでは隣接プロジェクトの .env は読まない。ユーザーは必ず Settings 画面で入力する。
export function loadEnv(): Record<string, string> {
  const candidates = [
    app.isPackaged
      ? path.join(path.dirname(process.execPath), '.env')
      : path.join(process.cwd(), '.env'),
  ]
  const env: Record<string, string> = {}
  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, 'utf-8')
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*(\w+)\s*=\s*(.+)\s*$/)
        if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    } catch {
      // ignore
    }
  }
  return env
}
