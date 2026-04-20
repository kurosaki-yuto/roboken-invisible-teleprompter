import { useRef, useState, useCallback } from 'react'

interface UseAudioTranscriptionReturn {
  transcript: string[]
  interimText: string
  isRecording: boolean
  startRecording: () => Promise<void>
  stopRecording: () => void
  error: string | null
}

// Web Speech API の型定義（ブラウザ組み込み、TypeScript 標準型にない場合があるため補完）
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
declare const webkitSpeechRecognition: new () => SpeechRecognitionInstance

export function useAudioTranscription(): UseAudioTranscriptionReturn {
  const [transcript, setTranscript] = useState<string[]>([])
  const [interimText, setInterimText] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  // stopRecording から再起動を止めるフラグ
  const stoppedRef = useRef(false)

  const startRecording = useCallback(async () => {
    setError(null)
    stoppedRef.current = false

    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
        .SpeechRecognition ??
      (typeof webkitSpeechRecognition !== 'undefined' ? webkitSpeechRecognition : null)

    if (!SpeechRecognitionCtor) {
      setError('この環境では音声認識が使えません（Electron 上で起動してください）')
      return
    }

    const start = (): void => {
      if (stoppedRef.current) return

      const rec = new SpeechRecognitionCtor()
      rec.lang = 'ja-JP'
      rec.continuous = true
      rec.interimResults = true
      rec.maxAlternatives = 1
      recognitionRef.current = rec

      rec.onstart = () => {
        console.log('[SpeechRecognition] started')
        setIsRecording(true)
      }

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i]
          if (result.isFinal) {
            const text = result[0].transcript.trim()
            if (text.length > 0) {
              setTranscript((prev) => [...prev, text])
            }
          } else {
            interim += result[0].transcript
          }
        }
        setInterimText(interim)
      }

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        // no-speech は無音検知なので無視して再起動
        if (e.error === 'no-speech') return
        console.error('[SpeechRecognition] error:', e.error)
        if (e.error === 'not-allowed') {
          setError('マイクのアクセスが拒否されました。システム設定でマイクを許可してください')
        }
      }

      rec.onend = () => {
        console.log('[SpeechRecognition] ended')
        setInterimText('')
        // continuous でも Chrome は一定時間で止まるので自動再起動
        if (!stoppedRef.current) {
          setTimeout(start, 200)
        } else {
          setIsRecording(false)
        }
      }

      try {
        rec.start()
      } catch (err) {
        console.error('[SpeechRecognition] start error', err)
      }
    }

    start()
  }, [])

  const stopRecording = useCallback(() => {
    stoppedRef.current = true
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setIsRecording(false)
    setInterimText('')
  }, [])

  return { transcript, interimText, isRecording, startRecording, stopRecording, error }
}
