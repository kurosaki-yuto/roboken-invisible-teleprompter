import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const SPRING = { type: 'spring', stiffness: 300, damping: 26 } as const

export default function Teleprompter(): React.JSX.Element {
  const [answers, setAnswers] = useState<string[]>([])
  const [liveLines, setLiveLines] = useState<string[]>([])

  useEffect(() => {
    if (!window.api) return
    const cleanup = window.api.onShowAnswers((incoming) => {
      setAnswers(incoming)
      setTimeout(() => setAnswers([]), 15000)
    })
    return cleanup
  }, [])

  useEffect(() => {
    if (!window.api) return
    const cleanup = window.api.onLiveTranscript((lines) => setLiveLines(lines))
    return cleanup
  }, [])

  return (
    <div className="w-full h-screen flex flex-col bg-transparent">
      {/* AI 提案エリア */}
      <div className="flex-1 flex items-center justify-center px-5">
        <AnimatePresence mode="wait">
          {answers.length === 0 ? (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.25 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <ellipse cx="6.5" cy="6.5" rx="5.5" ry="3.2" stroke="white" strokeWidth="1.1" />
                <circle cx="6.5" cy="6.5" r="1.8" fill="white" />
                <circle cx="6.5" cy="6.5" r="0.7" fill="black" />
              </svg>
              <span className="text-white text-[11px] tracking-[0.18em] uppercase font-medium">
                ⌘K で AI に相談
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="answers"
              initial={{ opacity: 0, scale: 0.92, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: -6 }}
              transition={SPRING}
              className="flex flex-col gap-2 w-full max-w-2xl"
            >
              {answers.map((answer, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...SPRING, delay: i * 0.08 }}
                  className="flex items-center gap-2.5 teleprompter-card px-4 py-2.5"
                >
                  <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 bg-blue-400/90 glow-badge-blue text-[#0a0d1a]">
                    {i + 1}
                  </div>
                  <p className="text-white font-semibold text-base leading-snug">{answer}</p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ライブ議事メモ（常駐字幕） */}
      <AnimatePresence>
        {liveLines.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 0.6, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
            className="px-5 pb-3 flex flex-col gap-0.5"
          >
            {liveLines.map((line, i) => (
              <p
                key={i}
                className={`text-white text-[11px] leading-snug truncate ${i === liveLines.length - 1 ? 'opacity-100' : 'opacity-50'}`}
              >
                {line}
              </p>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
