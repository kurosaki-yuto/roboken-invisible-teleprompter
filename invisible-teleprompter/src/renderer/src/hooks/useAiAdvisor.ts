import { useCallback, useState } from 'react'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPTS = {
  seller: `あなたは百戦錬磨のビジネス軍師です。
提示された会話ログと資料画像から、相手の意図を読み、
次に話すべき「知的で人間味のある提案・切り返し・確認点」を3つ、各20文字以内で出力してください。

出力形式は必ず以下のJSONにしてください:
{"answers": ["回答1", "回答2", "回答3"]}`,

  buyer: `あなたは経験豊富な購買戦略アドバイザーです。
提示された会話ログと資料画像から、売り手の意図を読み取り、
買い手として有利な立場を保つための「質問・懸念点の指摘・断りフレーズ」を3つ、各20文字以内で出力してください。
価格交渉・条件確認・リスク察知の視点を優先してください。

出力形式は必ず以下のJSONにしてください:
{"answers": ["回答1", "回答2", "回答3"]}`
}

interface UseAiAdvisorReturn {
  askAi: (transcript: string[], imageBase64: string | null) => Promise<void>
  isThinking: boolean
  error: string | null
}

export function useAiAdvisor(
  userContext: string,
  mode: 'seller' | 'buyer' = 'seller'
): UseAiAdvisorReturn {
  const [isThinking, setIsThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const askAi = useCallback(
    async (transcript: string[], imageBase64: string | null) => {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY
      if (!apiKey) {
        setError('VITE_GEMINI_API_KEY が設定されていません')
        return
      }

      setIsThinking(true)
      setError(null)

      try {
        const genAI = new GoogleGenerativeAI(apiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

        const recentTranscript = transcript.slice(-30).join('\n')
        const contextSection = userContext.trim()
          ? `\n\n【発言者の背景情報・条件】\n${userContext.trim()}`
          : ''
        const textPart = `${SYSTEM_PROMPTS[mode]}${contextSection}\n\n【会話ログ】\n${recentTranscript || '（まだ会話がありません）'}`

        let result
        if (imageBase64) {
          const imageData = imageBase64.replace(/^data:image\/\w+;base64,/, '')
          result = await model.generateContent([
            { text: textPart },
            { inlineData: { mimeType: 'image/png', data: imageData } }
          ])
        } else {
          result = await model.generateContent(textPart)
        }

        const responseText = result.response.text()
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('JSON が見つかりませんでした')

        const parsed = JSON.parse(jsonMatch[0]) as { answers: string[] }
        const answers = parsed.answers?.slice(0, 3) ?? []

        if (answers.length === 0) throw new Error('回答が空でした')

        window.api.sendToTeleprompter(answers)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(`AI エラー: ${message}`)
        console.error('[Gemini]', err)
      } finally {
        setIsThinking(false)
      }
    },
    [userContext, mode]
  )

  return { askAi, isThinking, error }
}
