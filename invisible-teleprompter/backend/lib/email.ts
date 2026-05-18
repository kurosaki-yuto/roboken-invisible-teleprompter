import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'

const ses = new SESClient({})
const FROM_EMAIL = process.env.FROM_EMAIL || 'support@mienaq.com'
const LP_URL = process.env.LP_URL || 'https://mienaq.com'

export async function sendAdminWelcomeEmail(args: {
  to: string
  teamId: string
  adminLicenseKey: string
  inviteTokens: string[]
}): Promise<void> {
  const body = renderAdminWelcomeBody(args)
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [args.to] },
      Message: {
        Subject: { Charset: 'UTF-8', Data: '【Mienaq】ご購入ありがとうございます — ライセンス情報のご案内' },
        Body: {
          Text: { Charset: 'UTF-8', Data: body },
        },
      },
    }),
  )
}

export async function sendInviteEmail(args: {
  to: string
  inviteToken: string
}): Promise<void> {
  const body = renderInviteBody(args)
  await ses.send(
    new SendEmailCommand({
      Source: FROM_EMAIL,
      Destination: { ToAddresses: [args.to] },
      Message: {
        Subject: { Charset: 'UTF-8', Data: '【Mienaq】チーム招待のお知らせ' },
        Body: {
          Text: { Charset: 'UTF-8', Data: body },
        },
      },
    }),
  )
}

function renderAdminWelcomeBody(args: {
  to: string
  teamId: string
  adminLicenseKey: string
  inviteTokens: string[]
}): string {
  const inviteUrls = args.inviteTokens.map(
    (t, i) => `  ${i + 1}. ${LP_URL}/invite?token=${t}`,
  ).join('\n')
  return `Mienaq をお買い上げいただきありがとうございます。

■ チーム ID
${args.teamId}

■ 管理者ライセンスキー (Mienaq アプリ → 設定 → ライセンス で入力)
${args.adminLicenseKey}

■ 社員向け招待URL (${args.inviteTokens.length} 名分)
${inviteUrls}

各社員に招待URLを共有してください。社員はURLにアクセスしてメールアドレスを入力すると個人ライセンスキーが発行されます。

ご不明点は support@mienaq.com までお問い合わせください。
`
}

function renderInviteBody(args: { to: string; inviteToken: string }): string {
  return `Mienaq チームへ招待されています。

下記URLにアクセスして Mienaq を有効化してください。

${LP_URL}/invite?token=${args.inviteToken}

ご不明点は support@mienaq.com までお問い合わせください。
`
}
