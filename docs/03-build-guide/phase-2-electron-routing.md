---
title: フェーズ 2：画面キャプチャ領域の指定と UI の分離
original: ⑧Electronアプリ開発：画面指定とカンペ起動.docx
phase: build-guide
---

# フェーズ 2：画面キャプチャ領域の指定と UI の分離

フェーズ 1 で作った「透明なカンペ」に加えて、以下の 2 つを追加する。

- **ダッシュボード**: アプリを操作するメイン画面
- **オーバーレイ（範囲指定）**: 画面のどこを読み取るかをマウスで範囲選択する画面

1 つの React アプリの中で、URL（ハッシュ）を使って画面を切り替えるシンプルな設計にする。

---

## Step 1: 必要なライブラリのインストール

```bash
npm install react-router-dom
```

## Step 2: 3 つの画面（コンポーネント）の作成

Composer（`Cmd+I` / `Ctrl+I`）を開き、以下を送信する。

> **Cursor へのプロンプト（指示 1）**
>
> `src/renderer/src/App.tsx` を修正し、react-router-dom の `HashRouter` を使って以下の 3 つの画面をルーティングするようにしてください。
>
> - `/` (Dashboard): 「Start Meeting」ボタンがあるシンプルなコントロールパネル画面。
> - `/teleprompter` (Teleprompter): フェーズ 1 で作った透明なカンペ画面（背景 `bg-transparent`、文字だけの UI）。
> - `/overlay` (Overlay): 画面全体を薄暗く覆い（`bg-black/50`）、ユーザーがマウスをドラッグして四角い領域を選択できる画面。ドラッグが完了したら、その座標（x, y, width, height）をコンソールに出力して画面を閉じるイメージ。
>
> コンポーネントは同じファイル内に書いて構いません。Tailwind を使ってモダンに仕上げてください。

## Step 3: メインプロセス（Electron 側）でのマルチウィンドウ管理

Composer を開き、以下を送信する。

> **Cursor へのプロンプト（指示 2）**
>
> `src/main/index.ts` を大幅に書き換えます。以下の 3 つのウィンドウを管理・生成する関数を作ってください。
>
> - `createDashboardWindow()`: 幅 800、高さ 600 の通常ウィンドウ。ロードするURLは `/#/`。アプリ起動時に開く。
> - `createTeleprompterWindow()`: フェーズ 1 の透明・最前面・枠なしウィンドウ。ロードする URL は `/#/teleprompter`。
> - `createOverlayWindow()`: 幅高さともに画面全体（`screen.getPrimaryDisplay().bounds` を使用）、背景透明、枠なし、最前面。ロードする URL は `/#/overlay`。
>
> また、`ipcMain` を使って、Dashboard から「Start Meeting」ボタンが押されたら `createOverlayWindow` を呼び出し、Overlay で領域選択が終わったらその座標を受け取り `createTeleprompterWindow` を呼び出す（そして Overlay は閉じる）という IPC 通信の土台を作ってください。

## Step 4: フロント（React）と Electron の通信を繋ぐ（IPC）

Composer を開き、以下を送信する。

> **Cursor へのプロンプト（指示 3）**
>
> `src/preload/index.ts` を修正し、`contextBridge` を使って、React 側から以下の API を呼べるようにしてください。
>
> - `startSelection()`: 領域選択画面を開く命令。
> - `finishSelection(bounds)`: 選択した座標（x, y, width, height）をメインプロセスに送る命令。
>
> その後、`src/renderer/src/App.tsx` に戻り、Dashboard の「Start Meeting」ボタンを押したら `window.api.startSelection()` を呼ぶようにし、Overlay 画面でドラッグが終わったら `window.api.finishSelection(bounds)` を呼ぶように修正してください。

## Step 5: 動作確認

```bash
npm run dev
```

**期待される動作**:
1. 普通のウィンドウ（ダッシュボード）が立ち上がる
2. 「Start Meeting」ボタンを押すと、画面全体がうっすらと暗くなる（オーバーレイ）
3. マウスでドラッグして四角く囲むと、座標が裏側に送信されて暗い画面が消える
4. 直後に「透明なカンペ」が画面の最前面に出現する

---

「相手の資料が映る部分を指定し、カンペを起動する」という一連の UX の骨格が完成した。
問題なく動けば、[フェーズ 3](./phase-3-speech-to-text.md) へ進む。
