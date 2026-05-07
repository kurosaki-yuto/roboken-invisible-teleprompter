export interface CaptureBounds {
  x: number
  y: number
  width: number
  height: number
}

export type Language = 'ja' | 'en'
export type AiProvider = 'gemini' | 'claude'

export interface ApiKeys {
  geminiApiKey: string
  anthropicApiKey?: string
  deepgramApiKey?: string
  aiProvider: AiProvider
  // true = .env など運用者側で仕込まれた値。UI から上書き可。
  fromEnv?: boolean
  language: Language
  autoCoach: boolean
  companyProfile: string
}

export interface SettingsInput {
  geminiApiKey?: string
  anthropicApiKey?: string
  deepgramApiKey?: string
  aiProvider?: AiProvider
  language?: Language
  autoCoach?: boolean
  companyProfile?: string
}

export interface TranscriptEntry {
  text: string
  speaker: 'self' | 'other' | 'unknown'
  timestamp: number
}

export interface PushToThinkResult {
  patterns: Array<{
    id: 'counter' | 'agree_propose' | 'question_back'
    label: string // ローカライズ済みラベル（ja: 論破/同調＋提案/質問返し, en: Counter/Agree+Propose/Ask Back）
    text: string // 20文字前後
  }>
  generatedAt: number
  // fast = 即時（軽量プロンプト、thinking=0）／deep = 本命（要約＋thinking=2048）
  kind?: 'fast' | 'deep'
  // ストリーミング途中の部分結果。true のうちは追加の更新が来る。
  partial?: boolean
}

export interface MeetingSummary {
  id: number
  title: string
  date: string
  durationMs: number
  transcript: string
  summaryMarkdown: string
  imagePaths: string[]
  folderPath: string // ~/Documents/Mienaq/... のアーカイブフォルダパス（空文字なら archive 失敗）
}

export interface ElectronAPI {
  // Lifecycle
  startSelection: () => void
  finishSelection: (bounds: CaptureBounds) => void
  cancelSelection: () => void
  endMeeting: () => void
  hideTeleprompter: () => void

  // Keys
  getApiKeys: () => Promise<ApiKeys>
  setApiKeys: (settings: SettingsInput) => Promise<ApiKeys>
  testApiKey: (geminiApiKey: string) => Promise<{ ok: boolean; error?: string }>
  testAnthropicKey: (
    anthropicApiKey: string,
  ) => Promise<{ ok: boolean; error?: string }>

  // Region screenshot
  captureRegion: (bounds: CaptureBounds) => Promise<string> // dataURL

  // AI
  pushToThink: (args: {
    transcript: TranscriptEntry[]
    imageDataUrl: string | null
    context: string
  }) => Promise<PushToThinkResult>

  // AI (fast path: 即時応答用、要約なし thinking=0)
  pushToThinkFast: (args: {
    transcript: TranscriptEntry[]
    imageDataUrl: string | null
    context: string
  }) => Promise<PushToThinkResult>

  // Summary / DB
  saveMeeting: (args: {
    title: string
    startedAt: number
    endedAt: number
    transcript: TranscriptEntry[]
    images: string[] // dataURLs
  }) => Promise<MeetingSummary>

  listMeetings: () => Promise<MeetingSummary[]>
  getMeeting: (id: number) => Promise<MeetingSummary | null>

  // アーカイブフォルダ操作
  openArchiveFolder: () => Promise<string>
  revealInFolder: (path: string) => Promise<void>

  // Audio loopback (from electron-audio-loopback)
  enableLoopbackAudio: () => Promise<void>
  disableLoopbackAudio: () => Promise<void>

  // License (Stripe月額20ドルサブスク)
  getLicense: () => Promise<LicenseStateView>
  activateLicense: (licenseKey: string) => Promise<LicenseStateView>
  deactivateLicense: () => Promise<LicenseStateView>
  refreshLicense: () => Promise<LicenseStateView>
  setInternalBypass: (enabled: boolean) => Promise<LicenseStateView>

  // Listeners
  onSelectionBounds: (cb: (bounds: CaptureBounds) => void) => () => void
  onTriggerThink: (cb: () => void) => () => void
  onTranscript: (cb: (entry: TranscriptEntry) => void) => () => void
  onPatternsUpdated: (cb: (result: PushToThinkResult) => void) => () => void
  onLicenseChanged: (cb: (state: LicenseStateView) => void) => () => void
}

export interface LicenseStateView {
  status: 'inactive' | 'active' | 'past_due' | 'canceled' | 'trialing' | 'unknown'
  hasKey: boolean
  customerId?: string
  subscriptionId?: string
  currentPeriodEnd?: number
  lastVerifiedAt?: number
  internalBypass?: boolean
  featureAllowed: boolean
}

export const IPC = {
  START_SELECTION: 'start-selection',
  FINISH_SELECTION: 'finish-selection',
  CANCEL_SELECTION: 'cancel-selection',
  END_MEETING: 'end-meeting',
  HIDE_TELEPROMPTER: 'hide-teleprompter',
  GET_API_KEYS: 'get-api-keys',
  SET_API_KEYS: 'set-api-keys',
  TEST_API_KEY: 'test-api-key',
  TEST_ANTHROPIC_KEY: 'test-anthropic-key',
  CAPTURE_REGION: 'capture-region',
  PUSH_TO_THINK: 'push-to-think',
  PUSH_TO_THINK_FAST: 'push-to-think-fast',
  SAVE_MEETING: 'save-meeting',
  LIST_MEETINGS: 'list-meetings',
  GET_MEETING: 'get-meeting',
  OPEN_ARCHIVE_FOLDER: 'open-archive-folder',
  REVEAL_IN_FOLDER: 'reveal-in-folder',
  ENABLE_LOOPBACK: 'enable-loopback-audio',
  DISABLE_LOOPBACK: 'disable-loopback-audio',
  // license
  GET_LICENSE: 'get-license',
  ACTIVATE_LICENSE: 'activate-license',
  DEACTIVATE_LICENSE: 'deactivate-license',
  REFRESH_LICENSE: 'refresh-license',
  SET_INTERNAL_BYPASS: 'set-internal-bypass',
  // events (main → renderer)
  EV_SELECTION_BOUNDS: 'ev:selection-bounds',
  EV_TRIGGER_THINK: 'ev:trigger-think',
  EV_TRANSCRIPT: 'ev:transcript',
  EV_PATTERNS: 'ev:patterns-updated',
  EV_LICENSE_CHANGED: 'ev:license-changed',
} as const
