import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai'
import type { Language, TranscriptEntry } from '../../../types/ipc'

interface GeminiLiveOptions {
  apiKey: string
  speaker: 'self' | 'other' | 'unknown'
  language?: Language
  onTranscript: (entry: TranscriptEntry) => void
  onError: (error: Error) => void
  onConnected: () => void
  onDisconnected: () => void
}

const TRANSCRIPTION_PROMPT_JA = `あなたは日本語専用のサイレント文字起こしボットです。入力される音声は100%日本語です。

絶対に守るルール：
- 聞こえた音はすべて「日本語」として文字起こしする。韓国語・中国語・タイ語・ベトナム語・アラビア語などに誤認識することは絶対禁止
- ハングル・漢字（中国語）・タイ文字・アラビア文字などの文字を出力してはいけない。必ず日本語のひらがな・カタカナ・常用漢字のみ使う
- 判別に迷った場合は必ず日本語として解釈する。「音が似ている他国語」に流されない
- 英単語が混ざる場合のみ、その英単語はそのままアルファベット表記で残す（例: ROI, KPI, AI）
- 音声応答は絶対に出力しない。一切話さない、ただ聞くだけ`

const TRANSCRIPTION_PROMPT_EN = `You are an English-only silent transcription bot. All input audio is 100% English.

Strict rules:
- Always transcribe as English. Never misinterpret as other languages (Spanish, French, Chinese, Japanese, etc).
- Output only English letters, numbers and punctuation. Never output Kanji, Hangul, Thai, Arabic or other non-Latin scripts.
- When unsure, force English interpretation.
- If proper nouns from other languages are uttered, transliterate into English (romaji / pinyin etc).
- Never speak. Never respond. Just listen.`

// Hangul / Thai / Arabic / Devanagari / Hebrew / Cyrillic / Greek など、明らかに日本語でも英語でもない文字群
const NON_JA_EN_SCRIPTS = /[Ͱ-ϿЀ-ӿԀ-ԯ԰-֏֐-׿؀-ۿऀ-ॿঀ-৿฀-๿가-힯]/
// Hangul など（en モードで日本語・中国語・ハングル・キリル・タイ等が混じった場合のマーカー）
const NON_EN_SCRIPTS = /[぀-ゟ゠-ヿ一-鿿가-힯Ѐ-ӿ฀-๿]/
function isLikelyMisrecognition(text: string, lang: Language): boolean {
  // 注意：Gemini は inputTranscription をチャンク単位で吐くので、
  // 1文字や句読点単体は正常な部分結果のことが多い。スクリプト判定のみ行う。
  if (lang === 'ja') {
    // 日本語モード：ハングル/タイ/アラビア/ヘブライ/キリル等が含まれる → 誤認識
    return NON_JA_EN_SCRIPTS.test(text)
  }
  // 英語モード：日本語かな/漢字/ハングル/キリル等が含まれる → 誤認識
  return NON_EN_SCRIPTS.test(text)
}

export class GeminiLiveService {
  private session: any = null
  private options: GeminiLiveOptions
  private client: GoogleGenAI
  private isRunning = false
  private sentChunks = 0
  private recvMsgs = 0
  private statsTimer: ReturnType<typeof setInterval> | null = null

  // 部分的な transcription を1文単位にまとめる用のバッファ
  private buffer = ''
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private readonly FLUSH_IDLE_MS = 800 // 無音/停止後このmsだけ待って強制flush

  constructor(options: GeminiLiveOptions) {
    this.options = options
    this.client = new GoogleGenAI({ apiKey: options.apiKey })
  }

  private flushBuffer(reason: string): void {
    const text = this.buffer.trim()
    this.buffer = ''
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (!text) return
    // 確定単位で記号・空白のみ／1文字以下なら破棄（雑音や空白音のフィラー）
    if (text.length <= 1 || /^[\s\p{P}\p{S}]+$/u.test(text)) {
      console.warn(`[live:${this.options.speaker}] flush dropped (noise):`, text)
      return
    }
    console.log(`[live:${this.options.speaker}] flush(${reason}):`, text)
    this.options.onTranscript({
      text,
      speaker: this.options.speaker,
      timestamp: Date.now(),
    })
  }

