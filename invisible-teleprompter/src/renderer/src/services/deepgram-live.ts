import type { Language, TranscriptEntry } from '../../../types/ipc'

// 言語モード外の文字（ハングル/タイ/アラビア/キリル/ギリシャ等）が混ざったら誤認識として破棄
const NON_JA_EN_SCRIPTS = /[Ͱ-ϿЀ-ӿԀ-ԯ԰-֏֐-׿؀-ۿऀ-ॿঀ-৿฀-๿가-힯]/
const NON_EN_SCRIPTS = /[぀-ゟ゠-ヿ一-鿿가-힯Ѐ-ӿ฀-๿]/
// 句読点・記号・空白だけ／1文字以下の出力はノイズとみなす
const SYMBOLS_ONLY = /^[\s\p{P}\p{S}]+$/u

function isLikelyMisrecognition(text: string, lang: Language): boolean {
  if (text.length <= 1) return true
  if (SYMBOLS_ONLY.test(text)) return true
  if (lang === 'ja') return NON_JA_EN_SCRIPTS.test(text)
  return NON_EN_SCRIPTS.test(text)
}

interface DeepgramLiveOptions {
  apiKey: string
  speaker: 'self' | 'other' | 'unknown'
  language?: Language
  onTranscript: (entry: TranscriptEntry) => void
  onError: (error: Error) => void
  onConnected: () => void
  onDisconnected: () => void
}

/**
 * Deepgram Nova-3 リアルタイム文字起こしサービス。
 * 純粋 ASR 特化なので Gemini Live より認識精度が高い（特に日本語固有名詞・数値）。
 * WebSocket で 16kHz PCM mono を送信。
 */
export class DeepgramLiveService {
  private ws: WebSocket | null = null
  private options: DeepgramLiveOptions
  private isRunning = false
  private sentChunks = 0
  private recvMsgs = 0
  private statsTimer: ReturnType<typeof setInterval> | null = null
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: DeepgramLiveOptions) {
    this.options = options
  }

  async connect(): Promise<void> {
    const lang = this.options.language ?? 'ja'
    // nova-3 は日本語対応。language=multi にすると英日混合にも強い。
    const params = new URLSearchParams({
      model: 'nova-3',
      language: lang === 'en' ? 'en-US' : 'ja',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      smart_format: 'true',
      punctuate: 'true',
      interim_results: 'true',
      endpointing: '400', // 400ms の無音で utterance 境界
      vad_events: 'true',
    })
    const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`
    console.log(`[dg:${this.options.speaker}] connecting…`)

    return new Promise<void>((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('Deepgram connect timeout (8s)'))
      }, 8000)

      try {
        // Deepgram はサブプロトコルで ['token', apiKey] を渡すとブラウザからも認証できる
        this.ws = new WebSocket(url, ['token', this.options.apiKey])
        this.ws.binaryType = 'arraybuffer'
      } catch (e) {
        clearTimeout(timer)
        reject(e as Error)
        return
      }

      this.ws.onopen = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        console.log(`[dg:${this.options.speaker}] open`)
        this.isRunning = true
        this.options.onConnected()
        // 統計ログ
        if (this.statsTimer) clearInterval(this.statsTimer)
        this.statsTimer = setInterval(() => {
          console.log(
            `[dg:${this.options.speaker}] stats sent=${this.sentChunks}chunks recv=${this.recvMsgs}msgs`,
          )
        }, 5000)
        // 12秒ごとに KeepAlive 送信（Deepgram はアイドルで切れる仕様）
        if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
        this.keepaliveTimer = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
              this.ws.send(JSON.stringify({ type: 'KeepAlive' }))
            } catch {
              // noop
            }
          }
        }, 12000)
        resolve()
      }

      this.ws.onmessage = (ev: MessageEvent) => this.handleMessage(ev)

      this.ws.onerror = (ev: Event) => {
        console.error(`[dg:${this.options.speaker}] error`, ev)
        const err = new Error('Deepgram WebSocket error')
        if (!settled) {
          settled = true
          clearTimeout(timer)
          reject(err)
        }
        this.options.onError(err)
      }

      this.ws.onclose = (ev: CloseEvent) => {
        console.warn(
          `[dg:${this.options.speaker}] close code=${ev.code} reason=${ev.reason}`,
        )
        this.isRunning = false
        if (this.keepaliveTimer) {
          clearInterval(this.keepaliveTimer)
          this.keepaliveTimer = null
        }
        this.options.onDisconnected()
      }
    })
  }

  private handleMessage(ev: MessageEvent): void {
    this.recvMsgs++
    try {
      const raw = typeof ev.data === 'string' ? ev.data : null
      if (!raw) return
      const msg = JSON.parse(raw)
      if (this.recvMsgs <= 3) {
        console.log(
          `[dg:${this.options.speaker}] msg#${this.recvMsgs}:`,
          JSON.stringify(msg).slice(0, 400),
        )
      }
      if (msg.type === 'Results') {
        const alt = msg.channel?.alternatives?.[0]
        const text: string | undefined = alt?.transcript
        if (!text) return
        // interim は無視、is_final だけ確定として出す
        if (msg.is_final) {
          const trimmed = text.trim()
          if (!trimmed) return
          const lang: Language = this.options.language ?? 'ja'
          if (isLikelyMisrecognition(trimmed, lang)) {
            console.warn(
              `[dg:${this.options.speaker}] dropped misrecognized text (${lang}):`,
              trimmed,
            )
            return
          }
          console.log(`[dg:${this.options.speaker}] final:`, trimmed)
          this.options.onTranscript({
            text: trimmed,
            speaker: this.options.speaker,
            timestamp: Date.now(),
          })
        }
      }
    } catch (e) {
      console.error(`[dg:${this.options.speaker}] parse error`, e)
    }
  }

  sendAudio(buf: ArrayBuffer): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(buf)
      this.sentChunks++
    } catch (e) {
      console.error(`[dg:${this.options.speaker}] send failed`, e)
    }
  }

  async disconnect(): Promise<void> {
    this.isRunning = false
    if (this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'CloseStream' }))
        }
        this.ws.close()
      } catch {
        // ignore
      }
      this.ws = null
    }
  }

  get connected(): boolean {
    return this.isRunning
  }
}
