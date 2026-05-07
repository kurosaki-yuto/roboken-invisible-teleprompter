# Mienaq Stripe月額課金 実装メモ

作成: 2026-05-02 / 黒崎優人

## 概要

月額20ドル / Stripeサブスクリプションでの課金機能スタブ実装。
Stripeアカウント・Customer Portal・検証バックエンドが小林様側で準備中のため、
受領後に最小差し替えで本番化できる構造で先行実装した。

## 実装範囲（このコミット）

- `src/main/license.ts` — ライセンス状態の保存・暗号化・検証フローのコア
- `src/main/index.ts` — 起動時リフレッシュ + IPC ハンドラ登録
- `src/preload/index.ts` — レンダラ向けAPI公開
- `src/types/ipc.ts` — `LicenseStateView` / IPC定数追加

## 内輪用バイパス

- 環境変数 `MIENAQ_INTERNAL=1` でアプリ起動時に課金チェック完全スキップ
- または `setInternalBypass(true)` IPC で永続化（settings UI で切替予定）

## 受領待ちで差し替えるもの（Stripeキー受領後）

| 項目 | 現状 | 受領後 |
|---|---|---|
| `MIENAQ_LICENSE_API_BASE` env | 未設定→ローカル保存のみ | 検証エンドポイントURL設定 |
| `/license/activate` | スタブ | バックエンドでStripe Subscription検索→ステータス返却 |
| `/license/verify` | スタブ | 同上、定期チェック用 |
| Stripe Price ID | 未設定 | 月額20ドルのPrice ID（小林様の Stripe商品ページで作成） |
| Webhook | 未実装 | `customer.subscription.updated` をバックエンドで受信し、licenseKey ↔ subscription を紐付け |

## 想定する課金フロー（実装方針）

1. ユーザーは LP（mienaq.com）で Stripe Checkout 経由でサブスク開始
2. 決済成功時、バックエンドが Stripe webhook で `subscription.created` を受信
3. バックエンドはランダム license key を生成して Stripe Customer のメタデータに保存
4. Customer の email にライセンスキーを送信
5. ユーザーはアプリの「ライセンス入力画面」でキーを入力
6. アプリは `/license/activate` をコール → バックエンドが key からCustomerを引き当て、Subscription状態を返却
7. 起動毎に `/license/verify` で再検証（オフライン7日猶予）

## 残作業

- [ ] レンダラ側 ライセンス入力UI（設定画面に追加）
- [ ] レンダラ側 ライセンス未認証時の機能ゲート（pushToThink等を `featureAllowed` で出し分け）
- [ ] バックエンド構築（小林様のAWS Cognito + Lambda + Stripe SDK 想定）
- [ ] Stripe Price ID をビルド時に埋め込む or `.env` に切り出す
- [ ] LP（mienaq.com）の Checkout ボタン設置（土山様LP案と連携）

## テスト

ローカルでは:

```bash
# 内輪モード
MIENAQ_INTERNAL=1 npm run dev

# 通常モード（バックエンド未準備時はスタブで動作）
npm run dev
```

設定画面から「内輪モード ON/OFF」のトグルを追加すれば社内配布が可能。