  private scheduleIdleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = setTimeout(() => this.flushBuffer('idle'), this.FLUSH_IDLE_MS)
  }

  async connect(): Promise<void> {
    try {
      console.log(`[live:${this.options.speaker}] connecting…`)
      const lang: Language = this.options.language ?? 'ja'
      this.session = await this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-latest',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          systemInstruction: {
            parts: [
              {
                text:
                  lang === 'en' ? TRANSCRIPTION_PROMPT_EN : TRANSCRIPTION_PROMPT_JA,
              },
            ],
          },
        },
        callbacks: {
          onopen: () => {
            console.log(`[live:${this.options.speaker}] onopen`)
            this.isRunning = true
            this.options.onConnected()
            if (this.statsTimer) clearInterval(this.statsTimer)
            this.statsTimer = setInterval(() => {
              console.log(
                `[live:${this.options.speaker}] stats sent=${this.sentChunks}chunks recv=${this.recvMsgs}msgs`,
              )
            }, 5000)
          },
          onmessage: (m: LiveServerMessage) => this.handle(m),
          onerror: (e: ErrorEvent) => {
            console.error(`[live:${this.options.speaker}] onerror`, e)
            this.options.onError(new Error(e.message || 'Gemini Live error'))
          },
          onclose: (e: CloseEvent) => {
            console.warn(`[live:${this.options.speaker}] onclose`, e.code, e.reason)
            this.isRunning = false
            this.options.onDisconnected()
          },
        },
      })
      this.isRunning = true
      console.log(`[live:${this.options.speaker}] session opened`)
    } catch (error) {
      console.error(`[live:${this.options.speaker}] connect failed`, error)
      this.options.onError(error as Error)
      throw error
    }
  }

  private handle(m: LiveServerMessage): void {
    this.recvMsgs++
    // 最初の5件だけJSONダンプ（ノイズ削減）
    if (this.recvMsgs <= 5) {
      console.log(
        `[live:${this.options.speaker}] msg#${this.recvMsgs}:`,
        JSON.stringify(m).slice(0, 500),
      )
    }

    const inputT = m.serverContent?.inputTranscription
    if (inputT?.text) {
      const lang: Language = this.options.language ?? 'ja'
      if (isLikelyMisrecognition(inputT.text, lang)) {
        console.warn(
          `[live:${this.options.speaker}] dropped misrecognized text (${lang}):`,
          inputT.text,
        )
      } else {
        this.buffer += inputT.text
        // 句読点・終端記号で文が終わったらすぐflush（日本語・英語どちらも）
        if (/[。．.!?！？\n]\s*$/.test(this.buffer)) {
          this.flushBuffer('punct')
        } else {
          this.scheduleIdleFlush()
        }
      }
    }
    // API が finished フラグを立ててくれたら即flush
    if (inputT?.finished) {
      this.flushBuffer('finished')
    }
    // ターン終わり（相手が話し終わった等）でもflush
    if (m.serverContent?.turnComplete) {
      this.flushBuffer('turnComplete')
    }
  }

  sendAudio(buf: ArrayBuffer): void {
    if (!this.session || !this.isRunning) return
    try {
      this.session.sendRealtimeInput({
        audio: {
          data: bufToBase64(buf),
          mimeType: 'audio/pcm;rate=16000',
        },
      })
      this.sentChunks++
    } catch (e) {
      console.error(`[live:${this.options.speaker}] send failed:`, e)
    }
  }

  async disconnect(): Promise<void> {
    this.isRunning = false
    this.flushBuffer('disconnect')
    if (this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }
    if (this.session) {
      try {
        await this.session.close()
      } catch {
        // ignore
      }
      this.session = null
    }
  }
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}
