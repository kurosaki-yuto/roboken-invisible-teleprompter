---
title: フェーズ 1：環境構築と透過ウィンドウの基礎
original: ⑦Cursor開発：透過ウィンドウ基礎構築.docx
phase: build-guide
---

# フェーズ 1：環境構築と透過ウィンドウの基礎

「枠組み」を作り、「透明なカンペ」ウィンドウを表示させるところまで進める。

## 全体ロードマップ

| フェーズ | 内容 |
|---------|------|
| **1** | プロジェクト作成と透過ウィンドウの基礎（本ドキュメント） |
| 2 | 画面キャプチャ領域の指定と UI 作成 |
| 3 | 音声取得と Deepgram 連携（リアルタイム文字起こし） |
| 4 | Gemini 連携（Push-to-Think の AI 回答） |
| 5 | DB 保存・多言語化（i18n）・Stripe 決済の統合 |

---

## Step 1: 開発テンプレートの導入

```bash
# プロジェクトの作成（フレームワーク: React、言語: TypeScript を選択）
npm create @quick-start/electron invisible-teleprompter

# 作成されたフォルダに移動
cd invisible-teleprompter

# 必要なパッケージをインストール
npm install

# Tailwind CSS のインストール
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

## Step 2: Cursor のセットアップと「ルール」の定義

プロジェクトのルート（一番上の階層）に `.cursorrules` という名前の新規ファイルを作成し、以下の内容を保存する。

```plaintext
# .cursorrules
You are an expert developer in Electron, React, TypeScript, and Tailwind CSS.
This project uses `electron-vite`.
- Main process code goes in `src/main/`
- Renderer code (React) goes in `src/renderer/`
- Preload scripts go in `src/preload/`
- Always use functional React components with Hooks.
- Use Tailwind CSS for all styling.
- Ensure cross-platform compatibility (Windows/Mac).
```

## Step 3: Tailwind CSS の初期設定

Cursor の Composer（`Cmd+I` / `Ctrl+I`）を開き、以下を送信する。

> **Cursor へのプロンプト**
>
> 現在のプロジェクトに Tailwind CSS がインストールされていますが、設定ファイルと CSS の読み込みが終わっていません。
> - `tailwind.config.js` を編集して、`src/renderer/**/*.{js,ts,jsx,tsx}` を対象に含めてください。
> - `src/renderer/src/assets/main.css` の中身を消して、Tailwind のディレクティブ（`@tailwind base; @tailwind components; @tailwind utilities;`）を追記してください。
> - `App.tsx` でその CSS が読み込まれているか確認・修正してください。

AI がコードを生成したら「Accept all（すべて承認）」をクリックする。

## Step 4: 透過ウィンドウ（透明なカンペ）の実装

Composer（`Cmd+I` / `Ctrl+I`）を開き、以下を送信する。

> **Cursor へのプロンプト**
>
> この Electron アプリを「透明なカンペ」アプリにします。
> `src/main/index.ts` の `createWindow` 関数を以下の要件に合わせて修正してください。
>
> **ウィンドウの要件**
> - `width: 800, height: 200`
> - `transparent: true`（背景を透明に）
> - `frame: false`（タイトルバーや枠を消す）
> - `alwaysOnTop: true`（常に最前面に）
> - `hasShadow: false`（影を消す）
>
> その後、`src/renderer/src/App.tsx` を編集し、背景を完全に透明（`bg-transparent`）にし、画面中央に「透明なカンペアプリ起動中...」という白いテキスト（黒いドロップシャドウ付き）だけが表示されるシンプルな UI に変更してください。既存の Vite・Electron のロゴなどのデフォルト UI はすべて削除してください。

## Step 5: 動作確認

```bash
npm run dev
```

**成功の確認**: デスクトップ上に「枠がなく、背景が透明で、文字だけが浮かび上がって常に最前面にある」アプリが起動すれば OK。

終了させる時はターミナルで `Ctrl+C`。

---

ここまで完了すると、今後のすべての機能の土台となる「ステルス UI」が完成する。
問題なく起動できたら、[フェーズ 2](./phase-2-electron-routing.md) へ進む。
