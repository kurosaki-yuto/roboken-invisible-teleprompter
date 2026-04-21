---
title: フェーズ 4：Gemini 1.5 Flash 連携と AI 回答表示
original: ⑩Gemini連携とAI回答表示の実装.docx
phase: build-guide
---

# フェーズ 4：Gemini 1.5 Flash 連携と AI 回答表示（Push-to-Think）

保存しておいた「会話のログ」と「現在の資料（スクリーンショット）」をセットにして Gemini に送り、「知的な回答案」を生成して透明なカンペに表示させる仕組みを作る。

---

## Step 1: Gemini API キーの準備

[Google AI Studio](https://aistudio.google.com) で API キーを無料取得し、フェーズ 3 で作った `.env` ファイルに追記する。

```plaintext
VITE_GEMINI_API_KEY=あなたのGemini_APIキー
```

## Step 2: 指定領域のスクリーンショット機能（Electron メインプロセス）

Composer（`Cmd+I` / `Ctrl+I`）を開き、以下を送信する。

> **Cursor へのプロンプト（指示 1）**
>
> `src/main/index.ts` を修正して、指定した領域（x, y, width, height）のスクリーンショットを撮る機能を追加してください。
>
> - `desktopCapturer` を使って画面のソースを取得する。
> - `nativeImage` を使って、指定された座標で画像をクロップ（切り抜き）する。
> - クロップした画像を `toDataURL()` で Base64 文字列に変換して、レンダラー（React 側）に返す `ipcMain.handle('capture-screen', ...)` を作成してください。

## Step 3: AI 回答生成ロジックの作成（React 側）

Composer を開き、以下を送信する。

> **Cursor へのプロンプト（指示 2）**
>
> `src/renderer/src/hooks/useAiAdvisor.ts` という新しいカスタムフックを作成してください。
>
> - `@google/generative-ai` ライブラリを使用して Gemini 1.5 Flash に接続する（ライブラリがない場合はインストールコマンドも教えてください）。
> - `askAi(transcript: string, imageBase64: string)` という関数を作成する。
> - **システムプロンプト（重要）**: 「あなたは百戦錬磨のビジネス軍師です。提示された会話ログと資料画像から、相手の意図を読み、次に話すべき『知的で人間味のある回答・提案』を3つ、各20文字以内の箇条書きで出力してください」と設定してください。
> - 生成されたテキストを返すようにしてください。

## Step 4: 「考える（Think）」ボタンとカンペ表示の統合

Composer を開き、以下を送信する。

> **Cursor へのプロンプト（指示 3）**
>
> `src/renderer/src/App.tsx` を大幅にアップデートします。
>
> - `Dashboard` コンポーネントに「AIに相談（Think）」ボタンを追加します。
> - このボタンが押されたら以下のフローを実行してください：
>   1. `window.api.captureScreen(bounds)` を呼んで現在の資料画像を取得
>   2. これまで Deepgram で溜まった `transcript`（最新 30 件程度）を結合
>   3. `useAiAdvisor` の `askAi` 関数に画像とテキストを渡す
>   4. 返ってきた回答を、メインプロセス経由で Teleprompter ウィンドウに送信する
> - `Teleprompter` コンポーネント側でその回答を受け取り、画面上にふわっと表示させる（Framer Motion などのアニメーションを使うとより良い）。

## Step 5: グローバルショートカットの実装（ステルス用）

相手にバレないよう、キーボードだけで AI を起動できるようにする。

Composer を開き、以下を送信する。

> **Cursor へのプロンプト（指示 4）**
>
> `src/main/index.ts` で `globalShortcut` を登録してください。
>
> - `Command+K`（Mac）または `Ctrl+K`（Win）が押されたら、Dashboard ウィンドウに対して `'trigger-ai-think'` というイベントを送信するようにしてください。
> - これにより、ブラウザ上の「Think」ボタンをクリックしたのと同じ動作が走るように `App.tsx` も調整してください。

## Step 6: 動作確認

```bash
npm run dev
```

**期待される動作**:
1. 会議をスタートし、適当な資料（PDF やウェブサイト）を範囲選択する
2. 自分で喋るか、相手の声を文字起こしさせる
3. `Cmd+K`（または `Ctrl+K`）を押す
4. 数秒後、透明なカンペウィンドウに「〇〇の視点から△△と提案する」「相手の懸念に対し、データの裏付けを提示する」といった具体的な回答案が、資料の内容を踏まえた形で表示される

---

アプリの「コア機能」がすべて完成した。
次は [フェーズ 5：ビジネス基盤の統合](./phase-5-saas-foundation.md)（DB・多言語・決済）へ進む。
