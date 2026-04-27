import React, { useEffect, useRef, useState } from 'react'

interface Point {
  x: number
  y: number
}

// フルスクリーン半透明オーバーレイ。マウスドラッグで矩形を作り、
// マウスアップで main に座標を渡して閉じる。Esc で中止。
export default function Overlay() {
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        window.api.cancelSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDown = (e: React.MouseEvent) => {
    dragging.current = true
    setStart({ x: e.clientX, y: e.clientY })
    setCurrent({ x: e.clientX, y: e.clientY })
  }
  const onMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    setCurrent({ x: e.clientX, y: e.clientY })
  }
  const onUp = () => {
    if (!dragging.current || !start || !current) return
    dragging.current = false
    const bounds = rectOf(start, current)
    if (bounds.width < 10 || bounds.height < 10) {
      // 小さすぎる場合は無視
      setStart(null)
      setCurrent(null)
      return
    }
    window.api.finishSelection(bounds)
  }

  const rect = start && current ? rectOf(start, current) : null

  return (
    <div
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      className="fixed inset-0 cursor-crosshair select-none"
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      {rect && (
        <div
          className="absolute border-2 border-sky-400"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.2)',
            background: 'rgba(56, 189, 248, 0.08)',
          }}
        />
      )}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-white text-sm">
        相手の画面共有エリアをドラッグで囲んでください（Esc でキャンセル）
      </div>
    </div>
  )
}

function rectOf(a: Point, b: Point) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const width = Math.abs(a.x - b.x)
  const height = Math.abs(a.y - b.y)
  return { x, y, width, height }
}
