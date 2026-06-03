import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { randomUUID } from 'crypto'
import Stripe from 'stripe'

import { verifyWebhookSignature, getCustomerEmail } from '../lib/stripe'
import {
  Team,
  TeamSeat,
  putTeam,
  putSeat,
  updateTeamSeatCount,
  updateTeamStatus,
  listSeatsByTeam,
  deleteSeat,
  getTeamByCustomer,
} from '../lib/dynamodb'
import { sendAdminWelcomeEmail } from '../lib/email'

function genLicenseKey(): string {
  return `mienaq_${randomUUID().replace(/-/g, '')}`
}

function genInviteToken(): string {
  return `inv_${randomUUID().replace(/-/g, '')}`
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const sig = event.headers['stripe-signature'] || event.headers['Stripe-Signature']
  if (!sig) return { statusCode: 400, body: 'missing signature' }
  if (!event.body) return { statusCode: 400, body: 'missing body' }

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = verifyWebhookSignature(event.body, sig)
  } catch (e) {
    return { statusCode: 400, body: `signature verification failed: ${(e as Error).message}` }
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(stripeEvent.data.object as Stripe.Checkout.Session)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(stripeEvent.data.object as Stripe.Subscription)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(stripeEvent.data.object as Stripe.Subscription)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(stripeEvent.data.object as Stripe.Invoice)
        break
      default:
        console.log(`[webhook] unhandled event type: ${stripeEvent.type}`)
    }
    return { statusCode: 200, body: 'ok' }
  } catch (e) {
    console.error('[webhook] error:', e)
    return { statusCode: 500, body: `handler error: ${(e as Error).message}` }
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  if (!customerId || !subscriptionId) {
    throw new Error('checkout session missing customer or subscription')
  }

  const adminEmail = session.customer_email || (await getCustomerEmail(customerId))
  const seatCount = parseInt(session.metadata?.seat_count || '1', 10)
  const now = Date.now()

  const team: Team = {
    id: `team_${randomUUID().replace(/-/g, '')}`,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    adminEmail,
    seatCount,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  await putTeam(team)

  const adminLicenseKey = genLicenseKey()
  const adminSeat: TeamSeat = {
    id: `seat_${randomUUID().replace(/-/g, '')}`,
    teamId: team.id,
    licenseKey: adminLicenseKey,
    email: adminEmail,
    isAdmin: true,
    status: 'active',
    activatedAt: now,
    lastVerifiedAt: now,
    createdAt: now,
  }
  await putSeat(adminSeat)

  const inviteTokens: string[] = []
  for (let i = 0; i < Math.max(0, seatCount - 1); i++) {
    const token = genInviteToken()
    inviteTokens.push(token)
    const inviteSeat: TeamSeat = {
      id: `seat_${randomUUID().replace(/-/g, '')}`,
      teamId: team.id,
      licenseKey: `pending_${randomUUID().replace(/-/g, '')}`,
      inviteToken: token,
      isAdmin: false,
      status: 'pending',
      createdAt: now,
    }
    await putSeat(inviteSeat)
  }

  // SES 認証が未完了の間はメール送信が失敗しうる。
  // ここで throw すると webhook が 500 → Stripe 再送 → チーム重複作成になるため、
  // メール失敗はログのみで握りつぶし、ライセンス発行(DB)は確定させる。
  try {
    await sendAdminWelcomeEmail({
      to: adminEmail,
      teamId: team.id,
      adminLicenseKey,
      inviteTokens,
    })
  } catch (e) {
    console.error('[webhook] sendAdminWelcomeEmail failed (team is still created):', e)
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  const teamSeats = await findTeamByCustomer(sub.customer as string)
  if (!teamSeats) return
  const { team } = teamSeats

  const newQty = sub.items.data[0]?.quantity ?? 1
  const currentSeats = await listSeatsByTeam(team.id)
  const diff = newQty - currentSeats.length

  if (diff > 0) {
    const now = Date.now()
    for (let i = 0; i < diff; i++) {
      const token = genInviteToken()
      await putSeat({
        id: `seat_${randomUUID().replace(/-/g, '')}`,
        teamId: team.id,
        licenseKey: `pending_${randomUUID().replace(/-/g, '')}`,
        inviteToken: token,
        isAdmin: false,
        status: 'pending',
        createdAt: now,
      })
    }
  } else if (diff < 0) {
    const removable = currentSeats
      .filter((s) => !s.isAdmin && s.status === 'pending')
      .slice(0, -diff)
    for (const s of removable) await deleteSeat(s.id)
  }

  await updateTeamSeatCount(team.id, newQty)
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const teamSeats = await findTeamByCustomer(sub.customer as string)
  if (!teamSeats) return
  await updateTeamStatus(teamSeats.team.id, 'canceled')
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return
  const teamSeats = await findTeamByCustomer(customerId)
  if (!teamSeats) return
  await updateTeamStatus(teamSeats.team.id, 'past_due')
}

async function findTeamByCustomer(
  customerId: string,
): Promise<{ team: Team } | null> {
  const team = await getTeamByCustomer(customerId)
  return team ? { team } : null
}
