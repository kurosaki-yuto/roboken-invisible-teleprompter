# Mienaq

商談中の Zoom / Google Meet の画面に **相手からは見えない透過カンペ** を重ね、AI が次の一言を提案するデスクトップアプリです。

- 自分と相手の発話をリアルタイムに文字起こし
- スライドの自動切り替え検知（知覚ハッシュ）
- ホットキー（`Cmd+K` / `F9`）で AI に「次の一言」を提案させる
- Auto Coach モード：相手の発話が一段落するたびに自動でサジェスト
- 議事録・要約・スライド画像をローカルに自動アーカイブ
- AI プロバイダは **Gemini / Claude** 切替可能（Claude を選ぶと精度が一段上がります）

> 営業・カスタマーサクセス・採用面接など、**目上の相手と丁寧に話す B2B 用途** にトーンを最適化しています。

---

## クイックスタート（ZIP からのインストール）

GitHub からソースを ZIP でダウンロードして起動する最短手順です。プログラミング知識が無くてもこの順でいけます。

### 1. ZIP をダウンロードする

1. このリポジトリのトップページ右上にある緑色の **`< > Code`** ボタンをクリック
2. メニュー一番下の **`Download ZIP`** を押す
3. ダウンロードした `Mienaq-main.zip` をダブルクリックして解凍
4. 解凍されたフォルダ `Mienaq-main` を、自分のホームフォルダ（macOS なら `~/`、Windows なら `C:\Users\<あなた>\`）など分かりやすい場所に移動

### 2. Node.js を入れる（初回のみ）

[nodejs.org](https://nodejs.org/ja) から **LTS 版 (20 以上)** のインストーラを取得 → 指示に従ってインストール。

確認:
```bash
node -v   # v20.x.x など
npm -v
```

### 3. ターミナルで依存関係をインストール

macOS: `ターミナル.app`、Windows: `PowerShell` を開き、以下を実行（フォルダパスは ZIP を置いた場所に合わせて調整）:

```bash
cd ~/Mienaq-main          # macOS の例
# cd C:\Users\xxx\Mienaq-main   # Windows の例

