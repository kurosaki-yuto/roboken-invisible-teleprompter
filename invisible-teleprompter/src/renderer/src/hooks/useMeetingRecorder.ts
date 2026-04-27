import { useCallback, useEffect, useRef, useState } from 'react'
import { GeminiLiveService } from '../services/gemini-live'
import { DeepgramLiveService } from '../services/deepgram-live'
import type { TranscriptEntry } from '../../../types/ipc'

interface UseMeetingRecorderReturn {
  isRecording: boolean
  transcript: TranscriptEntry[]
  start: () => Promise<void>
  stop: () => void
  error: string | null
}

// 両プロバイダが満たすべき共通インターフェイス
interface TranscriptionSession {
  connect(): Promise<void>
  sendAudio(buf: ArrayBuffer): void
  disconnect(): Promise<void>
}

export function useMeetingRecorder(): UseMeetingRecorderReturn {
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  const selfRef = useRef<TranscriptionSession | null>(null)
  const otherRef = useRef<TranscriptionSession | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micProcRef = useRef<ScriptProcessorNode | null>(null)
  const sysProcRef = useRef<ScriptProcessorNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const sysStreamRef = useRef<MediaStream | null>(null)

  const onTranscript = useCallback((entry: TranscriptEntry) => {
    const text = entry.text.trim()
    if (!text) return
    setTranscript((prev) => [...prev.slice(-300), entry])
  }, [])

  const start = useCallback(async () => {
    setError(null)
    try {
      console.log('[recorder] start: fetching api keys…')
      const keys = await window.api.getApiKeys()
      if (!keys.geminiApiKey) {
        throw new Error(
          'GEMINI_API_KEY が未設定です。.env に追加してください。',
        )
      }

      // ループバック（相手の声＝システム音声）有効化
      console.log('[recorder] enabling loopback…')
      await window.api.enableLoopbackAudio()
      console.log('[recorder] getDisplayMedia…')
      const sysStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      })
      const sysAudioTracks = sysStream.getAudioTracks()
      console.log(
        `[recorder] sysStream audio tracks=${sysAudioTracks.length}`,
        sysAudioTracks.map((t) => t.label),
      )
      if (sysAudioTracks.length === 0) {
        const isMac =
          typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
        throw new Error(
          isMac
            ? 'システム音声が取れませんでした。macOS の「画面収録とシステム音声録音」権限を Electron に付与してください（システム設定 → プライバシーとセキュリティ）。'
            : 'システム音声が取れませんでした。共有ダイアログで「システムオーディオを共有」をオンにしてください（Windows 10/11 + Chrome ベース Electron）。',
        )
      }
      sysStream.getVideoTracks().forEach((t) => {
        t.stop()
        sysStream.removeTrack(t)
      })
      await window.api.disableLoopbackAudio()
      sysStreamRef.current = sysStream

      // マイク（自分の声）
      console.log('[recorder] getUserMedia mic…')
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      console.log(
        '[recorder] mic tracks=',
        micStream.getAudioTracks().map((t) => t.label),
      )
      micStreamRef.current = micStream

      // Deepgram キーがあればそっち（精度高）、無ければ Gemini Live にフォールバック
      const useDeepgram = !!keys.deepgramApiKey?.trim()
      console.log(
        `[recorder] transcription provider = ${useDeepgram ? 'Deepgram Nova-3' : 'Gemini Live'}`,
      )

      const makeService = (
        speaker: 'self' | 'other',
      ): TranscriptionSession => {
        const common = {
          speaker,
          language: keys.language,
          onTranscript,
          onConnected: () => console.log(`[recorder] ${speaker} connected`),
          onDisconnected: () =>
            console.log(`[recorder] ${speaker} disconnected`),
          onError: (e: Error) => {
            console.error(`[recorder] ${speaker} error:`, e)
            setError(`${speaker === 'self' ? '自分側' : '相手側'}: ${e.message}`)
          },
        }
        if (useDeepgram) {
          return new DeepgramLiveService({
            apiKey: keys.deepgramApiKey!,
            ...common,
          })
        }
        return new GeminiLiveService({
          apiKey: keys.geminiApiKey,
          ...common,
        })
      }

      const self = makeService('self')
      const other = makeService('other')
      selfRef.current = self
      otherRef.current = other

      console.log('[recorder] connecting transcription sessions x2…')
      await Promise.all([self.connect(), other.connect()])
      console.log('[recorder] both sessions ready')

      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = ctx

      const micSrc = ctx.createMediaStreamSource(micStream)
      const sysSrc = ctx.createMediaStreamSource(sysStream)

      const floatToPcm = (input: Float32Array): ArrayBuffer => {
        const pcm = new Int16Array(input.length)
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]))
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        return pcm.buffer
      }

      // マイク：VAD削除。常時マイク音声を Gemini Live に流して取りこぼしを防ぐ。
      const micProc = ctx.createScriptProcessor(4096, 1, 1)
      micProcRef.current = micProc
      micProc.onaudioprocess = (ev) => {
        selfRef.current?.sendAudio(
          floatToPcm(ev.inputBuffer.getChannelData(0)),
        )
      }
      micSrc.connect(micProc)
      micProc.connect(ctx.destination)

      // システム音声：常時送信（従来通り）
      const sysProc = ctx.createScriptProcessor(4096, 1, 1)
      sysProcRef.current = sysProc
      sysProc.onaudioprocess = (ev) => {
        otherRef.current?.sendAudio(
          floatToPcm(ev.inputBuffer.getChannelData(0)),
        )
      }
      sysSrc.connect(sysProc)
      sysProc.connect(ctx.destination)

      setIsRecording(true)
    } catch (e) {
      const msg = (e as Error).message || 'unknown'
      setError(msg)
      setIsRecording(false)
      throw e
    }
  }, [onTranscript])

  const stop = useCallback(() => {
    micProcRef.current?.disconnect()
    sysProcRef.current?.disconnect()
    audioCtxRef.current?.close()
    selfRef.current?.disconnect()
    otherRef.current?.disconnect()
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    sysStreamRef.current?.getTracks().forEach((t) => t.stop())
    audioCtxRef.current = null
    micProcRef.current = null
    sysProcRef.current = null
    setIsRecording(false)
  }, [])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return { isRecording, transcript, start, stop, error }
}
