import React, { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type {
  CaptureBounds,
  PushToThinkResult,
  TranscriptEntry,
} from '../../../types/ipc'
import { useMeetingRecorder } from '../hooks/useMeetingRecorder'

// 縮小グリッドで平均輝度を取り、スライド変化を検知するための簡易 pHash
async function perceptualHash(dataUrl: string, size = 16): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no 2d ctx'))
      ctx.drawImage(img, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)
      const out = new Uint8Array(size * size)
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        out[j] = (data[i] + data[i + 1] + data[i + 2]) / 3
      }
      resolve(out)
    }
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = dataUrl
  })
}

function hashDistance(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return 255
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length // 0〜255 の平均輝度差
}

const SLIDE_POLL_INTERVAL_MS = 4000
const SLIDE_CHANGE_THRESHOLD = 12 // 平均輝度差がこれを超えたらスライド変化とみなす

export default function Dashboard() {
  const [title, setTitle] = useState('商談')
  const [context, setContext] = useState('')
  const [bounds, setBounds] = useState<CaptureBounds | null>(null)
  const [status, setStatus] = useState('待機中')
  const [lastResult, setLastResult] = useState<PushToThinkResult | null>(null)
  const [lastImage, setLastImage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [autoCoach, setAutoCoach] = useState(false)
  const lastAutoFireRef = useRef<number>(0)
  const pushInFlightRef = useRef<boolean>(false)
  const navigate = useNavigate()

  const {
    isRecording,
    transcript,
    start: startRec,
    stop: stopRec,
    error: recError,
  } = useMeetingRecorder()

  // 起動中のスクショ履歴（Summary 時に DB に保存）
  const imagesRef = useRef<string[]>([])
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const contextRef = useRef<string>('')
  const boundsRef = useRef<CaptureBounds | null>(null)
  const startedAtRef = useRef<number>(0)

  useEffect(() => {
    transcriptRef.current = transcript
  }, [transcript])

  useEffect(() => {
    contextRef.current = context
  }, [context])

  useEffect(() => {
    boundsRef.current = bounds
  }, [bounds])

  useEffect(() => {
    void (async () => {
      const keys = await window.api.getApiKeys()
      setHasKey(!!keys.geminiApiKey)
      setAutoCoach(!!keys.autoCoach)
    })()
    const offBounds = window.api.onSelectionBounds((b) => {
      setBounds(b)
      setStatus('領域指定完了。Cmd/Ctrl + K で AI に相談できます。')
    })
    const offThink = window.api.onTriggerThink(() => {
      console.log('[dashboard] onTriggerThink received, bounds=', !!boundsRef.current, 'recording=', isRecording)
      void runPushToThink()
    })
    return () => {
      offBounds()
      offThink()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto Coach: autoCoach ON && 録音中 && 領域指定済みで、相手の発話が来たら 1.5s の静寂後に Push-to-Think を自動発火。
  // クールダウン 10 秒で過剰発火を抑制。
  useEffect(() => {
    if (!autoCoach || !isRecording || !bounds) return
    const last = transcript[transcript.length - 1]
    if (!last || last.speaker !== 'other') return
    const now = Date.now()
    if (now - lastAutoFireRef.current < 10000) return
    const timer = setTimeout(() => {
      lastAutoFireRef.current = Date.now()
      void runPushToThink()
    }, 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, autoCoach, isRecording, bounds])

  // スライド自動切替検知：録音中かつ領域指定済みなら定期キャプチャ→pHash 比較→変化時のみ保存
  useEffect(() => {
    if (!isRecording || !bounds) return
    let cancelled = false
    let lastHash: Uint8Array | null = null
    const tick = async () => {
      if (cancelled) return
      try {
        const b = boundsRef.current
        if (!b) return
        const dataUrl = await window.api.captureRegion(b)
        const hash = await perceptualHash(dataUrl)
        const shouldSave =
          !lastHash || hashDistance(lastHash, hash) >= SLIDE_CHANGE_THRESHOLD
        if (shouldSave) {
          lastHash = hash
          imagesRef.current.push(dataUrl)
          setLastImage(dataUrl)
        }
      } catch {
        // 一時的なキャプチャ失敗は無視して次の tick で再試行
      }
    }
    void tick() // 初回即時
    const timer = setInterval(tick, SLIDE_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isRecording, bounds])

  const handleStart = async () => {
    // マイクの許可を先に取っておく
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setStatus('マイクの許可が必要です')
      return
    }
    imagesRef.current = []
    startedAtRef.current = Date.now()
    window.api.startSelection()
    setStatus('画面領域を選択してください…')
    await startRec()
  }

  const runPushToThink = async () => {
    const b = boundsRef.current
    if (!b) {
      setStatus('先に領域を指定してください')
      return
    }
    if (pushInFlightRef.current) return
    pushInFlightRef.current = true
    // この Cmd+K 押下を識別するトークン。fast/deep の結果が古い trigger のものなら捨てる
    const triggerId = Date.now()
    lastAutoFireRef.current = triggerId // 任意：自動と手動の衝突緩和
    try {
      setStatus('スクショ取得中…')
      const dataUrl = await window.api.captureRegion(b)
      setLastImage(dataUrl)
      imagesRef.current.push(dataUrl)

      const args = {
        transcript: transcriptRef.current,
        imageDataUrl: dataUrl,
        context: contextRef.current,
      }

      setStatus('AI 考え中（即時＋深堀り並行）…')

      // 二段階応答：fast と deep を並列発火。早い方から Teleprompter に出し、
      // deep が届いたら自動で上書きする（Teleprompter 側は新しい EV_PATTERNS を受けるだけ）
      const fastPromise = window.api
        .pushToThinkFast(args)
        .then((r) => {
          // deep が先に終わっていたら fast は上書きしない
          if (r.generatedAt < triggerId - 100) return
          setLastResult(r)
          setStatus('即時回答表示中（深堀り計算中…）')
        })
        .catch((e) => {
          console.error('[pushToThink fast failed]', e)
        })

      const deepPromise = window.api
        .pushToThink(args)
        .then((r) => {
          setLastResult(r)
          setStatus('深堀り回答を Teleprompter に表示しました')
        })
        .catch((e) => {
          setStatus(`エラー: ${(e as Error).message}`)
        })

      await Promise.allSettled([fastPromise, deepPromise])
    } catch (e) {
      setStatus(`エラー: ${(e as Error).message}`)
    } finally {
      pushInFlightRef.current = false
    }
  }

  const toggleAutoCoach = async () => {
    const next = !autoCoach
    setAutoCoach(next)
    try {
      await window.api.setApiKeys({ autoCoach: next })
    } catch {
      // 永続化失敗してもローカル挙動は維持
    }
  }

  const handleEnd = async () => {
    setSaving(true)
    try {
      stopRec()
      const startedAt = startedAtRef.current || Date.now()
      const res = await window.api.saveMeeting({
        title: title || '会議',
        startedAt,
        endedAt: Date.now(),
        transcript: transcriptRef.current,
        images: imagesRef.current,
      })
      setStatus(`会議を保存しました（#${res.id}）`)
      // Teleprompter & Overlay を閉じて Dashboard をフォーカス
      window.api.endMeeting()
      // 会議状態をリセット
      setLastResult(null)
      setLastImage(null)
      setBounds(null)
      imagesRef.current = []
      // History画面に自動遷移して、いま保存した会議を先頭に表示
      navigate(`/history?selected=${res.id}`)
    } catch (e) {
      setStatus(`保存失敗: ${(e as Error).message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold tracking-wide">
          Mienaq
        </h1>
        <nav className="flex items-center gap-4 text-sm">
          <Link
            to="/settings"
            className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
          >
            設定
          </Link>
          <Link
            to="/history"
            className="text-sky-300 hover:text-sky-200 underline underline-offset-2"
          >
            履歴
          </Link>
        </nav>
      </header>

      {hasKey === false && (
        <div className="bg-amber-900/30 border border-amber-700/50 text-amber-200 rounded p-4 mb-6 text-sm flex items-center justify-between">
          <span>
            Gemini API キーが未設定です。
            <Link to="/settings" className="underline ml-1 text-amber-100">
              設定から入力
            </Link>
            してください（Google AI Studio で無料発行可）。
          </span>
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-neutral-900 rounded-lg p-5 border border-neutral-800">
          <h2 className="text-sm uppercase tracking-widest text-neutral-400 mb-3">
            会議の準備
          </h2>
          <label className="block text-xs text-neutral-400 mb-1">
            タイトル
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-neutral-800 rounded px-3 py-2 mb-3 text-sm"
            placeholder="例：A社 提案ミーティング"
          />
          <label className="block text-xs text-neutral-400 mb-1">
            追加コンテキスト（任意）
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
            className="w-full bg-neutral-800 rounded px-3 py-2 text-sm mb-3"
            placeholder="相手の背景・譲れない条件・狙いどころ 等"
          />

          <div className="flex gap-2">
            {!isRecording ? (
              <button
                onClick={handleStart}
                disabled={!hasKey}
                className="bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white px-4 py-2 rounded text-sm font-medium"
                title={hasKey ? '' : '先に Gemini API キーを設定してください'}
              >
                Start Meeting
              </button>
            ) : (
              <button
                onClick={handleEnd}
                disabled={saving}
                className="bg-rose-500 hover:bg-rose-400 disabled:opacity-60 text-white px-4 py-2 rounded text-sm font-medium"
              >
                {saving ? '保存中…' : '会議を終了して保存'}
              </button>
            )}
            <button
              onClick={runPushToThink}
              disabled={!bounds || !isRecording}
              className="bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-white px-4 py-2 rounded text-sm"
              title="Cmd+K / Cmd+Ctrl+K / Cmd+Shift+K / F9 のいずれでも可"
            >
              Think (Cmd+K / F9)
            </button>
          </div>

          <label className="mt-3 inline-flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoCoach}
              onChange={toggleAutoCoach}
              className="accent-emerald-400"
            />
            <span>
              Auto Coach — 相手の発話区切りで自動的に 3 パターンを表示
              {autoCoach && (
                <span className="ml-2 text-emerald-300">（ON）</span>
              )}
            </span>
          </label>

          <p className="mt-3 text-xs text-neutral-400">{status}</p>
          {recError && (
            <p className="mt-1 text-xs text-rose-300">録音エラー: {recError}</p>
          )}
        </div>

        <div className="bg-neutral-900 rounded-lg p-5 border border-neutral-800 flex flex-col">
          <h2 className="text-sm uppercase tracking-widest text-neutral-400 mb-3">
            最新のAI回答
          </h2>
          {lastResult ? (
            <div className="space-y-2 flex-1">
              {lastResult.patterns.map((p) => (
                <div
                  key={p.id}
                  className="bg-neutral-800 rounded px-3 py-2 text-sm"
                >
                  <div className="text-xs text-neutral-400">{p.label}</div>
                  <div className="text-neutral-100">{p.text}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-sm flex-1">
              まだありません。会議中に Cmd/Ctrl + K を押してください。
            </p>
          )}

          <h2 className="text-sm uppercase tracking-widest text-neutral-400 mt-4 mb-2">
            最新スクショ
          </h2>
          {lastImage ? (
            <img
              src={lastImage}
              alt="captured region"
              className="rounded border border-neutral-800 max-h-40 object-contain bg-black"
            />
          ) : (
            <p className="text-neutral-500 text-xs">領域指定後に表示されます</p>
          )}
        </div>
      </section>

      <section className="mt-6 bg-neutral-900 rounded-lg p-5 border border-neutral-800">
        <h2 className="text-sm uppercase tracking-widest text-neutral-400 mb-3">
          文字起こしログ（デバッグ）
        </h2>
        <div className="max-h-60 overflow-y-auto bg-black/40 rounded p-3 text-xs space-y-1">
          {transcript.length === 0 ? (
            <p className="text-neutral-500">まだ発言なし</p>
          ) : (
            transcript.slice(-50).map((t, i) => (
              <div key={i} className="text-neutral-300">
                <span
                  className={
                    t.speaker === 'self' ? 'text-sky-300' : 'text-rose-300'
                  }
                >
                  [{t.speaker === 'self' ? '自分' : '相手'}]
                </span>{' '}
                {t.text}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
