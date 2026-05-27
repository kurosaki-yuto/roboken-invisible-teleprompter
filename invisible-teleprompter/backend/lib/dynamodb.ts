import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'

const TEAMS_TABLE = process.env.TEAMS_TABLE || 'mienaq-teams'
const SEATS_TABLE = process.env.SEATS_TABLE || 'mienaq-team-seats'
const TEAMS_CUSTOMER_INDEX = 'stripe-customer-index'
const SEATS_LICENSE_INDEX = 'license-index'
const SEATS_TEAM_INDEX = 'team-index'

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export interface Team {
  id: string
  stripeCustomerId: string
  stripeSubscriptionId: string
  adminEmail: string
  seatCount: number
  status: 'active' | 'past_due' | 'canceled'
  createdAt: number
  updatedAt: number
}

export interface TeamSeat {
  id: string
  teamId: string
  licenseKey: string
  inviteToken?: string
  email?: string
  isAdmin: boolean
  status: 'pending' | 'active' | 'revoked'
  activatedAt?: number
  lastVerifiedAt?: number
  createdAt: number
}

export async function getTeam(id: string): Promise<Team | null> {
  const r = await ddb.send(new GetCommand({ TableName: TEAMS_TABLE, Key: { id } }))
  return (r.Item as Team) || null
}

export async function getTeamByCustomer(stripeCustomerId: string): Promise<Team | null> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TEAMS_TABLE,
      IndexName: TEAMS_CUSTOMER_INDEX,
      KeyConditionExpression: 'stripeCustomerId = :cid',
      ExpressionAttributeValues: { ':cid': stripeCustomerId },
      Limit: 1,
    }),
  )
  return (r.Items?.[0] as Team) || null
}

export async function putTeam(team: Team): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TEAMS_TABLE, Item: team }))
}

export async function updateTeamSeatCount(id: string, seatCount: number): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TEAMS_TABLE,
      Key: { id },
      UpdateExpression: 'SET seatCount = :c, updatedAt = :u',
      ExpressionAttributeValues: { ':c': seatCount, ':u': Date.now() },
    }),
  )
}

export async function updateTeamStatus(
  id: string,
  status: 'active' | 'past_due' | 'canceled',
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: TEAMS_TABLE,
      Key: { id },
      UpdateExpression: 'SET #s = :s, updatedAt = :u',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': status, ':u': Date.now() },
    }),
  )
}

export async function putSeat(seat: TeamSeat): Promise<void> {
  await ddb.send(new PutCommand({ TableName: SEATS_TABLE, Item: seat }))
}

export async function getSeatByLicense(licenseKey: string): Promise<TeamSeat | null> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: SEATS_TABLE,
      IndexName: SEATS_LICENSE_INDEX,
      KeyConditionExpression: 'licenseKey = :k',
      ExpressionAttributeValues: { ':k': licenseKey },
      Limit: 1,
    }),
  )
  return (r.Items?.[0] as TeamSeat) || null
}

export async function getSeatByInviteToken(token: string): Promise<TeamSeat | null> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: SEATS_TABLE,
      IndexName: 'invite-index',
      KeyConditionExpression: 'inviteToken = :t',
      ExpressionAttributeValues: { ':t': token },
      Limit: 1,
    }),
  )
  return (r.Items?.[0] as TeamSeat) || null
}

export async function listSeatsByTeam(teamId: string): Promise<TeamSeat[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: SEATS_TABLE,
      IndexName: SEATS_TEAM_INDEX,
      KeyConditionExpression: 'teamId = :t',
      ExpressionAttributeValues: { ':t': teamId },
    }),
  )
  return (r.Items as TeamSeat[]) || []
}

export async function activateSeat(
  id: string,
  email: string,
  licenseKey: string,
): Promise<void> {
  const now = Date.now()
  await ddb.send(
    new UpdateCommand({
      TableName: SEATS_TABLE,
      Key: { id },
      UpdateExpression:
        'SET email = :e, licenseKey = :l, #s = :s, activatedAt = :a, lastVerifiedAt = :a REMOVE inviteToken',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':e': email,
        ':l': licenseKey,
        ':s': 'active',
        ':a': now,
      },
    }),
  )
}

export async function revokeSeat(id: string): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: SEATS_TABLE,
      Key: { id },
      UpdateExpression: 'SET #s = :s',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':s': 'revoked' },
    }),
  )
}

export async function deleteSeat(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: SEATS_TABLE, Key: { id } }))
}
