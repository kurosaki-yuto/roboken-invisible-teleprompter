import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface DragState {
  startX: number
  startY: number
  currentX: number
  currentY: number
  isDragging: boolean
}

const SPRING = { type: 'spring', stiffness: 320, damping: 28 } as const

export default function Overlay(): React.JSX.Element {
  const [drag, setDrag] = useState<DragState>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    isDragging: false
  })
  const [done, setDone] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.skipSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const getRectStyle = (): { left: number; top: number; width: number; height: number } => {
    const left = Math.min(drag.startX, drag.currentX)
    const top = Math.min(drag.startY, drag.currentY)
    const width = Math.abs(drag.currentX - drag.startX)
    const height = Math.abs(drag.currentY - drag.startY)
    return { left, top, width, height }
  }

  const handleMouseDown = (e: React.MouseEvent): void => {
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      isDragging: true
    })
  }

  const handleMouseMove = (e: React.MouseEvent): void => {
    if (!drag.isDragging) return
    setDrag((prev) => ({ ...prev, currentX: e.clientX, currentY: e.clientY }))
  }

  const handleMouseUp = (): void => {
    if (!drag.isDragging) return
    const rect = getRectStyle()

    if (rect.width < 20 || rect.height < 20) {
      setDrag((prev) => ({ ...prev, isDragging: false }))
      return
    }

    setDone(true)
    window.api.finishSelection({
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    })
  }

  const rectStyle = getRectStyle()

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black/60 cursor-crosshair select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* ガイド UI（ドラッグ前） */}
      <AnimatePresence>
        {!drag.isDragging && !done && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={SPRING}
            className="absolute inset-0 flex flex-col items-center justify-center gap-5 pointer-events-none"
          >
            {/* アイコン */}
            <div className="w-16 h-16 rounded-2xl backdrop-blur-sm bg-white/10 border border-white/20 flex items-center justify-center">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="4" width="10" height="10" rx="2" stroke="white" strokeWidth="2" />
                <rect
                  x="18"
                  y="4"
                  width="10"
                  height="10"
                  rx="2"
                  stroke="white"
                  strokeWidth="1.5"
                  opacity="0.4"
                />
                <rect
                  x="4"
                  y="18"
                  width="10"
                  height="10"
                  rx="2"
                  stroke="white"
                  strokeWidth="1.5"
                  opacity="0.4"
                />
                <rect
                  x="18"
                  y="18"
                  width="10"
                  height="10"
                  rx="2"
                  stroke="white"
                  strokeWidth="1.5"
                  opacity="0.4"
                />
                <path
                  d="M10 10 L22 22"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  opacity="0.6"
                />
              </svg>
            </div>

            {/* テキスト */}
            <div className="text-center">
              <p className="text-white text-2xl font-bold tracking-tight text-shadow-overlay">
                相手のスライドエリアを囲む
              </p>
              <p className="text-white/55 text-sm mt-2 text-shadow-overlay">
                Zoom や Meet で共有されている画面の上をドラッグしてください
              </p>
            </div>

            {/* スキップボタン */}
            <button
              onClick={() => window.api.skipSelection()}
              className="pointer-events-auto mt-2 text-sm text-white/40 hover:text-white/70 backdrop-blur-sm bg-white/[0.06] hover:bg-white/[0.10] px-4 py-2 rounded-xl transition-all duration-200 border border-white/[0.10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            >
              スライドなしでスキップ
              <span className="ml-2 text-white/25 text-xs font-mono">Esc</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 選択中の矩形（position は dynamic なので inline style 必須） */}
      {drag.isDragging && rectStyle.width > 0 && (
        <div
          className="absolute border-2 border-blue-400 pointer-events-none"
          style={{
            left: rectStyle.left,
            top: rectStyle.top,
            width: rectStyle.width,
            height: rectStyle.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
            background: 'rgba(96,165,250,0.05)'
          }}
        >
          {/* サイズ表示 */}
          <span className="absolute -top-7 left-0 text-blue-300 text-[11px] font-mono backdrop-blur-sm bg-black/50 px-2 py-0.5 rounded-md">
            {Math.round(rectStyle.width)} × {Math.round(rectStyle.height)}
          </span>
          {/* 4 隅のハンドル */}
          {['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'].map((pos) => (
            <div
              key={pos}
              className={`absolute w-3 h-3 bg-blue-400 rounded-sm -translate-x-1/2 -translate-y-1/2 ${pos}`}
            />
          ))}
        </div>
      )}

      {/* 選択完了 */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={SPRING}
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
          >
            <div className="backdrop-blur-xl bg-green-500/20 border border-green-500/40 rounded-2xl px-6 py-3 text-green-300 text-sm font-semibold flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle
                  cx="7"
                  cy="7"
                  r="6"
                  fill="rgba(74,222,128,0.2)"
                  stroke="rgba(74,222,128,0.6)"
                  strokeWidth="1.2"
                />
                <path
                  d="M4.5 7L6.2 8.7L9.5 5"
                  stroke="rgba(134,239,172,0.9)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              エリアを設定しました
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
