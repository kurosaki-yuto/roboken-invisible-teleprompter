---
title: フェーズ 3：音声取得とリアルタイム文字起こし
original: ⑨音声取得とリアルタイム文字起こし.docx
phase: build-guide
---

# フェーズ 3：音声取得とリアルタイム文字起こし

会議中の音声を拾い、超低遅延の音声認識 API「Deepgram」を使ってリアルタイムにテキスト化し、AI に渡すための「会話プール」に溜めていく仕組みを作る。

> **注意（Mac）**: macOS のセキュリティ仕様により、PC の内部音声とマイクを同時に直接取得するには高度な設定が必要。MVP では「PC のマイクから、スピーカーの相手の声と自分の声をまとめて拾う」最もシンプルで確実なアプローチで実装する。

---

## Step 1: Deepgram の準備と環境変数の設定

事前に [Deepgram の公式サイト](https://deepgram.com) で無料アカウントを作成し、API キーを取得しておく（毎月数千円分が無料）。

```bash
npm install react-use-websocket
```

プロジェクトの一番上の階層（`package.json` と同じ場所）に `.env` ファイルを作成し、以下を記述する。

```plaintext
VITE_DEEPGRAM_API_KEY=あなたのDeepgram_APIキーをここに貼る
```

## Step 2: 音声録音と通信用カスタムフックの作成

Composer（`Cmd+I` / `Ctrl+I`）を開き、以下を送信する。

> **Cursor へのプロンプト（指示 1）**
>
> `src/renderer/src/hooks/useAudioTranscription.ts` という新しいカスタムフックを作成してください。
>
> 以下の要件を満たすコードを書いてください。
>
> - `navigator.mediaDevices.getUserMedia({ audio: true })` を使ってマイクの音声ストリームを取得する。
> - 取得した音声を `MediaRecorder` で細かく（例: 250ms 間隔）スライスして取得する。
> - `import.meta.env.VITE_DEEPGRAM_API_KEY` を使って、Deepgram の WebSocket API（`wss://api.deepgram.com/v1/listen?model=nova-2&language=ja&smart_format=true`）に接続する。
> - `MediaRecorder` のデータ（Blob）が生成されるたびに、WebSocket 経由で Deepgram に送信する。
> - Deepgram から返ってきたテキスト（`is_final: true` のもの）を状態（`transcript` 配列）にどんどん追加して保持し、外部に返す（`return` する）。
> - 録音の開始（`startRecording`）と停止（`stopRecording`）の関数も返すようにする。

## Step 3: ダッシュボードと音声機能の連携

Composer を開き、以下を送信する。

> **Cursor へのプロンプト（指示 2）**
>
> `src/renderer/src/App.tsx` を修正します。
>
> - 先ほど作成した `useAudioTranscription` フックをインポートしてください。
> - `Dashboard` コンポーネントの中でこのフックを呼び出します。
> - 「Start Meeting」ボタンを押して `window.api.startSelection()` を呼ぶと同時に、`startRecording()` も実行して録音を開始するようにしてください。
> - Dashboard 画面の下部に、デバッグ用として「現在の文字起こしログ」がリアルタイムにテキスト表示されるエリア（スクロール可能、背景グレーなど）を追加してください（本番では隠すが、今は動作確認のために表示する）。

## Step 4: 動作確認

```bash
npm run dev
```

**期待される動作**:
1. ダッシュボード画面が立ち上がる
2. 「Start Meeting」を押すと、OS から「マイクへのアクセス許可」が求められるので「許可」する
3. PC に向かって適当に喋るか、スマホ等で YouTube の動画音声をスピーカーで流す
4. ダッシュボード下部に、喋った内容が数ミリ秒〜1 秒程度の超低遅延でテキスト化されて表示されれば大成功

---

アプリが「相手が今何を言っているか」をテキストデータとして把握できるようになった。
問題なく動いたら、[フェーズ 4](./phase-4-gemini-integration.md) へ進む。

（Deepgram の API 接続エラーやマイクのパーミッションエラーが出た場合はエラーメッセージを確認すること）
