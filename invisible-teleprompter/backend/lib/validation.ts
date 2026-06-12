// 純粋ロジック層: AWS/Stripe クライアントに依存しない検証・正規化・導出関数。
// ハンドラ/クライアント呼び出しから共通利用し、ユニットテストの対象とする。

import { randomUUID } from 'crypto'

// シート数の上限。Stripe quantity の暴発や入力ミスによる過大課金を防ぐためのガード。
export const MAX_SEAT_COUNT = 1000

export interface SeatCountResult {
  ok: boolean
  value: number
  error?: string
}

// 外部入力 (LP フォーム / JSON body) のシート数を検証する。
// 整数・1以上・上限以内のみ許可し、NaN / 小数 / 過大値を弾く。
export function validateSeatCount(input: unknown): SeatCountResult {
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n)) {
    return { ok: false, value: 0, error: 'seatCount must be a finite number' }
  }
  if (!Number.isInteger(n)) {
    return { ok: false, value: 0, error: 'seatCount must be an integer' }
  }
  if (n < 1) {
    return { ok: false, value: 0, error: 'seatCount must be >= 1' }
  }
  if (n > MAX_SEAT_COUNT) {
    return { ok: false, value: 0, error: `seatCount must be <= ${MAX_SEAT_COUNT}` }
  }
  return { ok: true, value: n }
}

// Stripe Checkout に渡す quantity を必ず安全な整数に正規化する。
// 不正値 (NaN / 0 / 負 / 小数 / 過大) は安全側 (1, 上限) にクランプする。
// 旧実装の Math.max(1, Math.floor(x)) は NaN を弾けなかったため、その穴を塞ぐ。
export function normalizeSeatCount(input: unknown): number {
  const n = typeof input === 'number' ? input : Number(input)
  if (!Number.isFinite(n)) return 1
  const floored = Math.floor(n)
  if (floored < 1) return 1
  if (floored > MAX_SEAT_COUNT) return MAX_SEAT_COUNT
  return floored
}

// Stripe metadata.seat_count (文字列) を安全に整数化する。
// webhook で席数を読み損ねて 0 席や NaN 席のチームを作らないためのガード。
export function parseSeatCountMetadata(raw: string | undefined | null): number {
  if (raw == null) return 1
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return 1
  if (n > MAX_SEAT_COUNT) return MAX_SEAT_COUNT
  return n
}

// チーム状態 + シート状態からアプリ側に返す稼働状態を導出する。
// 複数ハンドラに散らばっていた `team.status === 'active' && seat.status === 'active'`
// を一箇所に集約し、判定漏れ/不一致を防ぐ。
export function deriveLicenseStatus(
  teamStatus: string | undefined,
  seatStatus: string | undefined,
): 'active' | 'inactive' {
  return teamStatus === 'active' && seatStatus === 'active' ? 'active' : 'inactive'
}

const LICENSE_PREFIX = 'mienaq_'
const INVITE_PREFIX = 'inv_'
const PENDING_PREFIX = 'pending_'

function hex32(): string {
  return randomUUID().replace(/-/g, '')
}

export function genLicenseKey(): string {
  return `${LICENSE_PREFIX}${hex32()}`
}

export function genInviteToken(): string {
  return `${INVITE_PREFIX}${hex32()}`
}

export function genPendingLicenseKey(): string {
  return `${PENDING_PREFIX}${hex32()}`
}

// Authorization ヘッダから Bearer ライセンスキーを安全に抽出する。
// 値が無い / 形式不正なら null を返し、ハンドラ側で 401 を返せるようにする。
export function extractBearerLicenseKey(
  authHeader: string | undefined | null,
): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null
  const key = authHeader.replace(/^Bearer\s+/i, '').trim()
  return key.length > 0 ? key : null
}
