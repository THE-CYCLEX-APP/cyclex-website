import type { Handler } from 'aws-lambda';
import { randomBytes } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { isLang, renderWelcomeEmailHtml, renderWelcomeEmailText, welcomeEmailSubject, type Lang } from '../shared/welcome-email';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

const TABLE = process.env.WAITLIST_TABLE_NAME!;
const RATE_TABLE = process.env.RATE_LIMIT_TABLE_NAME!;
const FROM = process.env.SES_FROM_ADDRESS!;

const RATE_LIMIT_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// TEMPORARY: thecyclexapp.com's SES domain identity is still being verified
// (DNS was only just fixed), so sandbox mode would reject mail to anyone who
// isn't individually verified. Flip this to true once SES shows
// thecyclexapp.com as "Verified" and production access is granted — from
// then on, every new signup gets the welcome email automatically. Until
// then, run `send-welcome-batch` by hand to catch up everyone who joined
// while this was off.
const SEND_WELCOME_EMAIL = false;

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export const handler: Handler = async (event) => {
  try {
    // Lambda Function URLs handle CORS preflight automatically when `cors` is
    // configured in amplify/backend.ts, but we still answer OPTIONS cleanly.
    if (event.requestContext?.http?.method === 'OPTIONS') {
      return { statusCode: 204, body: '' };
    }

    const sourceIp: string = event.requestContext?.http?.sourceIp || 'unknown';

    let payload: Record<string, unknown> = {};
    try {
      payload = event.body ? JSON.parse(event.body) : {};
    } catch {
      return json(400, { ok: false, error: 'invalid_json' });
    }

    // Honeypot: a real visitor never sees or fills this hidden field.
    // Pretend success so bots don't learn they were caught.
    if (payload.company) {
      return json(200, { ok: true });
    }

    if (payload.consent !== true) {
      return json(400, { ok: false, error: 'consent_required' });
    }

    const email = String(payload.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return json(400, { ok: false, error: 'invalid_email' });
    }

    const language: Lang = isLang(payload.language) ? payload.language : 'en';

    // Rate limit: max 5 requests per IP per hour, enforced atomically in DynamoDB.
    const hourBucket = new Date().toISOString().slice(0, 13); // e.g. "2026-10-26T16"
    const rateKey = `${sourceIp}#${hourBucket}`;
    const ttl = Math.floor(Date.now() / 1000) + 3600;

    try {
      await ddb.send(
        new UpdateCommand({
          TableName: RATE_TABLE,
          Key: { ipHourKey: rateKey },
          UpdateExpression: 'SET reqCount = if_not_exists(reqCount, :zero) + :one, #ttl = if_not_exists(#ttl, :ttl)',
          ConditionExpression: 'attribute_not_exists(reqCount) OR reqCount < :limit',
          ExpressionAttributeNames: { '#ttl': 'ttl' },
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':limit': RATE_LIMIT_PER_HOUR,
            ':ttl': ttl,
          },
        }),
      );
    } catch (err: any) {
      if (err?.name === 'ConditionalCheckFailedException') {
        return json(429, { ok: false, error: 'rate_limited' });
      }
      throw err;
    }

    // Already registered: respond OK without duplicating the row or
    // sending another welcome email.
    const existing = await ddb.send(new GetCommand({ TableName: TABLE, Key: { email } }));
    if (existing.Item) {
      return json(200, { ok: true });
    }

    const confirmToken = randomBytes(24).toString('hex');
    const now = new Date().toISOString();

    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          email,
          language,
          createdAt: now,
          consentAt: now,
          status: 'confirmed',
          confirmToken,
          confirmedAt: now,
          source: typeof payload.source === 'string' ? payload.source : 'landing-page',
        },
        ConditionExpression: 'attribute_not_exists(email)',
      }),
    );

    if (SEND_WELCOME_EMAIL) {
      await ses.send(
        new SendEmailCommand({
          Source: FROM,
          Destination: { ToAddresses: [email] },
          Message: {
            Subject: { Data: welcomeEmailSubject(language), Charset: 'UTF-8' },
            Body: {
              Html: { Data: renderWelcomeEmailHtml(language), Charset: 'UTF-8' },
              Text: { Data: renderWelcomeEmailText(language), Charset: 'UTF-8' },
            },
          },
        }),
      );
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { email },
          UpdateExpression: 'SET welcomeEmailSentAt = :now',
          ExpressionAttributeValues: { ':now': now },
        }),
      );
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('joinWaitlist error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
