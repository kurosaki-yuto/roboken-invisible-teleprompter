---
title: 10日間で AI テレプロンプター開発 — MVP 設計書
original: ③10日間でAIテレプロンプター開発.docx
phase: architecture
---

# MVP 設計書：Invisible Teleprompter

Cursor を活用して 10 日間で MVP を構築するための基本設計書＆開発ロードマップ。
マルチモーダル AI とエージェント開発の知見を活かし、処理速度（レイテンシ）の極小化と Cursor でのコード生成がスムーズに進む技術スタックを選定している。

## 1. 技術スタック

| 役割 | 技術 | 選定理由 |
|------|------|---------|
| デスクトップ UI | Electron + React + TypeScript + Tailwind CSS | ブラウザ技術で完結、透過ウィンドウ・デスクトップキャプチャが容易 |
| 音声認識 | Deepgram API (Streaming) | Whisper より圧倒的に低遅延（ミリ秒単位）。リアルタイム要件に必須 |
| AI 推論（リアルタイム） | Gemini 1.5 Flash | 画像＋テキストの高速処理 |
| AI 推論（議事録） | Gemini 1.5 Pro | 高精度な構造化テキスト生成 |
| ローカル DB | SQLite + Prisma | MVP 段階ではサーバー不要。議事録・画像をローカルに安全保存 |

## 2. 画面設計

| 画面 | ルート | 役割 |
|------|--------|------|
| Dashboard | `/` | 過去議事録一覧・検索、「Start Meeting」ボタン |
| Overlay | `/overlay` | Start 時に画面全体を薄暗くし、マウスドラッグで資料エリアを囲む |
| Teleprompter | `/teleprompter` | 常に最前面の透過ウィンドウ。背景透明・文字（箇条書き）のみ浮かび上がる |

## 3. コア機能の処理フロー

### 音声パイプライン

```
PC 出力音声 + マイク音声
  → Deepgram (WebSocket ストリーミング)
  → テキストを一時メモリにプール
```

### 映像パイプライン

```
領域指定された矩形範囲
  → setInterval（5 秒ごと）でスクリーンショット
  → Base64 で保持
```

### Push-to-Think（回答生成）

```
ユーザーがショートカット（Cmd+K / Ctrl+K）を押す
  → 直前 1 分間のテキスト + 最新画像 → Gemini 1.5 Flash
  → システムプロンプトに従い短い回答 3 案を生成
  → Teleprompter ウィンドウに表示
```

### 議事録生成（Auto-Save）

```
会議終了時
  → 全会話テキスト + 重要スライド画像 → Gemini 1.5 Pro
  → Markdown 形式の議事録を生成
  → SQLite に保存
```

## 4. 10 日間開発ロードマップ

### フェーズ 1：土台作り（Day 1〜3）

| Day | 内容 |
|-----|------|
| 1 | Electron + React + Vite のボイラープレート作成。透明ウィンドウ生成ロジック実装 |
| 2 | オーバーレイから座標（x, y, width, height）を取得。`desktopCapturer` で定期スクリーンショット |
| 3 | マイク・システム音声の取得。Deepgram API の WebSocket 接続、リアルタイム文字起こし |

### フェーズ 2：AI 頭脳の結合（Day 4〜7）

| Day | 内容 |
|-----|------|
| 4 | Gemini 1.5 Flash API 組み込み。システムプロンプト調整 |
| 5 | グローバルショートカット登録。キー押下時にテキスト＋画像を Gemini に送り、透過ウィンドウに表示 |
| 6〜7 | 動作安定化・UI 調整。画像送信タイミング、API レスポンス待ち時間の体感調整。文字視認性（シャドウ等）の CSS 調整 |

### フェーズ 3：議事録と仕上げ（Day 8〜10）

| Day | 内容 |
|-----|------|
| 8 | SQLite セットアップ。会議メタデータ・テキスト・画像パスのスキーマ設計 |
| 9 | 会議終了ボタン押下時に全テキスト＋画像を Gemini 1.5 Pro に送り、構造化議事録を DB に保存 |
| 10 | ダッシュボード（議事録閲覧・検索）完成。バグフィックス・パッケージング |

## 5. Electron ウィンドウ設定

| ウィンドウ | 設定 |
|-----------|------|
| Dashboard | 800×600、通常ウィンドウ |
| Teleprompter | 800×200、`transparent: true, frame: false, alwaysOnTop: true, hasShadow: false` |
| Overlay | 全画面サイズ、`transparent: true, frame: false, alwaysOnTop: true` |

## 6. contextBridge API（window.api）

```typescript
startSelection()              // Overlay ウィンドウを開く
finishSelection(bounds)       // 選択座標をメインに送信
captureScreen(bounds)         // 指定矩形のスクリーンショット → base64
sendToTeleprompter(answers)   // カンペ内容を Teleprompter に送信
endMeeting(transcript)        // 会議終了・議事録生成トリガー
```

---

各フェーズの詳細な実装手順は [`../03-build-guide/`](../03-build-guide/) を参照。
