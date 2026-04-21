---
title: フェーズ 5：ビジネス基盤の統合（DB・多言語・決済・管理機能）
original: ⑪SaaS開発：ビジネス基盤統合と収益化.docx
phase: build-guide
---

# フェーズ 5：ビジネス基盤の統合

「自分だけで使うツール」から「収益を生むグローバル SaaS」へ昇華させる。
70% 以上の利益率を維持するためのコスト管理と、関係者無料化ロジックを組み込む。

---

## Step 1: 議事メモの保存機能（SQLite & Prisma）

Composer（`Ctrl+I` / `Cmd+I`）を開き、以下を送信する。

> **Cursor へのプロンプト**
>
> Prisma と SQLite を導入して、以下のスキーマを作成してください。
>
> - `Meeting`: id, title, date, duration, totalTranscript, summary（AI 生成）
> - `MeetingImage`: id, meetingId, imagePath, timestamp
>
> 会議終了ボタンが押されたら、これまでの文字起こし全文を Gemini 1.5 Pro に送り、綺麗な構造化テキスト（Markdown）に変換させて DB に保存するロジックを `src/main/` に実装してください。
>
> 保存した議事録を一覧表示・閲覧できるダッシュボード画面（`/history`）を `App.tsx` に追加してください。

## Step 2: 主要 50 ヶ国語への対応（i18next）

> **Cursor へのプロンプト**
>
> `i18next` と `react-i18next` を導入してください。
>
> - `src/renderer/src/i18n.ts` を作成し、日本語と英語をベースに、主要 50 ヶ国語の切り替えに対応できる土台を作ってください。
> - ブラウザの言語設定を自動取得してデフォルト言語を設定し、さらに設定画面から手動で変更できるようにしてください。
> - UI の各文言（「Start Meeting」や「Think」など）を多言語展開するための `locales` ファイルを一括生成してください。

## Step 3: Stripe 決済と関係者無料化ロジック

> **Cursor へのプロンプト**
>
> - `Dashboard` に「アップグレード」ボタンを設置し、クリックすると Stripe Checkout の URL を開くようにしてください。
> - ユーザーの認証データに `plan` 属性を持たせます。
> - **関係者無料化**: ログインしたメールアドレスが `@your-company.com`（貴社のドメイン）である場合、または特定の管理者 ID リストに含まれる場合は、Stripe の決済状態にかかわらず `plan: 'pro_internal'`（無料・無制限）を付与するロジックを実装してください。
> - それ以外の一般ユーザーは、Stripe の支払い完了（Webhook 受信）後にのみ Pro 機能を使えるようにガードをかけてください。

## Step 4: リーガル・FAQ ページの生成

> **Cursor へのプロンプト**
>
> 下記のページを、日本の特定商取引法および一般的なグローバル SaaS の基準に合わせて、Markdown 形式で作成し、`/terms`, `/privacy`, `/law`, `/faq` としてルーティングに追加してください。
>
> - 利用規約
> - プライバシーポリシー（AI によるデータ処理について明記）
> - 特定商取引法に基づく表記
> - FAQ（「相手にバレないか」「セキュリティ」など）

## Step 5: アプリのビルドと配布

```bash
npm run build:win   # Windows (.exe)
npm run build:mac   # macOS (.app / .dmg)
```

---

## 収益性の確認：70% 以上の利益率を維持するために

商談 1 時間あたりの API 原価（Deepgram + Gemini Flash フル活用）: 約 $0.5〜$1.0

| プラン | 月額 | 上限 | 想定原価/月 | 利益率 |
|--------|------|------|------------|--------|
| Free | $0 | 30 分 | 〜$0.5 | — |
| Standard | $29 | 10 時間 | $5〜$10 | 65〜83% |
| Business | $79 | 無制限 | 変動 | 〜70% |

詳細な事業計画は [`../04-business/01-saas-plan.md`](../04-business/01-saas-plan.md) 参照。

---

これですべてのフェーズが完了。Cursor を使えば、これだけの複雑な機能も「やりたいことを正確に指示する」だけで 10 日間で形にできる。
