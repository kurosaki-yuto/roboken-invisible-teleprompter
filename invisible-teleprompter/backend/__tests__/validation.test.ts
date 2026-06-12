import {
  MAX_SEAT_COUNT,
  validateSeatCount,
  normalizeSeatCount,
  parseSeatCountMetadata,
  deriveLicenseStatus,
  genLicenseKey,
  genInviteToken,
  genPendingLicenseKey,
  extractBearerLicenseKey,
} from '../lib/validation'

describe('validateSeatCount', () => {
  it('accepts a valid positive integer', () => {
    expect(validateSeatCount(5)).toEqual({ ok: true, value: 5 })
  })

  it('accepts a numeric string', () => {
    expect(validateSeatCount('3')).toEqual({ ok: true, value: 3 })
  })

  it('accepts the lower bound (1)', () => {
    expect(validateSeatCount(1).ok).toBe(true)
  })

  it('accepts the upper bound (MAX_SEAT_COUNT)', () => {
    expect(validateSeatCount(MAX_SEAT_COUNT).ok).toBe(true)
  })

  it('rejects zero', () => {
    expect(validateSeatCount(0).ok).toBe(false)
  })

  it('rejects negatives', () => {
    expect(validateSeatCount(-1).ok).toBe(false)
  })

  it('rejects non-integers', () => {
    const r = validateSeatCount(2.5)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/integer/)
  })

  it('rejects NaN / non-numeric strings', () => {
    expect(validateSeatCount('abc').ok).toBe(false)
    expect(validateSeatCount(NaN).ok).toBe(false)
    expect(validateSeatCount(undefined).ok).toBe(false)
    expect(validateSeatCount(null).ok).toBe(false)
  })

  it('rejects values over the maximum', () => {
    expect(validateSeatCount(MAX_SEAT_COUNT + 1).ok).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(validateSeatCount(Infinity).ok).toBe(false)
  })
})

describe('normalizeSeatCount', () => {
  it('passes through a valid integer', () => {
    expect(normalizeSeatCount(7)).toBe(7)
  })

  it('floors decimals', () => {
    expect(normalizeSeatCount(3.9)).toBe(3)
  })

  it('clamps below 1 up to 1', () => {
    expect(normalizeSeatCount(0)).toBe(1)
    expect(normalizeSeatCount(-5)).toBe(1)
    expect(normalizeSeatCount(0.4)).toBe(1)
  })

  it('clamps NaN / undefined / non-numeric to 1 (the bug the old Math.max(1, Math.floor(x)) missed)', () => {
    expect(normalizeSeatCount(NaN)).toBe(1)
    expect(normalizeSeatCount(undefined)).toBe(1)
    expect(normalizeSeatCount('abc')).toBe(1)
    expect(normalizeSeatCount(Infinity)).toBe(1)
  })

  it('clamps above the maximum down to MAX_SEAT_COUNT', () => {
    expect(normalizeSeatCount(MAX_SEAT_COUNT + 100)).toBe(MAX_SEAT_COUNT)
  })

  it('parses numeric strings', () => {
    expect(normalizeSeatCount('12')).toBe(12)
  })
})

describe('parseSeatCountMetadata', () => {
  it('parses a valid string', () => {
    expect(parseSeatCountMetadata('4')).toBe(4)
  })

  it('defaults to 1 for null / undefined', () => {
    expect(parseSeatCountMetadata(null)).toBe(1)
    expect(parseSeatCountMetadata(undefined)).toBe(1)
  })

  it('defaults to 1 for empty / non-numeric / zero / negative', () => {
    expect(parseSeatCountMetadata('')).toBe(1)
    expect(parseSeatCountMetadata('abc')).toBe(1)
    expect(parseSeatCountMetadata('0')).toBe(1)
    expect(parseSeatCountMetadata('-3')).toBe(1)
  })

  it('clamps over the maximum', () => {
    expect(parseSeatCountMetadata(String(MAX_SEAT_COUNT + 50))).toBe(MAX_SEAT_COUNT)
  })

  it('parses leading-numeric strings like parseInt does', () => {
    expect(parseSeatCountMetadata('5seats')).toBe(5)
  })
})

describe('deriveLicenseStatus', () => {
  it('is active only when both team and seat are active', () => {
    expect(deriveLicenseStatus('active', 'active')).toBe('active')
  })

  it('is inactive when team is not active', () => {
    expect(deriveLicenseStatus('past_due', 'active')).toBe('inactive')
    expect(deriveLicenseStatus('canceled', 'active')).toBe('inactive')
  })

  it('is inactive when seat is not active', () => {
    expect(deriveLicenseStatus('active', 'pending')).toBe('inactive')
    expect(deriveLicenseStatus('active', 'revoked')).toBe('inactive')
  })

  it('is inactive for undefined inputs', () => {
    expect(deriveLicenseStatus(undefined, undefined)).toBe('inactive')
  })
})

describe('key/token generators', () => {
  it('genLicenseKey has the mienaq_ prefix and 32 hex chars', () => {
    expect(genLicenseKey()).toMatch(/^mienaq_[0-9a-f]{32}$/)
  })

  it('genInviteToken has the inv_ prefix and 32 hex chars', () => {
    expect(genInviteToken()).toMatch(/^inv_[0-9a-f]{32}$/)
  })

  it('genPendingLicenseKey has the pending_ prefix and 32 hex chars', () => {
    expect(genPendingLicenseKey()).toMatch(/^pending_[0-9a-f]{32}$/)
  })

  it('generates unique values', () => {
    const keys = new Set(Array.from({ length: 100 }, () => genLicenseKey()))
    expect(keys.size).toBe(100)
  })
})

describe('extractBearerLicenseKey', () => {
  it('strips the Bearer prefix', () => {
    expect(extractBearerLicenseKey('Bearer mienaq_abc')).toBe('mienaq_abc')
  })

  it('is case-insensitive on the scheme', () => {
    expect(extractBearerLicenseKey('bearer mienaq_abc')).toBe('mienaq_abc')
  })

  it('accepts a raw key without the scheme', () => {
    expect(extractBearerLicenseKey('mienaq_abc')).toBe('mienaq_abc')
  })

  it('returns null for missing / empty / whitespace-only headers', () => {
    expect(extractBearerLicenseKey(undefined)).toBeNull()
    expect(extractBearerLicenseKey(null)).toBeNull()
    expect(extractBearerLicenseKey('')).toBeNull()
    expect(extractBearerLicenseKey('Bearer ')).toBeNull()
    expect(extractBearerLicenseKey('   ')).toBeNull()
  })
})
