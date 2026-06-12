import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'

import { createCheckoutSession } from '../lib/stripe'
import { validateSeatCount } from '../lib/validation'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
}

// LP の「購入」ボタンから席数を受け取り、Stripe Checkout の URL を返す。
// body: { seatCount: number, adminEmail?: string }
export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' }
  }

  let body: { seatCount?: number; adminEmail?: string }
  try {
    body = event.body ? JSON.parse(event.body) : {}
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'invalid json' }) }
  }

  const seat = validateSeatCount(body.seatCount)
  if (!seat.ok) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: seat.error || 'seatCount must be a positive integer' }),
    }
  }

  try {
    const session = await createCheckoutSession({ seatCount: seat.value, adminEmail: body.adminEmail })
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.id, url: session.url }),
    }
  } catch (e) {
    console.error('[checkout] error:', e)
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: (e as Error).message }),
    }
  }
}
