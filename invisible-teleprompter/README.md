# invisible-teleprompter

商談中にバレずに使う AI カンペ Mac アプリ。相手のスライドを矩形指定して音声をリアルタイム文字起こしし、`Cmd+K` で Gemini が 20 文字 × 3 案の切り返しを透過ウィンドウに表示する。

---

## 前提条件

- Node.js 20+
- [Deepgram](https://deepgram.com) API キー（無料枠あり）
- [Google AI Studio](https://aistudio.google.com) の Gemini API キー（無料枠あり）

---

## セットアップ

```bash
npm install
cp .env.example .env
```

`.env` に API キーを記入する：

```plaintext
VITE_DEEPGRAM_API_KEY=your_deepgram_key
VITE_GEMINI_API_KEY=your_gemini_key
```

---

## 開発・ビルド

```bash
npm run dev          # 開発サーバー起動
npm run build:mac    # macOS 向けビルド
npm run build:win    # Windows 向けビルド
npm run build:linux  # Linux 向けビルド
npm run lint         # ESLint
npm run typecheck    # TypeScript 型チェック
npm run format       # Prettier フォーマット
```

---

## アーキテクチャ

```
src/
├── main/                   # Electron メインプロセス（Node.js）
│   ├── index.ts            # ウィンドウ管理、IPC、globalShortcut、desktopCapturer
│   └── meetingService.ts   # 会議データの処理・DB 保存ロジック
├── preload/                # contextBridge API 定義
│   └── index.ts            # window.api の公開面を定義
└── renderer/src/           # React アプリ（ブラウザ環境）
    ├── App.tsx             # HashRouter + 4 画面ルート定義
    ├── hooks/              # カスタムフック
    └── components/         # UI コンポーネント
```

---

## 画面構成

| パス | 画面 | 役割 |
|------|------|------|
| `/` | Dashboard | Start Meeting ボタン・設定・議事録一覧へのリンク |
| `/teleprompter` | Teleprompter | 透過・最前面・枠なしのカンペ表示ウィンドウ |
| `/overlay` | Overlay | 全画面暗転 + ドラッグで矩形領域選択 |
| `/history` | History | 過去の議事録一覧・詳細 |

---

## Electron ウィンドウ設定

| ウィンドウ | サイズ | 特記 |
|-----------|--------|------|
| Dashboard | 800×600 | 通常ウィンドウ |
| Teleprompter | 800×200 | `transparent, frame:false, alwaysOnTop, hasShadow:false` |
| Overlay | 全画面 | `transparent, frame:false, alwaysOnTop` |

---

## contextBridge API（`window.api`）

```typescript
startSelection()              // Overlay ウィンドウを開く
finishSelection(bounds)       // 選択座標をメインに送信
captureScreen(bounds)         // 指定矩形のスクリーンショット → base64
sendToTeleprompter(answers)   // カンペ内容を Teleprompter に送信
endMeeting(transcript)        // 会議終了・議事録生成トリガー
```

---

## 主要フック

| フック | 役割 |
|--------|------|
| `useAudioTranscription` | マイク取得 + Deepgram WebSocket 文字起こし |
| `useAiAdvisor` | Gemini 1.5 Flash への問い合わせ・回答取得 |
| `useAudioLevel` | 音声レベルのリアルタイム計測 |
| `useLiveSummary` | 会議中のリアルタイム要約生成 |
| `useRecordingTimer` | 録音時間のカウント |

---

詳細設計・実装チュートリアルは [`../docs/`](../docs/) を参照。
