import { useCallback, useEffect, useRef, useState } from 'react'

interface UseRecordingTimerReturn {
  elapsedSeconds: number
  formattedTime: string
  startTimer: () => void
  stopTimer: () => void
}

export function useRecordingTimer(): UseRecordingTimerReturn {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback(() => {
    setElapsedSeconds(0)
    intervalRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setElapsedSeconds(0)
  }, [])

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  const h = Math.floor(elapsedSeconds / 3600)
  const m = Math.floor((elapsedSeconds % 3600) / 60)
  const s = elapsedSeconds % 60
  const formattedTime =
    h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`

  return { elapsedSeconds, formattedTime, startTimer, stopTimer }
}
