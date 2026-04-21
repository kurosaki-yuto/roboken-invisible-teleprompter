# Invisible Teleprompter

商談中にバレずに使う AI カンペ デスクトップアプリ（Mac 優先 MVP）。

相手のスライド共有エリアを矩形指定 → 音声をリアルタイム文字起こし → `Cmd+K` で Gemini に投げて 20 文字 × 3 案の切り返しを透過ウィンドウに表示する。

---

## ステータス

| フェーズ | 内容 | 状態 |
|---------|------|------|
| 0 | プロダクト設計 | 完了 |
| 1 | 環境構築・透過ウィンドウ | 完了 |
| 2 | 画面キャプチャ領域指定・UI 分離 | 完了 |
| 3 | 音声取得・Deepgram リアルタイム文字起こし | 完了 |
| 4 | Gemini 連携・Push-to-Think・グローバルショートカット | 完了 |
| 5 | Prisma/SQLite・i18next・Stripe・議事録保存 | 完了 |
| — | **API キー設定・実機テスト** | **次のステップ** |

---

## リポジトリ構成

```
.
├── README.md                      ← このファイル
├── docs/                          ← 全仕様書・チュートリアル（Markdown）
│   ├── README.md                  ← ドキュメント一覧・導線
│   ├── 01-vision/                 ← プロダクトのビジョン
│   ├── 02-architecture/           ← 設計書・技術スタック
│   ├── 03-build-guide/            ← フェーズ別実装チュートリアル（phase-1〜5）
│   └── 04-business/               ← 事業計画・課金・多言語化
└── invisible-teleprompter/        ← アプリ本体（Electron + React + TypeScript）
    ├── src/
    │   ├── main/                  ← Electron メインプロセス
    │   ├── preload/               ← contextBridge API 定義
    │   └── renderer/src/          ← React アプリ
    ├── prisma/                    ← DB スキーマ（SQLite）
    └── README.md                  ← 開発手順・アーキテクチャ詳細
```

---

## クイックスタート

```bash
cd invisible-teleprompter
npm install
cp .env.example .env  # API キーを .env に記入する
npm run dev
```

必要な API キー（`.env` に設定）:

| 変数名 | 取得先 |
|--------|--------|
| `VITE_DEEPGRAM_API_KEY` | [Deepgram](https://deepgram.com)（無料枠あり） |
| `VITE_GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com)（無料枠あり） |

---

## ドキュメント索引

| 読みたい内容 | リンク |
|------------|--------|
| これは何のアプリか？ | [docs/01-vision/01-concept.md](docs/01-vision/01-concept.md) |
| どう動くのか？（設計） | [docs/02-architecture/mvp-design.md](docs/02-architecture/mvp-design.md) |
| 実装を最初から追いたい | [docs/03-build-guide/phase-1-transparent-window.md](docs/03-build-guide/phase-1-transparent-window.md) |
| 事業計画・課金設計 | [docs/04-business/01-saas-plan.md](docs/04-business/01-saas-plan.md) |
| 全ドキュメント一覧 | [docs/README.md](docs/README.md) |

---

## コントリビューション

- コミット規約: `feat: xxx`, `fix: xxx`, `docs: xxx`, `refactor: xxx`
- ブランチ: `main`（直接コミット可）→ 安定後は `main` / `develop` 運用を検討
- 環境変数（`.env`）はコミットしない（`.gitignore` 設定済み）
