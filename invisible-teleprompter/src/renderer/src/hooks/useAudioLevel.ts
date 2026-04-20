import { useCallback, useEffect, useRef, useState } from 'react'

const NUM_BANDS = 16

interface UseAudioLevelReturn {
  levels: number[]
  startLevel: () => Promise<void>
  stopLevel: () => void
}

export function useAudioLevel(): UseAudioLevelReturn {
  const [levels, setLevels] = useState<number[]>(new Array(NUM_BANDS).fill(0))
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const activeRef = useRef(false)

  const startLevel = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      streamRef.current = stream

      const ctx = new AudioContext()
      contextRef.current = ctx

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64 // gives 32 bins; we use first 16
      analyserRef.current = analyser

      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)

      activeRef.current = true

      const buf = new Uint8Array(analyser.frequencyBinCount)

      const tick = (): void => {
        if (!activeRef.current) return
        analyser.getByteFrequencyData(buf)
        // 32 bins → 16 bands by averaging pairs
        const bands = Array.from({ length: NUM_BANDS }, (_, i) => {
          const val = (buf[i * 2] + buf[i * 2 + 1]) / 2
          return val / 255
        })
        setLevels(bands)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch {
      // マイクアクセス失敗時は波形なしのまま
    }
  }, [])

  const stopLevel = useCallback(() => {
    activeRef.current = false
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    analyserRef.current?.disconnect()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    contextRef.current?.close()
    streamRef.current = null
    contextRef.current = null
    analyserRef.current = null
    setLevels(new Array(NUM_BANDS).fill(0))
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      contextRef.current?.close()
    }
  }, [])

  return { levels, startLevel, stopLevel }
}
