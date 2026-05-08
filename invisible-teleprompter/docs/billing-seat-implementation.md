# Mienaq シート課金（法人プラン） 実装設計書

作成: 2026-05-08 / 黒崎優人
基礎: `billing-stripe-implementation.md`（個人 月額20$ 単一プラン）

## 1. 目的

寺田社長 5/7 質問 (Chatwork msg 2104412776) を受けた法人プラン仕様。

> 法人が購入する場合が多いと思うのですが、社員1名にあたり20ドルという仕様になっていますか？1法人で社員100名使う場合、1法人・合計2000ドルを想定しているのですが。

→ **シート課金** (1シート = 1ユーザ = 月20$、人数比例) で確定。100名 = 月2,000$。

## 2. 提供フロー

### 購入

1. LP (mienaq.com) の Stripe Checkout で **シート数** を選択
   - プリセット: 1 / 5 / 10 / 50 / 100名以上はカスタム
2. Stripe が `seat_count × $20/月` で月次サブスク発行
3. 決済成功時 webhook `checkout.session.completed` でバックエンドが
   - **チームID** ランダム発行 (uuid v4)
   - **管理者ライセンスキー** 1本発行
   - **招待トークン** N本発行 (seat_count - 1 本)
4. 管理者メールに「ログインURL + 管理者キー + 招待URL一括」送信

### 利用

1. 管理者は管理画面から **招待URL** を社員に配布（or 手動でメール）
2. 社員が招待URLを開く → メアド入力 → 個人ライセンスキー受領
3. 各自アプリで個人キー入力 → サブスク有効化
4. アプリ起動毎に `/license/verify` で seat 状態確認（解除済 seat は機能停止）

### 増減員

- 管理画面で「シート追加」→ Stripe `subscriptions.update` で quantity 増加 → Stripe が日割り請求
- 「シート削除」→ 該当 seat の license invalidate → 次回月初請求から減額

## 3. データモデル

### Stripe 側

- Product `Mienaq Pro Seat` (1 個)
- Price `recurring monthly $20` (1 個、quantity で人数指定)
- Customer `team_xxx` (法人 1 アカウント)
- Subscription `team_xxx_sub` quantity=N

### バックエンド (新規)

```sql
CREATE TABLE teams (
  id           VARCHAR(40) PRIMARY KEY,         -- team_uuid
  stripe_customer_id  VARCHAR(60) UNIQUE,
  stripe_subscription_id VARCHAR(60) UNIQUE,
  admin_email  VARCHAR(255) NOT NULL,
  seat_count   INT NOT NULL DEFAULT 1,
  status       VARCHAR(20) NOT NULL,            -- active | past_due | canceled
  created_at   TIMESTAMP DEFAULT NOW(),
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE team_seats (
  id              VARCHAR(40) PRIMARY KEY,      -- seat_uuid
  team_id         VARCHAR(40) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  license_key     VARCHAR(64) UNIQUE NOT NULL,  -- アプリ入力用
  invite_token    VARCHAR(64) UNIQUE,           -- 招待URL用 (NULL after activation)
  email           VARCHAR(255),                 -- activation後セット
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  status          VARCHAR(20) NOT NULL,         -- pending | active | revoked
  activated_at    TIMESTAMP,
  last_verified_at TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_team_seats_team ON team_seats(team_id);
CREATE INDEX idx_team_seats_license ON team_seats(license_key);
```

## 4. アプリ側変更

### `src/main/license.ts`

`LicenseState` 拡張:

```typescript
export interface LicenseState {
  licenseKey?: string
  customerId?: string
  subscriptionId?: string
  status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unknown'
  currentPeriodEnd?: number
  lastVerifiedAt?: number
  // --- new for seat plan ---
  teamId?: string
  isAdmin?: boolean
  seatStatus?: 'active' | 'pending' | 'revoked'
}
```

`isFeatureAllowed()` は変更なし（ステータスベース判定はそのまま使える）。
個人プランはチーム単一 seat (`seat_count = 1, is_admin = true`) として実装統一。

### IPC 追加

- `LICENSE_ACTIVATE_INVITE` … 招待トークンと メアドで受け取って activate
- `LICENSE_TEAM_INFO` … 管理者向けにチーム状況返却
- `LICENSE_INVITE_RESEND` … 招待メール再送

### admin UI

`src/renderer/src/pages/Settings.tsx` に「チーム管理」タブ追加:

- 現在のシート数
- アクティブシート / 招待中シート 一覧（メアド・activated_at）
- シート追加ボタン → Stripe Customer Portal リダイレクト or 内蔵 form
- シート削除ボタン → 該当 license invalidate
- 招待URL コピーボタン

## 5. バックエンド API

| Method | Path | 用途 |
|---|---|---|
| POST | `/team/checkout-success` | Stripe webhook handler、team + seat 一括発行 |
| POST | `/license/activate` | 個人キー入力時、subscription状態返却（既存拡張） |
| POST | `/license/activate-invite` | 招待トークン + メアドで seat activate |
| GET  | `/team/{team_id}` | 管理者向けチーム情報 |
| POST | `/team/{team_id}/seats` | seat追加（Stripe quantity update） |
| DELETE | `/team/{team_id}/seats/{seat_id}` | seat削除 |

実装スタック想定: AWS Lambda + API Gateway + DynamoDB (or PostgreSQL on Aurora) + Stripe SDK。
小林さん指針に合わせる。

## 6. Stripe webhook

```
checkout.session.completed   → team & seats 発行 + 招待メール送信
customer.subscription.updated → seat_count diff 検知し team_seats 増減
customer.subscription.deleted → 全 seat status='revoked'
invoice.payment_failed       → team status='past_due'
```

## 7. 実装順序（クリティカルパス）

1. **小林さん**: Stripe `Mienaq` アカウント発行 + Webhook Secret 共有（依頼必要）
2. **黒崎**: 上記 webhook 受信用 Lambda + DB schema apply
3. **黒崎**: アプリ側 `LicenseState` 拡張、IPC 追加、admin UI
4. **土山/長山**: LP に Stripe Checkout (シート数選択) ボタン設置
5. **黒崎**: 統合テスト（個人1シート → 5シート増 → 1シート減 → 全解約）

工数見積: バックエンド1.5週 + アプリ1週 + 統合0.5週 = **3週間**

## 8. 内輪バイパス

`MIENAQ_INTERNAL=1` フラグはそのまま継続。社内利用 (ロボケン・もちもつ) は無料維持。

## 9. リスクと未決定事項

- **Stripe Customer Portal**: シート増減で使うか自社UIで完結させるか → Customer Portal 標準UI で seat 数変更可能、活用推奨（実装短縮）
- **招待トークンの有効期限**: 14日案。期限切れは管理者が再発行
- **退職者対応**: seat削除時のライセンス即時失効 vs 月末まで使用可能 → **即時失効** 推奨（管理者統制重視）
- **シート別請求書 PDF**: 寺田希望なら別途 invoice generator 追加

## 10. 寺田/小林さんへの確認事項（Chatwork で投稿）

- [ ] 法人プラン UI を「シート数選択型」で固定して良いか（プリセット 1/5/10/50/100/カスタム）
- [ ] Stripe `Mienaq` アカウント発行のスケジュール（小林さんGW明け）
- [ ] 退職者対応「即時失効」承認
- [ ] LP は土山さん→長山さん主担当変更後、Stripe Checkout 設置のスケジュール
