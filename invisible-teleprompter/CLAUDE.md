# Invisible Teleprompter — CLAUDE.md

## プロダクト概要

商談中にバレずに使う AI カンペ デスクトップアプリ（Mac 優先 MVP）。
相手のスライド共有エリアを矩形指定 → 音声をリアルタイム文字起こし →
Cmd+K で Gemini に投げて 20 文字 × 3 案の切り返しを透過ウィンドウに表示。

## 技術スタック（変更禁止）

- **デスクトップ**: Electron（electron-vite テンプレ）
- **フロント**: React + TypeScript + Tailwind CSS v4
- **ルーティング**: react-router-dom（HashRouter）
- **音声認識**: Deepgram nova-2（WebSocket、react-use-websocket）
- **AI 推論**: Gemini 1.5 Flash（リアルタイム）/ Gemini 1.5 Pro（議事録）
- **アニメーション**: Framer Motion
- **DB**: SQLite + Prisma（フェーズ 5 以降）

## ディレクトリ構造

```
src/
├── main/          # Electron メインプロセス（Node.js）
│   └── index.ts
├── preload/       # contextBridge API 定義
│   └── index.ts
└── renderer/      # React アプリ（ブラウザ）
    └── src/
        ├── App.tsx         # HashRouter + 3 画面ルート
        ├── hooks/          # カスタムフック
        ├── components/     # UI コンポーネント
        └── assets/
            └── main.css    # Tailwind エントリ
```

## 画面構成（HashRouter ルート）

| パス            | 名前         | 役割                                       |
| --------------- | ------------ | ------------------------------------------ |
| `/`             | Dashboard    | Start Meeting ボタン、議事録一覧へのリンク |
| `/teleprompter` | Teleprompter | 透過・最前面・枠なしのカンペ表示ウィンドウ |
| `/overlay`      | Overlay      | 全画面暗転 + ドラッグで矩形領域選択        |
| `/history`      | History      | 過去の議事録一覧・詳細（フェーズ 5 以降）  |

## Electron ウィンドウ設定

- **Dashboard**: 800×600、通常ウィンドウ
- **Teleprompter**: 800×200、`transparent:true, frame:false, alwaysOnTop:true, hasShadow:false`
- **Overlay**: 全画面サイズ、`transparent:true, frame:false, alwaysOnTop:true`

## contextBridge API（window.api）

```typescript
startSelection() // Overlay ウィンドウを開く
finishSelection(bounds) // 選択座標をメインに送信
captureScreen(bounds) // 指定矩形のスクリーンショット → base64
sendToTeleprompter(answers) // カンペ内容を Teleprompter に送信
endMeeting(transcript) // 会議終了・議事録生成トリガー
```

## コーディング規約

- React は関数コンポーネント + Hooks のみ
- スタイルは Tailwind CSS クラスで記述（インライン style は禁止）
- カスタムフックは `src/renderer/src/hooks/` に配置
- メインプロセスのロジックは `src/main/index.ts` に集約（別ファイル分割は必要になるまで不要）
- 環境変数は `import.meta.env.VITE_XXX` で参照（VITE\_ プレフィックス必須）

## システムプロンプト（Push-to-Think）

```
あなたは百戦錬磨のビジネス軍師です。
提示された会話ログと資料画像から、相手の意図を読み、
次に話すべき「知的で人間味のある回答・提案」を3つ、
各20文字以内の箇条書きで出力してください
```

## 環境変数

`.env.example` を参照。本番キーは `.env` に配置（.gitignore 済み）。
