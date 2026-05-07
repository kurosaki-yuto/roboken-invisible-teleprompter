import { app, safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'

// Mienaq ライセンス検証モジュール（Stripe月額20ドルサブスク）
//
// 現状: スタブ実装。Stripeアカウント・Customer Portal・検証エンドポイントが
// ロボケン側で準備中のため、実APIキー受領後に LICENSE_API_BASE と
// PRICE_ID を差し替えて本番化する。
//
// 内輪用: 環境変数 MIENAQ_INTERNAL=1 または settings.internalLicense=true で
// ライセンスチェックをスキップする（社内・パートナー向け）。

const LICENSE_PREFIX = 'enc:lic:v1:'

export interface LicenseState {
  status: 'inactive' | 'active' | 'past_due' | 'canceled' | 'trialing' | 'unknown'
  licenseKey?: string
  customerId?: string
  subscriptionId?: string
  currentPeriodEnd?: number // unix秒
  lastVerifiedAt?: number // unix秒
  internalBypass?: boolean
}

function licensePath(): string {
  return path.join(app.getPath('userData'), 'license.json')
}

function readRaw(): LicenseState {
  try {
    const raw = JSON.parse(fs.readFileSync(licensePath(), 'utf-8')) as LicenseState
    if (raw.licenseKey && raw.licenseKey.startsWith(LICENSE_PREFIX) && safeStorage.isEncryptionAvailable()) {
      const buf = Buffer.from(raw.licenseKey.slice(LICENSE_PREFIX.length), 'base64')
      raw.licenseKey = safeStorage.decryptString(buf)
    }
    return raw
  } catch {
    return { status: 'inactive' }
  }
}

function writeRaw(state: LicenseState): void {
  fs.mkdirSync(path.dirname(licensePath()), { recursive: true })
  const toWrite: LicenseState = { ...state }
  if (toWrite.licenseKey && safeStorage.isEncryptionAvailable()) {
    const enc = safeStorage.encryptString(toWrite.licenseKey).toString('base64')
    toWrite.licenseKey = `${LICENSE_PREFIX}${enc}`
  }
  fs.writeFileSync(licensePath(), JSON.stringify(toWrite, null, 2), 'utf-8')
}

function isInternalBypass(): boolean {
  if (process.env.MIENAQ_INTERNAL === '1') return true
  const state = readRaw()
  return state.internalBypass === true
}

export function getLicenseState(): LicenseState {
  if (isInternalBypass()) {
    return { status: 'active', internalBypass: true, lastVerifiedAt: Math.floor(Date.now() / 1000) }
  }
  return readRaw()
}

export function setInternalBypass(enabled: boolean): LicenseState {
  const state = readRaw()
  state.internalBypass = enabled
  writeRaw(state)
  return getLicenseState()
}

// ライセンスキーを保存し、サーバ側で検証を試みる。
// 検証エンドポイントが未準備の場合、暫定で「保存はするがstatusはunknown」にする。
export async function activateLicense(licenseKey: string): Promise<LicenseState> {
  const trimmed = licenseKey.trim()
  if (!trimmed) {
    throw new Error('ライセンスキーを入力してください')
  }

  const state = readRaw()
  state.licenseKey = trimmed

  const apiBase = process.env.MIENAQ_LICENSE_API_BASE || ''
  if (!apiBase) {
    // バックエンド未準備。暫定でローカル保存のみ。
    state.status = 'unknown'
    state.lastVerifiedAt = Math.floor(Date.now() / 1000)
    writeRaw(state)
    return state
  }

  try {
    const res = await fetch(`${apiBase}/license/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: trimmed }),
    })
    if (!res.ok) {
      throw new Error(`activate failed: ${res.status}`)
    }
    const json = (await res.json()) as Partial<LicenseState>
    state.status = json.status ?? 'unknown'
    state.customerId = json.customerId
    state.subscriptionId = json.subscriptionId
    state.currentPeriodEnd = json.currentPeriodEnd
    state.lastVerifiedAt = Math.floor(Date.now() / 1000)
    writeRaw(state)
    return state
  } catch (e) {
    console.error('[license] activate error:', e)
    state.status = 'inactive'
    writeRaw(state)
    throw e
  }
}

// 起動時に呼ぶ。期限切れチェックなど。
// 失敗してもアプリは止めない（オフライン猶予）。
export async function refreshLicense(): Promise<LicenseState> {
  if (isInternalBypass()) return getLicenseState()

  const state = readRaw()
  if (!state.licenseKey) return state

  const apiBase = process.env.MIENAQ_LICENSE_API_BASE || ''
  if (!apiBase) return state

  try {
    const res = await fetch(`${apiBase}/license/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: state.licenseKey }),
    })
    if (!res.ok) return state
    const json = (await res.json()) as Partial<LicenseState>
    state.status = json.status ?? state.status
    state.currentPeriodEnd = json.currentPeriodEnd ?? state.currentPeriodEnd
    state.lastVerifiedAt = Math.floor(Date.now() / 1000)
    writeRaw(state)
    return state
  } catch (e) {
    console.warn('[license] refresh failed, using cached state:', e)
    return state
  }
}

// 機能ゲート判定。trialing / active / internalBypass のときのみ true。
// past_due はオフライン猶予として N 日間は許容。
export function isFeatureAllowed(): boolean {
  const state = getLicenseState()
  if (state.internalBypass) return true
  if (state.status === 'active' || state.status === 'trialing') return true
  if (state.status === 'past_due') {
    const grace = 7 * 24 * 60 * 60 // 7日
    const now = Math.floor(Date.now() / 1000)
    return !!state.currentPeriodEnd && state.currentPeriodEnd + grace > now
  }
  return false
}

export async function deactivateLicense(): Promise<void> {
  const state = readRaw()
  state.licenseKey = undefined
  state.status = 'inactive'
  state.customerId = undefined
  state.subscriptionId = undefined
  state.currentPeriodEnd = undefined
  writeRaw(state)
}
