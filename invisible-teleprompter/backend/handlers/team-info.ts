import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'

import {
  getTeam,
  listSeatsByTeam,
  getSeatByLicense,
} from '../lib/dynamodb'
import { sendInviteEmail } from '../lib/email'

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

async function authorizeAdmin(
  event: any,
  teamId: string,
): Promise<{ ok: true } | { ok: false; res: any }> {
  const auth = event.headers?.authorization || event.headers?.Authorization
  const licenseKey = auth?.replace(/^Bearer\s+/i, '')
  if (!licenseKey) return { ok: false, res: json(401, { error: 'missing authorization' }) }

  const seat = await getSeatByLicense(licenseKey)
  if (!seat || !seat.isAdmin || seat.teamId !== teamId) {
    return { ok: false, res: json(403, { error: 'not admin of this team' }) }
  }
  return { ok: true }
}

// GET /team/{teamId}
export const get: APIGatewayProxyHandlerV2 = async (event) => {
  const teamId = event.pathParameters?.teamId
  if (!teamId) return json(400, { error: 'missing teamId' })

  const auth = await authorizeAdmin(event, teamId)
  if (!auth.ok) return auth.res

  const team = await getTeam(teamId)
  if (!team) return json(404, { error: 'team not found' })

  const seats = await listSeatsByTeam(teamId)
  return json(200, {
    teamId: team.id,
    seatCount: team.seatCount,
    activeSeatCount: seats.filter((s) => s.status === 'active').length,
    adminEmail: team.adminEmail,
    status: team.status,
    seats: seats.map((s) => ({
      id: s.id,
      email: s.email,
      status: s.status,
      isAdmin: s.isAdmin,
      activatedAt: s.activatedAt,
    })),
  })
}

// POST /team/{teamId}/seats/{seatId}/resend-invite
export const resendInvite: APIGatewayProxyHandlerV2 = async (event) => {
  const teamId = event.pathParameters?.teamId
  const seatId = event.pathParameters?.seatId
  if (!teamId || !seatId) return json(400, { error: 'missing teamId or seatId' })

  const auth = await authorizeAdmin(event, teamId)
  if (!auth.ok) return auth.res

  const seats = await listSeatsByTeam(teamId)
  const target = seats.find((s) => s.id === seatId)
  if (!target) return json(404, { error: 'seat not found' })
  if (!target.inviteToken || !target.email) {
    return json(400, { error: 'seat already activated or email missing' })
  }

  await sendInviteEmail({ to: target.email, inviteToken: target.inviteToken })
  return json(200, { ok: true })
}
