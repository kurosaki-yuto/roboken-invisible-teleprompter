import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AiProvider, Language } from '../../../types/ipc'

export default function Settings() {
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [anthropicApiKey, setAnthropicApiKey] = useState('')
  const [deepgramApiKey, setDeepgramApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState<AiProvider>('gemini')
  const [language, setLanguage] = useState<Language>('ja')
  const [companyProfile, setCompanyProfile] = useState('')
  const [fromEnv, setFromEnv] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testingAnthropic, setTestingAnthropic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'ok' | 'err'
    text: string
  } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    void (async () => {
      const keys = await window.api.getApiKeys()
      setGeminiApiKey(keys.geminiApiKey || '')
      setAnthropicApiKey(keys.anthropicApiKey || '')
      setDeepgramApiKey(keys.deepgramApiKey || '')
      setAiProvider(keys.aiProvider ?? 'gemini')
      setLanguage(keys.language ?? 'ja')
      setCompanyProfile(keys.companyProfile ?? '')
      setFromEnv(!!keys.fromEnv)
    })()
  }, [])

  const handleSave = async (opts?: { silent?: boolean }) => {
    setSaving(true)
    if (!opts?.silent) setMessage(null)
    try {
      const res = await window.api.setApiKeys({
        geminiApiKey: geminiApiKey.trim(),
        anthropicApiKey: anthropicApiKey.trim() || undefined,
        deepgramApiKey: deepgramApiKey.trim() || undefined,
        aiProvider,
        language,
        companyProfile,
      })
      setFromEnv(!!res.fromEnv)
      // サーバ側で claude→gemini へフォールバックされた場合 UI も追従
      if (res.aiProvider !== aiProvider) setAiProvider(res.aiProvider)
      if (!opts?.silent) setMessage({ kind: 'ok', text: '保存しました' })
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message })
      throw e
    } finally {
      setSaving(false)
    }
  }

  const handleBack = async () => {
    if (geminiApiKey.trim()) {
      try {
        await handleSave({ silent: true })
      } catch {
        // 保存失敗時はDashboardに戻らず留める
        return
      }
    }
    navigate('/')
  }

  // 入力欄のフォーカスが外れたら即保存（タイピング中の値を取りこぼさないため）
  const autoSaveOnBlur = () => {
    if (!geminiApiKey.trim()) return
    void handleSave({ silent: true })
  }

  // 言語切替は即保存（キー未入力でも language は独立に保存可能）
  const handleLanguageChange = async (l: Language) => {
    setLanguage(l)
    try {
      await window.api.setApiKeys({ language: l })
    } catch {
      // noop
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setMessage(null)
    try {
      const res = await window.api.testApiKey(geminiApiKey.trim())
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Gemini API キーは有効です ✓' })
      } else {
        setMessage({ kind: 'err', text: `Gemini 無効: ${res.error}` })
      }
    } finally {
      setTesting(false)
    }
  }

  const handleTestAnthropic = async () => {
    setTestingAnthropic(true)
    setMessage(null)
    try {
      const res = await window.api.testAnthropicKey(anthropicApiKey.trim())
      if (res.ok) {
        setMessage({ kind: 'ok', text: 'Claude API キーは有効です ✓' })
      } else {
        setMessage({ kind: 'err', text: `Claude 無効: ${res.error}` })
      }
    } finally {
      setTestingAnthropic(false)
    }
  }

  const handleProviderChange = async (p: AiProvider) => {
    if (p === 'claude' && !anthropicApiKey.trim()) {
      setMessage({
        kind: 'err',
        text: 'Claude を使うには Anthropic API キーを先に入力してください',
      })
      return
    }
    setAiProvider(p)
    try {
      await window.api.setApiKeys({ aiProvider: p })
    } catch {
      // noop
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">設定</h1>
        <button
          onClick={handleBack}
          className="text-sm text-sky-300 hover:text-sky-200 underline underline-offset-2"
        >
          ← 保存して Dashboard へ
        </button>
      </header>

      <section className="max-w-2xl bg-neutral-900 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium mb-1">会話の言語</h2>
        <p className="text-sm text-neutral-400 mb-3">
          文字起こしと AI 回答の言語。英語の商談は English、日本語の商談は
          Japanese にすると精度が上がります。
        </p>
        <div className="flex gap-2">
          {(['ja', 'en'] as Language[]).map((l) => (
            <button
              key={l}
              onClick={() => handleLanguageChange(l)}
              className={`px-4 py-2 rounded text-sm border ${
                language === l
                  ? 'bg-sky-500 border-sky-400 text-white'
                  : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {l === 'ja' ? '日本語 (Japanese)' : 'English'}
            </button>
          ))}
        </div>
      </section>

      <section className="max-w-2xl bg-neutral-900 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium mb-1">自社プロフィール（AIが毎回参照）</h2>
        <p className="text-sm text-neutral-400 mb-3">
          自社サービスの概要・強み・料金レンジ・絶対NGの条件などを書いておくと、Push-to-Think の回答が事業の実態に沿うようになります。全商談で毎回使われます（秘匿情報は入れないでください）。
        </p>
        <textarea
          value={companyProfile}
          onChange={(e) => setCompanyProfile(e.target.value)}
          onBlur={autoSaveOnBlur}
          rows={8}
          className="w-full bg-neutral-800 rounded px-3 py-2 text-sm font-mono"
          placeholder={`例：
- 事業: 中小企業向けSaaS型会計ソフト
- 強み: 国内クラウド会計で初期費用ゼロ、7日間無料
- 料金: Basic 月¥3,980 / Pro 月¥9,800
- ターゲット: 従業員10-50名の法人
- 絶対NG: 無期限無料、初期費用請求、他社との相見積もり合意`}
        />
      </section>

      <section className="max-w-2xl bg-neutral-900 border border-neutral-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-medium mb-1">AI プロバイダ</h2>
        <p className="text-sm text-neutral-400 mb-3">
          Push-to-Think と議事録生成に使う AI。Claude は Anthropic API キーを登録すると選べるようになります（質問への切り返しや議事録の精度がさらに上がります）。
        </p>
        <div className="flex gap-2">
          {(['gemini', 'claude'] as AiProvider[]).map((p) => {
            const disabled = p === 'claude' && !anthropicApiKey.trim()
            return (
              <button
                key={p}
                onClick={() => handleProviderChange(p)}
                disabled={disabled}
                className={`px-4 py-2 rounded text-sm border ${
                  aiProvider === p
                    ? 'bg-sky-500 border-sky-400 text-white'
                    : disabled
                      ? 'bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed'
                      : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                }`}
                title={disabled ? 'Anthropic API キーを入力すると選択できます' : undefined}
              >
                {p === 'gemini' ? 'Gemini (2.5 Flash / Pro)' : 'Claude (Haiku 4.5 / Sonnet 4.6)'}
              </button>
            )
          })}
        </div>
      </section>

      <section className="max-w-2xl bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-lg font-medium mb-1">Gemini API キー</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Google AI Studio（
          <span className="text-sky-300">aistudio.google.com/apikey</span>
          ）で無料発行できます。入力後「保存」、必要なら「接続テスト」で疎通確認。キーはこの PC の
          <code className="text-xs bg-neutral-800 rounded px-1 mx-1">
            userData/settings.json
          </code>
          にのみ保存されます。ネットワーク送信やアップロードはしません。
        </p>

        {fromEnv && (
          <div className="bg-amber-900/30 border border-amber-700/50 text-amber-200 rounded p-3 text-xs mb-4">
            現在「.env」ファイル経由でキーが読み込まれています。アプリ内設定で上書きすると、以降はこちらが優先されます。
          </div>
        )}

        <label className="block text-xs text-neutral-400 mb-1">
          Gemini API Key（必須）
        </label>
        <input
          type="password"
          value={geminiApiKey}
          onChange={(e) => setGeminiApiKey(e.target.value)}
          onBlur={autoSaveOnBlur}
          className="w-full bg-neutral-800 rounded px-3 py-2 mb-4 text-sm font-mono"
          placeholder="AIzaSy..."
          autoComplete="off"
        />

        <label className="block text-xs text-neutral-400 mb-1">
          Anthropic API Key（任意・Claude を使う場合）
        </label>
        <p className="text-xs text-neutral-500 mb-2">
          登録すると上の「AI プロバイダ」で Claude が選べるようになります。取得:{' '}
          <span className="text-sky-300">console.anthropic.com</span>
        </p>
        <input
          type="password"
          value={anthropicApiKey}
          onChange={(e) => setAnthropicApiKey(e.target.value)}
          onBlur={autoSaveOnBlur}
          className="w-full bg-neutral-800 rounded px-3 py-2 mb-2 text-sm font-mono"
          placeholder="sk-ant-..."
          autoComplete="off"
        />
        <div className="flex gap-2 mb-4">
          <button
            onClick={handleTestAnthropic}
            disabled={testingAnthropic || !anthropicApiKey.trim()}
            className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 px-3 py-1.5 rounded text-xs"
          >
            {testingAnthropic ? 'テスト中…' : 'Claude 接続テスト'}
          </button>
        </div>

        <label className="block text-xs text-neutral-400 mb-1">
          Deepgram API Key（推奨・文字起こし精度が大幅UP）
        </label>
        <p className="text-xs text-neutral-500 mb-2">
          未入力なら Gemini Live で文字起こし。入力すると Deepgram Nova-3 に切替（より正確、固有名詞・数値に強い）。
          <br />
          取得:{' '}
          <span className="text-sky-300">console.deepgram.com</span>
          {' '}（新規登録で $200 分の無料枠付与）
        </p>
        <input
          type="password"
          value={deepgramApiKey}
          onChange={(e) => setDeepgramApiKey(e.target.value)}
          onBlur={autoSaveOnBlur}
          className="w-full bg-neutral-800 rounded px-3 py-2 mb-4 text-sm font-mono"
          placeholder="（空欄なら Gemini Live を使用）"
          autoComplete="off"
        />

        <div className="flex gap-2">
          <button
            onClick={() => handleSave()}
            disabled={saving || !geminiApiKey.trim()}
            className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !geminiApiKey.trim()}
            className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 px-4 py-2 rounded text-sm"
          >
            {testing ? 'テスト中…' : '接続テスト'}
          </button>
          <button
            onClick={handleBack}
            className="ml-auto text-neutral-400 hover:text-neutral-200 text-sm px-3"
          >
            保存して戻る
          </button>
        </div>

        {message && (
          <p
            className={`mt-4 text-sm ${
              message.kind === 'ok' ? 'text-emerald-300' : 'text-rose-300'
            }`}
          >
            {message.text}
          </p>
        )}
      </section>
    </div>
  )
}
