import Stripe from 'stripe'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY!
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!

export const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' as any })

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
