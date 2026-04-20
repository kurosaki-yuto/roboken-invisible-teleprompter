import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const SPRING = { type: 'spring', stiffness: 260, damping: 26 } as const

export default function Settings(): React.JSX.Element {
  const [userContext, setUserContext] = useState('')
  const [mode, setMode] = useState<'seller' | 'buyer'>('seller')

  useEffect(() => {
    if (!window.api) return
    window.api.getSetting('userContext').then((saved) => setUserContext(saved))
    window.api.getSetting('mode').then((saved) => {
      if (saved === 'buyer' || saved === 'seller') setMode(saved)
    })
  }, [])

  const updateMode = (next: 'seller' | 'buyer'): void => {
    setMode(next)
    window.api.setSetting('mode', next)
  }

  return (
    <div className="h-screen text-white flex flex-col overflow-hidden select-none bg-dashboard">
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] flex-shrink-0 backdrop-blur-sm">
        <Link
          to="/"
          aria-label="ダッシュボードに戻る"
          className="flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/85 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-md px-1"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M8.5 3L4.5 7L8.5 11"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          戻る
        </Link>
        <span className="text-sm font-semibold tracking-tight text-white/80">設定</span>
        <span className="w-8" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={SPRING}
        className="flex-1 overflow-y-auto px-5 py-6 flex flex-col gap-6"
      >
        {/* モード選択 */}
        <section className="flex flex-col gap-2">
          <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.12em]">
            商談の立場
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateMode('seller')}
              className={`flex flex-col items-start gap-1.5 p-4 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] ${
                mode === 'seller'
                  ? 'bg-blue-600/20 border-blue-500/40 shadow-[0_4px_20px_rgba(59,130,246,0.2)]'
                  : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-sm font-semibold text-white">売り手</span>
              <span className="text-[11px] text-white/50 leading-snug">提案・切り返し・確認点</span>
            </button>
            <button
              onClick={() => updateMode('buyer')}
              className={`flex flex-col items-start gap-1.5 p-4 rounded-2xl border text-left transition-all duration-200 active:scale-[0.98] ${
                mode === 'buyer'
                  ? 'bg-amber-600/20 border-amber-500/40 shadow-[0_4px_20px_rgba(245,158,11,0.2)]'
                  : 'bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-sm font-semibold text-white">買い手</span>
              <span className="text-[11px] text-white/50 leading-snug">
                質問・懸念点・断りフレーズ
              </span>
            </button>
          </div>
        </section>

        {/* 背景情報 */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-white/40 uppercase tracking-[0.12em]">
              背景情報（任意）
            </h2>
            <span className="text-[10px] text-white/30">空欄でもOK</span>
          </div>
          <textarea
            value={userContext}
            onChange={(e) => setUserContext(e.target.value)}
            onBlur={() => window.api.setSetting('userContext', userContext)}
            placeholder="書かなくても動きます。書くと AI のヒント精度が上がります。&#10;例：弊社は SaaS 型の在庫管理システム。最低契約期間 6 ヶ月。"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-3 text-sm text-white/75 placeholder-white/25 resize-none focus:outline-none focus:border-white/20 focus-visible:ring-2 focus-visible:ring-white/15 leading-relaxed"
            rows={6}
          />
          <p className="text-[11px] text-white/35 leading-relaxed">
            ここに書いた内容は AI に毎回渡されます。自動保存。
          </p>
        </section>
      </motion.div>
    </div>
  )
}
