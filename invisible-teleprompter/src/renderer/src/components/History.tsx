import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

interface MeetingRecord {
  id: number
  title: string
  date: Date
  summary: string
  totalTranscript: string
}

interface MeetingDetail extends MeetingRecord {
  images: { id: number; imagePath: string; timestamp: Date }[]
}

const SPRING = { type: 'spring', stiffness: 280, damping: 26 } as const

const formatDate = (date: Date | string): string => {
  const d = new Date(date)
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
}

export default function History(): React.JSX.Element {
  const [meetings, setMeetings] = useState<MeetingRecord[]>([])
  const [selected, setSelected] = useState<MeetingDetail | null>(null)
  const [loading, setLoading] = useState(typeof window !== 'undefined' && !!window.api)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [zoomedImg, setZoomedImg] = useState<string | null>(null)

  useEffect(() => {
    if (!window.api) return
    window.api.getMeetings().then((data) => {
      setMeetings(data)
      setLoading(false)
    })
  }, [])

  const handleSelect = async (id: number): Promise<void> => {
    if (!window.api) return
    setTranscriptOpen(false)
    const detail = await window.api.getMeeting(id)
    setSelected(detail)
  }

  return (
    <div className="min-h-screen text-white flex flex-col select-none bg-dashboard">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            aria-label="ダッシュボードに戻る"
            className="w-7 h-7 rounded-lg bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] flex items-center justify-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 2.5L3.5 6L7.5 9.5"
                stroke="rgba(255,255,255,0.6)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect
                  x="1"
                  y="1.5"
                  width="9"
                  height="7.5"
                  rx="1.5"
                  stroke="#818cf8"
                  strokeWidth="1.2"
                />
                <line x1="2.5" y1="4" x2="8.5" y2="4" stroke="#818cf8" strokeWidth="1.2" />
                <line x1="2.5" y1="6.5" x2="6" y2="6.5" stroke="#818cf8" strokeWidth="1.2" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white/80">議事録</span>
          </div>
        </div>
        <span className="text-[11px] text-white/30">{meetings.length} 件</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* サイドバー */}
        <div className="w-64 border-r border-white/[0.05] overflow-y-auto flex-shrink-0 backdrop-blur-sm bg-white/[0.015]">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
              ))}
            </div>
          ) : meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <rect
                    x="3"
                    y="4"
                    width="18"
                    height="16"
                    rx="3"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="7"
                    y1="9"
                    x2="17"
                    y2="9"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1.5"
                  />
                  <line
                    x1="7"
                    y1="13"
                    x2="13"
                    y2="13"
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <p className="text-white/30 text-xs text-center">まだ議事録がありません</p>
            </div>
          ) : (
            <div className="py-1">
              {meetings.map((m, i) => (
                <motion.button
                  key={m.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...SPRING, delay: i * 0.04 }}
                  onClick={() => handleSelect(m.id)}
                  className={`w-full text-left px-4 py-3.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset ${
                    selected?.id === m.id
                      ? 'bg-white/[0.08] border-l-2 border-l-indigo-400'
                      : 'hover:bg-white/[0.05] border-l-2 border-l-transparent'
                  }`}
                >
                  <p className="font-medium text-sm truncate text-white/80">{m.title}</p>
                  <p className="text-white/35 text-[11px] mt-0.5 tabular-nums">
                    {formatDate(m.date)}
                  </p>
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* 詳細パネル */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            {!selected ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-full gap-4 py-20"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <rect
                      x="4"
                      y="5"
                      width="20"
                      height="18"
                      rx="3"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="1.5"
                    />
                    <line
                      x1="8"
                      y1="11"
                      x2="20"
                      y2="11"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="1.5"
                    />
                    <line
                      x1="8"
                      y1="15"
                      x2="15"
                      y2="15"
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth="1.5"
                    />
                  </svg>
                </div>
                <p className="text-white/30 text-sm">左の一覧から会議を選択</p>
              </motion.div>
            ) : (
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={SPRING}
                className="space-y-5"
              >
                {/* タイトルブロック */}
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">{selected.title}</h2>
                  <p className="text-white/40 text-xs mt-1 tabular-nums">
                    {formatDate(selected.date)}
                  </p>
                </div>

                {/* AI 要約カード */}
                <div className="backdrop-blur-md bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3.5">
                    <div className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-500/25 flex items-center justify-center">
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <circle cx="5.5" cy="5.5" r="4.5" stroke="#818cf8" strokeWidth="1.2" />
                        <path
                          d="M4 4.6c0-0.8.7-1.6 1.5-1.6s1.5.7 1.5 1.6c0 .6-.4 1.1-.9 1.4L5.5 6.8v.5"
                          stroke="#818cf8"
                          strokeWidth="1.1"
                          strokeLinecap="round"
                        />
                        <circle cx="5.5" cy="8.5" r="0.5" fill="#818cf8" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-semibold text-indigo-400/80 uppercase tracking-[0.12em]">
                      AI 要約
                    </span>
                  </div>
                  <div className="text-sm text-white/65 whitespace-pre-wrap leading-relaxed">
                    {selected.summary || '（要約なし）'}
                  </div>
                </div>

                {/* 全文テキスト（カスタム disclosure） */}
                {selected.totalTranscript && (
                  <div className="backdrop-blur-md bg-white/[0.03] border border-white/[0.06] rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setTranscriptOpen((v) => !v)}
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-inset"
                    >
                      <span className="text-xs font-semibold text-white/55">全文テキスト</span>
                      <motion.svg
                        animate={{ rotate: transcriptOpen ? 180 : 0 }}
                        transition={SPRING}
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                      >
                        <path
                          d="M2 4.5L6 7.5L10 4.5"
                          stroke="rgba(255,255,255,0.35)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </motion.svg>
                    </button>
                    <AnimatePresence>
                      {transcriptOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-4 pt-1 text-xs text-white/45 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto border-t border-white/[0.05]">
                            {selected.totalTranscript}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* スライド画像 */}
                {selected.images && selected.images.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-white/40 uppercase tracking-[0.12em] mb-3">
                      スライド画像 · {selected.images.length} 枚
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {selected.images.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => setZoomedImg(`file://${img.imagePath}`)}
                          className="overflow-hidden rounded-xl border border-white/[0.07] hover:border-white/[0.15] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 group"
                        >
                          <img
                            src={`file://${img.imagePath}`}
                            alt="スライド"
                            className="w-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 画像ズームモーダル */}
      <AnimatePresence>
        {zoomedImg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-8"
            onClick={() => setZoomedImg(null)}
          >
            <motion.img
              src={zoomedImg}
              alt="スライド拡大"
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={SPRING}
              className="max-w-full max-h-full rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
