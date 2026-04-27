import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { MeetingSummary } from '../../../types/ipc'

export default function History() {
  const [list, setList] = useState<MeetingSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<MeetingSummary | null>(null)
  const location = useLocation()

  useEffect(() => {
    void (async () => {
      try {
        const items = await window.api.listMeetings()
        setList(items)
        // URL ?selected=ID があればその会議を自動選択（保存直後にDashboardから遷移してきた場合）
        const m = location.search.match(/[?&]selected=(\d+)/)
        if (m) {
          const id = Number(m[1])
          const found = items.find((x) => x.id === id)
          if (found) setSelected(found)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [location.search])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.transcript.toLowerCase().includes(q) ||
        m.summaryMarkdown.toLowerCase().includes(q),
    )
  }, [list, query])

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">議事録履歴</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => void window.api.openArchiveFolder()}
            className="text-sm text-neutral-200 bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded"
            title="~/Documents/Mienaq/ を開く"
          >
            保存フォルダを開く
          </button>
          <Link
            to="/"
            className="text-sm text-sky-300 hover:text-sky-200 underline underline-offset-2"
          >
            ← Dashboard
          </Link>
        </div>
      </header>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="タイトル・本文で検索"
        className="w-full bg-neutral-900 rounded px-3 py-2 mb-4 text-sm border border-neutral-800"
      />

      {loading ? (
        <p className="text-neutral-500 text-sm">読み込み中…</p>
      ) : filtered.length === 0 ? (
        <p className="text-neutral-500 text-sm">該当する会議がありません</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-2">
            {filtered.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`w-full text-left bg-neutral-900 border rounded p-3 hover:bg-neutral-800 ${
                  selected?.id === m.id
                    ? 'border-sky-500'
                    : 'border-neutral-800'
                }`}
              >
                <div className="text-sm font-medium">{m.title}</div>
                <div className="text-xs text-neutral-400">
                  {new Date(m.date).toLocaleString('ja-JP')}
                </div>
                <div className="text-xs text-neutral-500">
                  {Math.round(m.durationMs / 60000)} 分 / 画像{' '}
                  {m.imagePaths.length}枚
                </div>
              </button>
            ))}
          </div>
          <div className="md:col-span-2">
            {selected ? (
              <div className="bg-neutral-900 border border-neutral-800 rounded p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2 className="text-lg font-semibold">{selected.title}</h2>
                  {selected.folderPath && (
                    <button
                      onClick={() =>
                        void window.api.revealInFolder(selected.folderPath)
                      }
                      className="shrink-0 text-xs bg-sky-500 hover:bg-sky-400 text-white px-3 py-1.5 rounded"
                      title={selected.folderPath}
                    >
                      Finder で開く
                    </button>
                  )}
                </div>
                <p className="text-xs text-neutral-500 mb-4">
                  {new Date(selected.date).toLocaleString('ja-JP')} /{' '}
                  {Math.round(selected.durationMs / 60000)}分
                </p>
                <h3 className="text-sm text-neutral-400 uppercase tracking-widest mb-2">
                  サマリー
                </h3>
                <pre className="whitespace-pre-wrap text-sm text-neutral-200 bg-black/40 rounded p-3 mb-4">
                  {selected.summaryMarkdown || '（未生成）'}
                </pre>
                <h3 className="text-sm text-neutral-400 uppercase tracking-widest mb-2">
                  文字起こし
                </h3>
                <pre className="whitespace-pre-wrap text-xs text-neutral-300 bg-black/40 rounded p-3 max-h-96 overflow-y-auto">
                  {selected.transcript}
                </pre>
              </div>
            ) : (
              <p className="text-neutral-500 text-sm">
                左のリストから会議を選んでください
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
