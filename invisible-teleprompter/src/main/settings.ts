import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'

// userData/settings.json にユーザー設定を永続化する。
// API キーは macOS Keychain / Windows DPAPI 経由で暗号化（Electron safeStorage）。
// 既存のプレーンテキスト設定は次回保存時に自動で再暗号化される（後方互換）。

export type Language = 'ja' | 'en'
export type AiProvider = 'gemini' | 'claude'

export interface AppSettings {
  geminiApiKey?: string
  anthropicApiKey?: string
  deepgramApiKey?: string
  aiProvider?: AiProvider
  language?: Language
  autoCoach?: boolean
  companyProfile?: string
}

// 暗号化済み値の prefix。プレーンテキストとの判別に使う。
const ENC_PREFIX = 'enc:v1:'
const SECRET_KEYS = [
  'geminiApiKey',
  'anthropicApiKey',
  'deepgramApiKey',
] as const

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function encryptValue(plain: string): string {
  if (!plain) return plain
  if (!safeStorage.isEncryptionAvailable()) return plain
  const enc = safeStorage.encryptString(plain).toString('base64')
  return `${ENC_PREFIX}${enc}`
}

function decryptValue(stored: string): string {
  if (typeof stored !== 'string') return stored
  if (!stored.startsWith(ENC_PREFIX)) return stored // 旧プレーンテキスト互換
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[settings] safeStorage unavailable; cannot decrypt stored key')
    return ''
  }
  try {
    const buf = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
    return safeStorage.decryptString(buf)
  } catch (e) {
    console.error('[settings] decrypt failed:', e)
    return ''
  }
}

export function loadSettings(): AppSettings {
  let raw: AppSettings
  try {
    raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8')) as AppSettings
  } catch {
    return {}
  }
  const out: AppSettings = { ...raw }
  for (const k of SECRET_KEYS) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v === 'string') (out as Record<string, unknown>)[k] = decryptValue(v)
  }
  return out
}

export function saveSettings(patch: Partial<AppSettings>): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  // loadSettings は既に復号済みで返すので、patch をプレーン値でマージ
  const existing = loadSettings()
  const merged: AppSettings = { ...existing }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (merged as Record<string, unknown>)[k] = v
  }
  // 書き出し時にシークレットだけ暗号化（旧 plaintext もこのタイミングで自動マイグレ）
  const toWrite: AppSettings = { ...merged }
  for (const k of SECRET_KEYS) {
    const v = (merged as Record<string, unknown>)[k]
    if (typeof v === 'string' && v.length > 0) {
      ;(toWrite as Record<string, unknown>)[k] = encryptValue(v)
    }
  }
  fs.writeFileSync(settingsPath(), JSON.stringify(toWrite, null, 2), 'utf-8')
}
