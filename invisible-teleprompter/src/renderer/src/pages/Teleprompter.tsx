import React, { useEffect, useState } from 'react'
import type { PushToThinkResult } from '../../../types/ipc'

// 透過ウィンドウ：画面上部に 3 パターン（論破 / 同調＋提案 / 質問返し）を大きな白字で表示。
export default function Teleprompter() {
  const [result, setResult] = useState<PushToThinkResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const off = window.api.onPatternsUpdated((r) => {
      // partial=true（Claude deep のストリーム中）でも 1 件揃った時点で loading は外す
      setResult(r)
      setLoading(false)
    })
    return off
  }, [])

  // Cmd+K が main 側で踏まれた瞬間、Dashboard が push-to-think を叩き始めるので、
  // Teleprompter 側は EV_TRIGGER_THINK を受けて loading 表示だけする。
  useEffect(() => {
    const off = window.api.onTriggerThink(() => {
      setLoading(true)
      setVisible(true)
    })
    return off
  }, [])

  if (!visible) return null

  return (
    <div className="teleprompter-root h-full w-full flex flex-col relative">
      {/* ドラッグハンドル：このバーを掴んで移動 */}
      <div className="teleprompter-drag-handle">
        ドラッグで移動 ・ 右下で拡大縮小 ・ 画面共有には映りません
      </div>

      {/* 本体：AI回答表示エリア */}
      <div className="flex-1 flex items-center justify-center px-6 py-3">
        {loading && !result ? (
          <div className="teleprompter-text text-2xl tracking-wider">
            考え中…
          </div>
        ) : result ? (
          <div className="flex w-full gap-4 justify-between">
            {result.patterns.map((p) => (
              <div key={p.id} className="flex-1 min-w-0">
                <div className="teleprompter-text text-xs opacity-80 mb-1">
                  {p.label}
                </div>
                <div className="teleprompter-text text-xl font-semibold leading-snug break-words">
                  {p.text}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="teleprompter-text text-sm opacity-70">
            Cmd+K / F9 で AI に相談
          </div>
        )}
      </div>

      {/* 右下のリサイズヒント表示 */}
      <div className="teleprompter-resize-hint" />
    </div>
  )
}
