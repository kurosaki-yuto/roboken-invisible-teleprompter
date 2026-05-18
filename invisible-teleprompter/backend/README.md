# Mienaq Backend (License + Team Seat)

法人シート課金フロー用バックエンド。AWS Lambda + DynamoDB + Stripe Webhook + SES。

## 構成

```
[Stripe Checkout]
       │ (checkout.session.completed)
       ▼
[API Gateway /webhook/stripe]
       │
       ▼
[Lambda: stripe-webhook] ─→ [DynamoDB: teams / team-seats]
                          ↘ [SES: 管理者へキー・招待URL送信]

[Mienaq アプリ]
       │
       ├─ POST /license/activate           (個人/管理者 キー検証)
       ├─ POST /license/activate-invite    (招待トークン→seat化)
       ├─ GET  /team/{teamId}              (管理者: チーム情報取得)
       └─ POST /team/{teamId}/seats/{seatId}/resend-invite
```

## ファイル構成

```
backend/
├── handlers/
│   ├── stripe-webhook.ts          # Checkout/subscription events
│   ├── license-activate.ts        # activate / activateInvite
│   └── team-info.ts               # get / resendInvite
├── lib/
│   ├── dynamodb.ts                # teams / team_seats アクセス
│   ├── stripe.ts                  # Stripe SDK + webhook 検証
│   └── email.ts                   # SES 招待・管理者メール
├── template.yaml                  # AWS SAM (DynamoDB + Lambda + HttpApi)
├── package.json
├── tsconfig.json
└── README.md
```

## DynamoDB スキーマ

### teams テーブル
| 属性 | 型 | 用途 |
|---|---|---|
| id (PK) | S | team_uuid |
| stripeCustomerId | S | GSI: stripe-customer-index |
| stripeSubscriptionId | S | — |
| adminEmail | S | — |
| seatCount | N | 契約シート数 |
| status | S | active / past_due / canceled |
| createdAt / updatedAt | N | unix ms |

### team-seats テーブル
| 属性 | 型 | 用途 |
|---|---|---|
| id (PK) | S | seat_uuid |
| teamId | S | GSI: team-index |
| licenseKey | S | GSI: license-index (アプリ入力) |
| inviteToken | S | GSI: invite-index (招待URL用) |
| email | S | 起動後セット |
| isAdmin | BOOL | — |
| status | S | pending / active / revoked |
| activatedAt | N | — |
| lastVerifiedAt | N | — |
| createdAt | N | — |

## デプロイ手順

### 1. 依存関係

```bash
cd backend
npm install
```

### 2. ビルド

```bash
npm run build
```

### 3. AWS SAM デプロイ (Mienaq AWS アカウント = 647932856472)

```bash
# 初回 (対話モード)
sam deploy --guided \
  --parameter-overrides \
    Stage=prod \
    StripeSecretKey=<SecretsManager から取得> \
    StripeWebhookSecret=<Stripe Dashboard から取得> \
    FromEmail=support@mienaq.com \
    LpUrl=https://mienaq.com \
  --profile mienaq

# 2回目以降
sam deploy --profile mienaq
```

### 4. Stripe Webhook 登録

Stripe Dashboard → Developers → Webhooks → Add endpoint
- URL: `https://xxx.execute-api.ap-northeast-1.amazonaws.com/webhook/stripe`
- Events:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
- Signing secret を取得して SAM の `StripeWebhookSecret` に渡す

### 5. Mienaq アプリの環境変数

`.env` (or 起動時 env) に追加:

```
MIENAQ_LICENSE_API_BASE=https://xxx.execute-api.ap-northeast-1.amazonaws.com
```

これで `src/main/license.ts` の activateLicense / activateInvite / getTeamInfo / resendInvite が
本番 API を叩くようになる。

## TODO (Stripe アカウント発行後に着手)

- [ ] Stripe Products / Prices 作成 (Mienaq Pro Seat / $20/month/seat)
- [ ] SecretsManager (mienaq AWS) に Stripe キー登録
- [ ] SAM 初回デプロイ
- [ ] Webhook 疎通テスト (Stripe CLI でローカル listen)
- [ ] アプリ → API E2E テスト
- [ ] handlers/stripe-webhook.ts の findTeamByCustomer に stripe-customer-index GSI 統合
