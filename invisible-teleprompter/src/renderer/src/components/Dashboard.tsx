import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAudioTranscription } from '../hooks/useAudioTranscription'
import { useAiAdvisor } from '../hooks/useAiAdvisor'
import { useLiveSummary } from '../hooks/useLiveSummary'
import { useRecordingTimer } from '../hooks/useRecordingTimer'
import { useAudioLevel } from '../hooks/useAudioLevel'
import WaveformBars from './WaveformBars'
import TranscriptBubble from './TranscriptBubble'

const SPRING_SMOOTH = { type: 'spring', stiffness: 260, damping: 26 } as const
const SPRING_SNAPPY = { type: 'spring', stiffness: 340, damping: 28 } as const

export default function Dashboard(): React.JSX.Element {
  const [status, setStatus] = useState<'idle' | 'selecting' | 'active' | 'saving'>('idle')
  const [capturedImages, setCapturedImages] = useState<string[]>([])
  const [userContext, setUserContext] = useState('')
  const [zoomCountdown, setZoomCountdown] = useState<number | null>(null)
  const [mode, setMode] = useState<'seller' | 'buyer'>('seller')
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  const {
    transcript,
    interimText,
    startRecording,
    stopRecording,
    error: audioError
  } = useAudioTranscription()
  const { askAi, isThinking, error: aiError } = useAiAdvisor(userContext, mode)
  const { points, isSummarizing } = useLiveSummary(transcript, status === 'active')
  const { elapsedSeconds, formattedTime, startTimer, stopTimer } = useRecordingTimer()
  const { levels, startLevel, stopLevel } = useAudioLevel()

  const handleStartMeeting = async (): Promise<void> => {
    setZoomCountdown(null)
    setCapturedImages([])
    window.api.skipSelection()
    await startRecording()
    startTimer()
    await startLevel()
    setStatus('active')
  }

  const handleThink = async (): Promise<void> => {
    const imageBase64 = await window.api.captureScreen()
    if (imageBase64) setCapturedImages((prev) => [...prev, imageBase64])
    await askAi(transcript, imageBase64)
  }

  const handleEndMeeting = (): void => {
    const duration = elapsedSeconds
    stopRecording()
    stopTimer()
    stopLevel()
    setStatus('saving')
    window.api.endMeeting(transcript.join('\n'), capturedImages, duration)
  }

  useEffect(() => {
    if (!window.api) return
    window.api.getSetting('userContext').then((saved) => setUserContext(saved))
    window.api.getSetting('mode').then((saved) => {
      if (saved === 'buyer' || saved === 'seller') setMode(saved)
    })
  }, [])

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, interimText])

  useEffect(() => {
    if (status !== 'active' || !window.api) return
    const cleanup = window.api.onTriggerThink(() => handleThink())
    return cleanup
  }, [status, transcript]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!window.api) return
    const cleanup = window.api.onMeetingSaved(() => setStatus('idle'))
    return cleanup
  }, [])

  useEffect(() => {
    if (!window.api) return
    const cleanup = window.api.onZoomDetected(() => {
      if (status === 'idle') setZoomCountdown(3)
    })
    return cleanup
  }, [status])

  // Zoom 検知カウントダウン: 3→2→1→自動開始
  useEffect(() => {
    if (zoomCountdown === null) return
    if (zoomCountdown <= 0) {
      // setTimeout(0) defers setState calls out of the effect body
      const id = setTimeout(() => handleStartMeeting(), 0)
      return () => clearTimeout(id)
    }
    const t = setTimeout(() => setZoomCountdown((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
  }, [zoomCountdown]) // eslint-disable-line react-hooks/exhaustive-deps

  // active 中、最新文字起こしを Teleprompter に常駐表示
  useEffect(() => {
    if (status !== 'active' || !window.api) return
    const recent = transcript.slice(-2)
    if (interimText) recent.push(interimText + '…')
    window.api.sendLiveTranscript(recent)
  }, [transcript, interimText, status])

  // transcript 新行追加で自動 AI 提案（12秒 debounce）
  useEffect(() => {
    if (status !== 'active' || transcript.length === 0 || isThinking) return
    const t = setTimeout(() => handleThink(), 12000)
    return () => clearTimeout(t)
  }, [transcript.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const error = audioError ?? aiError

  return (
    <div className="h-screen text-white flex flex-col overflow-hidden select-none relative bg-dashboard">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-red-500/15 border border-red-500/25 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <ellipse cx="7" cy="7" rx="6" ry="3.5" stroke="#f87171" strokeWidth="1.2" />
              <circle cx="7" cy="7" r="2" fill="#f87171" />
              <circle cx="7" cy="7" r="0.8" fill="rgba(10,13,30,1)" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white/80">
            Invisible Teleprompter
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/settings"
            aria-label="設定を開く"
            className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/65 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md px-1"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M6.5 1v1.5M6.5 10.5V12M1 6.5h1.5M10.5 6.5H12M2.6 2.6l1.06 1.06M9.34 9.34l1.06 1.06M2.6 10.4l1.06-1.06M9.34 3.66l1.06-1.06"
                stroke="currentColor"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            </svg>
            設定
          </Link>
          <Link
            to="/history"
            aria-label="議事録一覧を開く"
            className="flex items-center gap-1.5 text-[11px] text-white/35 hover:text-white/65 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md px-1"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect
                x="1"
                y="2"
                width="10"
                height="8"
                rx="1.5"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <line x1="3" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="3" y1="7.5" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
            議事録
          </Link>
        </div>
      </div>

      {/* メインエリア */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {/* ── Idle ── */}
          {status === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={SPRING_SMOOTH}
              className="flex-1 flex flex-col items-center justify-center gap-6 px-5 pb-8 overflow-y-auto"
            >
              {/* Zoom 検知カウントダウン */}
              <AnimatePresence>
                {zoomCountdown !== null && (
                  <motion.div
                    key="zoom-countdown"
                    initial={{ opacity: 0, y: -16, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.96 }}
                    transition={SPRING_SNAPPY}
                    className="w-full max-w-sm backdrop-blur-xl bg-green-950/60 border border-green-500/30 rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 flex-shrink-0 shadow-[0_4px_24px_rgba(0,0,0,0.3)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-lg font-bold text-green-300 tabular-nums">
                          {zoomCountdown}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-green-200">
                          Zoom 検知。自動で開始します
                        </p>
                        <p className="text-[11px] text-green-400/70 mt-0.5">
                          {zoomCountdown} 秒後に録音＋AI起動
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setZoomCountdown(null)}
                      aria-label="自動開始をキャンセル"
                      className="text-[11px] font-semibold text-white/50 hover:text-white/85 bg-white/[0.05] hover:bg-white/[0.10] px-3 py-1.5 rounded-lg transition-all duration-200 active:scale-95 flex-shrink-0"
                    >
                      キャンセル
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 巨大録音ボタン */}
              <button
                onClick={handleStartMeeting}
                aria-label="録音を開始"
                className="relative group flex-shrink-0 focus-visible:outline-none"
              >
                <span className="absolute inset-0 rounded-full bg-red-500/25 animate-ping" />
                <span className="absolute inset-2 rounded-full bg-red-500/15 animate-ping animation-delay-150" />
                <div className="relative w-32 h-32 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 transition-all duration-200 flex items-center justify-center shadow-record-idle group-hover:shadow-record-hover">
                  <div className="w-9 h-9 rounded-full bg-white/[0.95]" />
                </div>
              </button>

              <div className="text-center flex-shrink-0">
                <p className="text-xl font-bold text-white tracking-tight">タップして開始</p>
                <p className="text-sm text-white/45 mt-1.5">Zoom を開くと自動で始まります</p>
              </div>

              {/* モードインジケータ（タップで設定へ） */}
              <Link
                to="/settings"
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all duration-200 active:scale-95 ${
                  mode === 'seller'
                    ? 'bg-blue-600/15 border-blue-500/25 text-blue-300 hover:bg-blue-600/25'
                    : 'bg-amber-600/15 border-amber-500/25 text-amber-300 hover:bg-amber-600/25'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {mode === 'seller' ? '売り手モード' : '買い手モード'}
                <span className="text-white/30 ml-0.5">›</span>
              </Link>
            </motion.div>
          )}

          {/* ── Selecting ── */}
          {status === 'selecting' && (
            <motion.div
              key="selecting"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SMOOTH}
              className="flex-1 flex flex-col items-center justify-center gap-4"
            >
              <motion.div
                animate={{ scale: [1, 1.04, 1] }}
                transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center"
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <rect
                    x="3"
                    y="3"
                    width="9"
                    height="9"
                    rx="2"
                    stroke="#fbbf24"
                    strokeWidth="1.8"
                    strokeDasharray="3 2"
                  />
                  <rect
                    x="16"
                    y="3"
                    width="9"
                    height="9"
                    rx="2"
                    stroke="#fbbf24"
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                    opacity="0.4"
                  />
                  <rect
                    x="3"
                    y="16"
                    width="9"
                    height="9"
                    rx="2"
                    stroke="#fbbf24"
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                    opacity="0.4"
                  />
                  <rect
                    x="16"
                    y="16"
                    width="9"
                    height="9"
                    rx="2"
                    stroke="#fbbf24"
                    strokeWidth="1.2"
                    strokeDasharray="3 2"
                    opacity="0.4"
                  />
                </svg>
              </motion.div>
              <div className="text-center">
                <p className="text-yellow-400 font-semibold tracking-tight">
                  相手のスライドエリアを選択
                </p>
                <p className="text-white/38 text-sm mt-1">ドラッグで囲んでください</p>
              </div>
            </motion.div>
          )}

          {/* ── Active ── */}
          {status === 'active' && (
            <motion.div
              key="active"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING_SMOOTH}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* 録音バー */}
              <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/[0.05] flex-shrink-0 backdrop-blur-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-rec-glow" />
                  <span className="text-xs font-semibold text-red-400 tracking-[0.15em] uppercase">
                    Rec
                  </span>
                  <span className="text-sm font-mono text-white/70 ml-0.5 tabular-nums">
                    {formattedTime}
                  </span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                      mode === 'seller'
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {mode === 'seller' ? '売り手' : '買い手'}
                  </span>
                </div>
                <button
                  onClick={handleEndMeeting}
                  aria-label="録音を終了"
                  className="text-xs text-white/40 hover:text-white/80 bg-white/[0.05] hover:bg-white/[0.10] px-3 py-1.5 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                >
                  終了
                </button>
              </div>

              {/* 波形エリア */}
              <div className="flex-shrink-0 flex items-center justify-center py-4 border-b border-white/[0.04] bg-gradient-to-b from-white/[0.015] to-transparent">
                <WaveformBars levels={levels} active />
              </div>

              {/* ライブ要約パネル */}
              {(points.length > 0 || isSummarizing) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={SPRING_SMOOTH}
                  className="flex-shrink-0 mx-4 mt-3 backdrop-blur-md bg-indigo-500/[0.07] border border-indigo-500/20 rounded-2xl px-3.5 py-3"
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${isSummarizing ? 'bg-indigo-400 animate-pulse' : 'bg-indigo-500/60'}`}
                    />
                    <span className="text-[10px] font-semibold text-indigo-400/80 uppercase tracking-[0.12em]">
                      いま話してること
                    </span>
                  </div>
                  {isSummarizing && points.length === 0 ? (
                    <p className="text-xs text-indigo-300/40">要約中...</p>
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {points.map((point, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-indigo-200/65">
                          <span className="text-indigo-500/50 mt-0.5 flex-shrink-0">·</span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              )}

              {/* 文字起こしフィード */}
              <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
                {transcript.length === 0 && !interimText ? (
                  <p className="text-white/28 text-sm text-center py-8">音声を待機中...</p>
                ) : (
                  transcript.map((line, i) => (
                    <TranscriptBubble
                      key={i}
                      text={line}
                      index={i}
                      isLatest={i === transcript.length - 1 && !interimText}
                    />
                  ))
                )}
                {/* interim ライブカード */}
                {interimText && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SPRING_SNAPPY}
                    className="flex justify-start"
                  >
                    <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tl-sm text-sm leading-relaxed text-white/55 bg-white/[0.04] border border-white/[0.08] italic">
                      {interimText}
                      <span className="inline-block w-[2px] h-3 ml-0.5 bg-white/45 animate-pulse align-middle" />
                    </div>
                  </motion.div>
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* 巨大AI相談ボタン */}
              <div className="flex-shrink-0 px-4 py-3 border-t border-white/[0.05]">
                <button
                  onClick={handleThink}
                  disabled={isThinking}
                  aria-label="AI に相談する"
                  className={`w-full flex items-center justify-center gap-3 font-bold text-lg py-4 rounded-2xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/40 ${
                    isThinking
                      ? 'bg-white/[0.05] text-white/35 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-ai-btn hover:shadow-[0_12px_32px_rgba(139,92,246,0.5)] active:scale-[0.98]'
                  }`}
                >
                  {isThinking ? (
                    <>
                      <svg
                        className="animate-spin"
                        width="20"
                        height="20"
                        viewBox="0 0 14 14"
                        fill="none"
                      >
                        <circle
                          cx="7"
                          cy="7"
                          r="5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeDasharray="8 8"
                        />
                      </svg>
                      考え中...
                    </>
                  ) : (
                    <>
                      <svg width="22" height="22" viewBox="0 0 14 14" fill="none">
                        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.4" />
                        <path
                          d="M5 5.2c0-1.1.9-2 2-2s2 .9 2 2c0 .8-.5 1.5-1.2 1.8L7 7.8v.7"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                        />
                        <circle cx="7" cy="10" r="0.6" fill="currentColor" />
                      </svg>
                      AI に聞く
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Saving ── */}
          {status === 'saving' && (
            <motion.div
              key="saving"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={SPRING_SMOOTH}
              className="flex-1 flex flex-col items-center justify-center gap-5"
            >
              <div className="relative w-14 h-14">
                <svg
                  className="animate-spin w-full h-full -rotate-90"
                  viewBox="0 0 56 56"
                  fill="none"
                >
                  <circle cx="28" cy="28" r="22" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
                  <circle
                    cx="28"
                    cy="28"
                    r="22"
                    stroke="url(#saveGrad)"
                    strokeWidth="4"
                    strokeDasharray="30 110"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="saveGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#818cf8" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-white tracking-tight">議事録を生成中</p>
                <p className="text-sm text-white/40 mt-1">AI が会話を要約しています...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* エラー */}
      <AnimatePresence>
        {error && (
          <motion.div
            role="alert"
            aria-live="polite"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={SPRING_SNAPPY}
            className="flex-shrink-0 mx-4 mb-3 backdrop-blur-md bg-red-900/20 border border-red-500/25 rounded-2xl px-4 py-2.5 text-red-400 text-xs"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
