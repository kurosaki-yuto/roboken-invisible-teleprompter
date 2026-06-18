import nodemailer from 'nodemailer'

// SES の本番アクセス審査ゲートを回避するため、メール送信は Xserver の SMTP 経由で行う。
// SMTP 接続情報は Secrets Manager(mail/xserver/support@mienaq.com)から template 経由で注入。
const FROM_EMAIL = process.env.FROM_EMAIL || 'support@mienaq.com'
const LP_URL = process.env.LP_URL || 'https://mienaq.com'
const SMTP_PORT = Number(process.env.SMTP_PORT || 465)

let _transporter: nodemailer.Transporter | null = null
function transporter(): nodemailer.Transporter {
  if (_transporter) return _transporter
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // 465=SMTPS, 587=STARTTLS
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  return _transporter
}

async function sendMail(to: string, subject: string, text: string): Promise<void> {
  await transporter().sendMail({ from: FROM_EMAIL, to, subject, text })
}

export async function sendAdminWelcomeEmail(args: {
  to: string
  teamId: string
  adminLicenseKey: string
  inviteTokens: string[]
}): Promise<void> {
  await sendMail(
    args.to,
    '【Mienaq】ご購入ありがとうございます — ライセンス情報のご案内',
    renderAdminWelcomeBody(args),
  )
}

export async function sendInviteEmail(args: {
  to: string
  inviteToken: string
}): Promise<void> {
  await sendMail(args.to, '【Mienaq】チーム招待のお知らせ', renderInviteBody(args))
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
