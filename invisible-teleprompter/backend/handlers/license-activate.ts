import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'

import {
  getSeatByLicense,
  getSeatByInviteToken,
  getTeam,
  activateSeat,
} from '../lib/dynamodb'

import { randomUUID } from 'crypto'

function genLicenseKey(): string {
  return `mienaq_${randomUUID().replace(/-/g, '')}`
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// POST /license/activate { licenseKey }
// 既存ライセンスキー検証 → 状態を返す
export const activate: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body) return json(400, { error: 'missing body' })
  const { licenseKey } = JSON.parse(event.body)
  if (!licenseKey) return json(400, { error: 'missing licenseKey' })

  const seat = await getSeatByLicense(licenseKey)
  if (!seat) return json(404, { error: 'license not found' })

  const team = await getTeam(seat.teamId)
  if (!team) return json(404, { error: 'team not found' })

  return json(200, {
    status: team.status === 'active' && seat.status === 'active' ? 'active' : 'inactive',
    teamId: team.id,
    isAdmin: seat.isAdmin,
    seatStatus: seat.status,
    email: seat.email,
    customerId: team.stripeCustomerId,
    subscriptionId: team.stripeSubscriptionId,
  })
}

// POST /license/activate-invite { inviteToken, email }
// 招待トークン → seat activate → ライセンスキー発行
export const activateInvite: APIGatewayProxyHandlerV2 = async (event) => {
  if (!event.body) return json(400, { error: 'missing body' })
  const { inviteToken, email } = JSON.parse(event.body)
  if (!inviteToken || !email) return json(400, { error: 'missing inviteToken or email' })

  const seat = await getSeatByInviteToken(inviteToken)
  if (!seat) return json(404, { error: 'invite token not found' })
  if (seat.status !== 'pending') return json(409, { error: 'seat already activated' })

  const team = await getTeam(seat.teamId)
  if (!team) return json(404, { error: 'team not found' })
  if (team.status !== 'active') return json(409, { error: 'team subscription not active' })

  const newLicenseKey = genLicenseKey()
  await activateSeat(seat.id, email, newLicenseKey)

  return json(200, {
    status: 'active',
    licenseKey: newLicenseKey,
    teamId: team.id,
    isAdmin: false,
    seatStatus: 'active',
    email,
    customerId: team.stripeCustomerId,
    subscriptionId: team.stripeSubscriptionId,
  })
}
