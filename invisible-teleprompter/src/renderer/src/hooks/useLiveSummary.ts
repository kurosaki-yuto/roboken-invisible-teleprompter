import { useCallback, useEffect, useRef, useState } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SUMMARY_PROMPT = `あなたは商談の要約アシスタントです。
以下の会話ログを読み、「いま話されているトピックの要点」を箇条書き3〜5項目で返してください。
各項目は25字以内。直近の会話の要点のみ、手短に。

出力形式は必ず以下のJSONにしてください:
{"points": ["要点1", "要点2", "要点3"]}`

interface UseLiveSummaryReturn {
  points: string[]
  isSummarizing: boolean
}

export function useLiveSummary(transcript: string[], isActive: boolean): UseLiveSummaryReturn {
  const [points, setPoints] = useState<string[]>([])
  const [isSummarizing, setIsSummarizing] = useState(false)
  const lastCountRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const summarize = useCallback(async (lines: string[]) => {
    if (lines.length === 0) return
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) return

    setIsSummarizing(true)
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
      const recentText = lines.slice(-20).join('\n')
      const result = await model.generateContent(`${SUMMARY_PROMPT}\n\n【会話ログ】\n${recentText}`)
      const text = result.response.text()
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return
      const parsed = JSON.parse(match[0]) as { points: string[] }
      if (parsed.points?.length > 0) setPoints(parsed.points.slice(0, 5))
    } catch {
      // UI non-critical — silent fail
    } finally {
      setIsSummarizing(false)
    }
  }, [])

  // 30秒ごとに自動更新
  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) clearInterval(timerRef.current)
      return
    }
    timerRef.current = setInterval(() => {
      if (transcript.length > 0) summarize(transcript)
    }, 30_000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isActive, transcript, summarize])

  // 10発話ごとに追加発火
  useEffect(() => {
    if (!isActive) return
    if (transcript.length - lastCountRef.current >= 10) {
      lastCountRef.current = transcript.length
      summarize(transcript)
    }
  }, [transcript, isActive, summarize])

  // 非アクティブ時リセット
  useEffect(() => {
    if (!isActive) {
      setPoints([])
      lastCountRef.current = 0
    }
  }, [isActive])

  return { points, isSummarizing }
}
