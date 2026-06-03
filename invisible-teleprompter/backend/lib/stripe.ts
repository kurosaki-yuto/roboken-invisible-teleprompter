import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID!
const LP_URL = process.env.LP_URL || 'https://mienaq.com'

export const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' as any })

// シート数課金の Checkout Session を作成する。
// price は per_unit/licensed の月額20ドル(price_...)で、quantity=席数。
// webhook(checkout.session.completed) は session.metadata.seat_count を読むため、
// quantity と metadata.seat_count を必ず一致させる。
export async function createCheckoutSession(args: {
  seatCount: number
  adminEmail?: string
}): Promise<{ id: string; url: string | null }> {
  const seatCount = Math.max(1, Math.floor(args.seatCount || 1))
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: STRIPE_PRICE_ID, quantity: seatCount }],
    metadata: { seat_count: String(seatCount) },
    subscription_data: { metadata: { seat_count: String(seatCount) } },
    customer_email: args.adminEmail || undefined,
    allow_promotion_codes: true,
    success_url: `${LP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${LP_URL}/checkout/cancel`,
  })
  return { id: session.id, url: session.url }
}

export function verifyWebhookSignature(
  body: string,
  signature: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET)
}

export async function getCustomerEmail(customerId: string): Promise<string> {
  const c = await stripe.customers.retrieve(customerId)
  if (c.deleted) throw new Error(`customer ${customerId} is deleted`)
  return c.email || ''
}
