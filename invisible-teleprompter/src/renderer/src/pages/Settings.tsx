import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AiProvider, Language, LicenseStateView, TeamInfoView } from '../../../types/ipc'

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

  // --- license / team state ---
  const [license, setLicense] = useState<LicenseStateView | null>(null)
  const [licenseKeyInput, setLicenseKeyInput] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [activating, setActivating] = useState(false)
  const [teamInfo, setTeamInfo] = useState<TeamInfoView | null>(null)
  const [teamLoading, setTeamLoading] = useState(false)

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
      const lic = await window.api.getLicense()
      setLicense(lic)
    })()

    const unsub = window.api.onLicenseChanged((state) => {
      setLicense(state)
    })
    return () => {
      unsub()
    }
  }, [])

  useEffect(() => {
    if (license?.isAdmin && license?.teamId) {
      void (async () => {
        setTeamLoading(true)
        try {
          const info = await window.api.getTeamInfo()
          setTeamInfo(info)
        } finally {
          setTeamLoading(false)
        }
      })()
    } else {
      setTeamInfo(null)
    }
  }, [license?.isAdmin, license?.teamId])

  const handleActivateLicense = async () => {
    if (!licenseKeyInput.trim()) return
    setActivating(true)
    setMessage(null)
    try {
      await window.api.activateLicense(licenseKeyInput.trim())
      setLicenseKeyInput('')
      setMessage({ kind: 'ok', text: 'ライセンスを有効化しました' })
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message })
    } finally {
      setActivating(false)
    }
  }

  const handleActivateInvite = async () => {
    if (!inviteToken.trim() || !inviteEmail.trim()) return
    setActivating(true)
    setMessage(null)
    try {
      await window.api.activateInvite(inviteToken.trim(), inviteEmail.trim())
      setInviteToken('')
      setInviteEmail('')
      setMessage({ kind: 'ok', text: '招待を受け取り、座席を有効化しました' })
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message })
    } finally {
      setActivating(false)
    }
  }

  const handleDeactivateLicense = async () => {
    setActivating(true)
    setMessage(null)
    try {
      await window.api.deactivateLicense()
      setMessage({ kind: 'ok', text: 'ライセンスを解除しました' })
    } catch (e) {
      setMessage({ kind: 'err', text: (e as Error).message })
    } finally {
      setActivating(false)
    }
  }

  const handleResendInvite = async (seatId: string) => {
    const ok = await window.api.resendInvite(seatId)
    setMessage({
      kind: ok ? 'ok' : 'err',
      text: ok ? '招待メールを再送しました' : '招待メール再送に失敗しました',
    })
  }

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

      {/* ============ ライセンス / 法人シート管理 ============ */}
      <section className="max-w-2xl bg-neutral-900 border border-neutral-800 rounded-lg p-6 mt-6">
        <h2 className="text-lg font-medium mb-1">ライセンス</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Stripe Checkout で購入したライセンスキー、または法人プランの招待トークンを入力してください。
        </p>

        {license && (
          <div className="bg-neutral-800/50 border border-neutral-700 rounded p-3 text-xs mb-4 space-y-1">
            <div>
              ステータス:{' '}
              <span
                className={
                  license.featureAllowed
                    ? 'text-emerald-300 font-medium'
                    : 'text-rose-300 font-medium'
                }
              >
                {license.internalBypass ? '内部利用 (無料)' : license.status}
              </span>
            </div>
            {license.teamId && (
              <div>
                チームID: <code className="text-neutral-300">{license.teamId}</code>
              </div>
            )}
            {license.isAdmin && (
              <div className="text-amber-300">管理者アカウント</div>
            )}
            {license.email && <div>メール: {license.email}</div>}
            {license.seatStatus && (
              <div>座席ステータス: {license.seatStatus}</div>
            )}
            {license.currentPeriodEnd && (
              <div>
                次回更新:{' '}
                {new Date(license.currentPeriodEnd * 1000).toLocaleDateString('ja-JP')}
              </div>
            )}
          </div>
        )}

        {!license?.hasKey && (
          <>
            <div className="mb-4">
              <label className="block text-xs text-neutral-400 mb-1">
                ライセンスキー (個人プラン / 管理者キー)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  className="flex-1 bg-neutral-800 rounded px-3 py-2 text-sm font-mono"
                  placeholder="mienaq-..."
                  autoComplete="off"
                />
                <button
                  onClick={handleActivateLicense}
                  disabled={activating || !licenseKeyInput.trim()}
                  className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
                >
                  有効化
                </button>
              </div>
            </div>

            <div className="border-t border-neutral-800 pt-4 mt-4">
              <h3 className="text-sm font-medium mb-2">招待トークンで参加 (法人プラン社員)</h3>
              <label className="block text-xs text-neutral-400 mb-1">招待トークン</label>
              <input
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                className="w-full bg-neutral-800 rounded px-3 py-2 mb-2 text-sm font-mono"
                placeholder="inv-..."
                autoComplete="off"
              />
              <label className="block text-xs text-neutral-400 mb-1">メールアドレス</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full bg-neutral-800 rounded px-3 py-2 mb-2 text-sm"
                placeholder="you@example.com"
                autoComplete="off"
              />
              <button
                onClick={handleActivateInvite}
                disabled={activating || !inviteToken.trim() || !inviteEmail.trim()}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 px-4 py-2 rounded text-sm font-medium"
              >
                招待を受け取る
              </button>
            </div>
          </>
        )}

        {license?.hasKey && !license.internalBypass && (
          <button
            onClick={handleDeactivateLicense}
            disabled={activating}
            className="mt-2 bg-neutral-800 hover:bg-rose-900 disabled:opacity-50 px-4 py-2 rounded text-sm text-rose-300"
          >
            ライセンスを解除
          </button>
        )}
      </section>

      {/* ============ チーム管理 (管理者のみ) ============ */}
      {license?.isAdmin && (
        <section className="max-w-2xl bg-neutral-900 border border-neutral-800 rounded-lg p-6 mt-6">
          <h2 className="text-lg font-medium mb-1">チーム管理</h2>
          <p className="text-sm text-neutral-400 mb-4">
            シート (1ユーザ=月20ドル) の追加・削除、招待URLの再送ができます。
          </p>

          {teamLoading && <p className="text-xs text-neutral-500">読み込み中...</p>}

          {teamInfo && (
            <>
              <div className="bg-neutral-800/50 border border-neutral-700 rounded p-3 text-xs mb-4 space-y-1">
                <div>
                  シート数: {teamInfo.activeSeatCount} / {teamInfo.seatCount} (アクティブ /
                  契約)
                </div>
                <div>月額: ${teamInfo.seatCount * 20} (税抜)</div>
                <div>管理者: {teamInfo.adminEmail}</div>
                <div>ステータス: {teamInfo.status}</div>
              </div>

              <h3 className="text-sm font-medium mb-2">座席一覧</h3>
              <div className="space-y-1 mb-4">
                {teamInfo.seats.map((seat) => (
                  <div
                    key={seat.id}
                    className="flex items-center justify-between bg-neutral-800/40 rounded px-3 py-2 text-xs"
                  >
                    <div>
                      <div className="font-medium">
                        {seat.email || '(未登録)'}
                        {seat.isAdmin && (
                          <span className="ml-2 text-amber-300">[管理者]</span>
                        )}
                      </div>
                      <div className="text-neutral-500">
                        {seat.status}
                        {seat.activatedAt &&
                          ` · 有効化: ${new Date(seat.activatedAt * 1000).toLocaleDateString('ja-JP')}`}
                      </div>
                    </div>
                    {seat.status === 'pending' && (
                      <button
                        onClick={() => handleResendInvite(seat.id)}
                        className="bg-neutral-700 hover:bg-neutral-600 px-2 py-1 rounded text-xs"
                      >
                        招待再送
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <p className="text-xs text-neutral-500">
                シート数の追加・削除・支払い方法の変更は Stripe Customer Portal で行います
                (準備中)。
              </p>
            </>
          )}

          {!teamLoading && !teamInfo && (
            <p className="text-xs text-rose-300">
              チーム情報を取得できませんでした。バックエンド未準備の可能性があります。
            </p>
          )}
        </section>
      )}
    </div>
  )
}