npm install
```

`node_modules/` フォルダが作られ、5〜10 分で完了します。途中で警告が出ても "added xxx packages" の行が出れば成功。

### 4. API キーを 2 つ用意する

Mienaq は **2 つの外部 API** を使います。両方とも個人で無料発行できます。

| API | 用途 | 取得先 | 無料枠 |
|---|---|---|---|
| **Gemini API キー** | AI 提案・要約（必須） | https://aistudio.google.com/app/apikey | 月間無料枠あり |
| **Deepgram API キー** | 文字起こし（推奨） | https://console.deepgram.com | 新規登録で $200 |
| **Anthropic API キー** | Claude を使う場合（任意） | https://console.anthropic.com | 従量課金 |

無くても起動はしますが、Gemini キー無しだと AI 機能が使えません。

### 5. 開発モードで起動

```bash
npm run dev
```

Vite と Electron が同時に起動して、Mienaq のウィンドウが立ち上がります。

### 6. 設定画面でキーを入力

アプリ右上「設定」→ Gemini / Deepgram / Anthropic のキーを貼り付け → **保存** → **接続テスト** で疎通確認。

> キーは macOS Keychain / Windows DPAPI 経由で **暗号化保存** されます（`safeStorage`）。プレーンテキストでファイルに残りません。

### 7. 商談で使う

1. Dashboard で「**範囲を選択**」を押し、相手のスライドが映っている領域をドラッグ
2. 透過 Teleprompter が画面前面に表示される（**画面共有には映りません**）
3. 商談中に `Cmd+K`（Win: `Ctrl+K`）または `F9` を押すと AI が次の一言を提案
4. 終了ボタン → 議事録が `~/Documents/Mienaq/<日時_タイトル>/` に保存

---

## 動作要件

| 項目 | 要件 |
|------|------|
| OS | macOS 12.3 以降 / Windows 10 以降 (`setContentProtection` は Win 10 ver 2004 以上) |
| Node.js | 20 LTS 以上（ZIP からインストールする場合のみ） |
| Gemini API キー | 必須 |
| Deepgram API キー | 任意（推奨。日本語の精度が大幅 UP） |
| Anthropic API キー | 任意（Claude を使う場合） |

### macOS で必要な権限（初回起動時）

| 権限 | 用途 |
|---|---|
| **画面収録** | 相手のスライドを取り込むため |
| **マイク** | 自分の発話の文字起こし |
| **アクセシビリティ** | グローバルショートカット (`Cmd+K` 等) の取得 |

許可後にアプリを **再起動** しないと反映されません。

### Windows で必要な操作

- 画面共有ダイアログで「**システムオーディオを共有**」を ON にしてください（相手の声を拾う条件）

---

## キーボードショートカット

| 操作 | キー |
|------|------|
| AI に相談 (Push-to-Think) | `Cmd+K` / `Ctrl+K` / `Ctrl+Cmd+K` / `Cmd+Shift+K` / `F9` |
| Teleprompter の表示 / 非表示 | `Cmd+Shift+T` |
| パニック（全ウィンドウを一発で隠す） | `Cmd+Shift+H` / `F8` |

> パニックキーで隠してもプロセスは生きており、もう一度押すと Dashboard が復帰します。録音セッションや transcript は失われません。完全終了は Mac: `Cmd+Q` / Win: `Alt+F4`。

---

## 主な機能

### 透過 Teleprompter ウィンドウ
- 半透明黒背景、常に最前面、画面共有から不可視 (`setContentProtection`)
- ドラッグ移動・リサイズ可能

### リアルタイム文字起こし
| プロバイダ | 用途 | 特徴 |
|------------|------|------|
| **Deepgram Nova-3** | 推奨 | 日本語精度が高い、`smart_format` + `punctuate` + `interim_results` |
| **Gemini Live**     | フォールバック | Deepgram キーが無くても動く |

### Push-to-Think（2 段レスポンス）
1 回のホットキーで以下を並列発火、後追いで上書き：
- **Fast**: 直近 15 発話 + スライド 1 枚、最速で表示
- **Deep**: 履歴要約 + 全文脈、thinking 強化、論理性アップ

### AI プロバイダ切替
Settings から **Gemini** / **Claude** を選択可能：
- **Gemini**: 2.5 Flash (fast/deep) + 2.5 Pro (議事録)
- **Claude**: Haiku 4.5 (fast) + Sonnet 4.6 (deep + 議事録) + ストリーミング表示

Anthropic キーを入れると Claude 選択肢が解放されます。

### Auto Coach
- 相手の発話が一段落した 1.5 秒後に自動発火（10 秒クールダウン）
- デフォルト OFF（Settings から ON）

### スライド自動切り替え検知
- 4 秒ごとに選択範囲をキャプチャ → 16×16 グリッドの輝度から知覚ハッシュ
- ハミング距離が閾値超でスライド切替と判定

### ローリング要約
- 直近 30 発話は逐語、それ以前は約 500 字に圧縮（LRU キャッシュ 40 件）

### 議事録アーカイブ
- SQLite に保存 + ローカルフォルダへ Markdown / 画像 / JSON 書き出し
- Documents 配下のフォルダは Win OneDrive リダイレクトや非英語ロケールでも正しく解決

### 会社プロフィール
- 自社の事業内容を Settings に保存 → 全 AI リクエストのシステムプロンプトに自動注入

### セキュリティ
- API キーは macOS Keychain / Windows DPAPI で暗号化保存 (`safeStorage`)
- `enc:v1:` prefix で旧プレーンテキスト設定を自動マイグレーション

---

## ディレクトリ構成

```
Mienaq/
├── src/
│   ├── main/              # Electron メインプロセス（IPC, DB, AI, archiver）
│   ├── preload/           # contextBridge
│   ├── renderer/          # React + Vite
│   │   └── src/
│   │       ├── pages/     # Dashboard / Teleprompter / History / Settings
│   │       ├── hooks/     # useMeetingRecorder
│   │       └── services/  # gemini-live.ts / deepgram-live.ts
│   └── types/             # IPC 型定義
├── electron-builder.yml
├── tsconfig.main.json     # メインプロセス用 tsc 設定
└── vite.config.ts
```

---

## ビルド・配布

```bash
npm run build              # main + renderer をビルド
npm run start              # ビルド済みアプリを起動

npm run package:mac        # macOS 向け .dmg を生成（out/）
npm run package:win        # Windows 向け .exe を生成（要 Windows もしくは Wine）
```

---

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| 起動直後に画面が真っ黒 | preload 読み込み失敗。`npm run build:main` 後に `npm run start` |
| マイクが拾われない | macOS: システム設定 → プライバシー → マイク / Win: マイクアプリ権限 |
| 相手の音声が文字起こしされない | 画面共有ダイアログで「システムオーディオを共有」ON / Mac は画面収録権限 |
| `Cmd+K` が効かない | macOS: アクセシビリティ権限を付与してアプリ再起動 |
| Gemini Live で `1008` エラー | API キーのプロジェクトで Live API を有効化 |
| 韓国語・タイ語などに化ける | Deepgram キーを設定すると大幅改善 |
| 画面共有に Teleprompter が映ってしまう | Windows 10 ver 2004 以上が必要 (`setContentProtection`) |
| パニックキーで隠れない | グローバルショートカットが他アプリと衝突。`F8` を試す |

---

## .env による事前設定（任意・開発者向け）

ZIP のルートに `.env` を作っておくと、起動時に自動読み込みされます。

```env
GEMINI_API_KEY=AIzaSy...
DEEPGRAM_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
```

> 配布版では `.env` を **同梱しない**でください。設定画面でユーザーが入力します。

---

## ライセンス

UNLICENSED（社内利用 / 評価目的）。再配布・商用利用は作者まで連絡してください。
