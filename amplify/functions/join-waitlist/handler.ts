import type { Handler } from 'aws-lambda';
import { randomBytes } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

const TABLE = process.env.WAITLIST_TABLE_NAME!;
const RATE_TABLE = process.env.RATE_LIMIT_TABLE_NAME!;
const FROM = process.env.SES_FROM_ADDRESS!;
const CONFIRM_BASE_URL = process.env.CONFIRM_BASE_URL!;

const RATE_LIMIT_PER_HOUR = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORTED_LANGS = ['en', 'de', 'es'] as const;

type Lang = (typeof SUPPORTED_LANGS)[number];

const COPY: Record<Lang, { subject: string; html: (link: string) => string; text: (link: string) => string }> = {
  en: {
    subject: 'Confirm your spot on the CYCLEX waitlist',
    html: (link) =>
      `<p>Hi,</p><p>Tap the button below to confirm your email and join the CYCLEX waitlist.</p>` +
      `<p><a href="${link}" style="background:#FF2E9A;color:#07080a;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Confirm my email</a></p>` +
      `<p style="color:#888;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`,
    text: (link) => `Confirm your email to join the CYCLEX waitlist: ${link}`,
  },
  de: {
    subject: 'Bestätige deinen Platz auf der CYCLEX-Warteliste',
    html: (link) =>
      `<p>Hallo,</p><p>Klicke auf den Button, um deine E-Mail zu bestätigen und der CYCLEX-Warteliste beizutreten.</p>` +
      `<p><a href="${link}" style="background:#FF2E9A;color:#07080a;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">E-Mail bestätigen</a></p>` +
      `<p style="color:#888;font-size:13px">Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>`,
    text: (link) => `Bestätige deine E-Mail für die CYCLEX-Warteliste: ${link}`,
  },
  es: {
    subject: 'Confirma tu sitio en la lista de espera de CYCLEX',
    html: (link) =>
      `<p>Hola,</p><p>Pulsa el botón para confirmar tu email y unirte a la lista de espera de CYCLEX.</p>` +
      `<p><a href="${link}" style="background:#FF2E9A;color:#07080a;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Confirmar mi email</a></p>` +
      `<p style="color:#888;font-size:13px">Si no has solicitado esto, puedes ignorar este correo.</p>`,
    text: (link) => `Confirma tu email para la lista de espera de CYCLEX: ${link}`,
  },
};

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
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

    // Already registered (pending or confirmed): respond OK without
    // duplicating the row or sending another confirmation email.
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
          status: 'pending',
          confirmToken,
          confirmedAt: null,
          source: typeof payload.source === 'string' ? payload.source : 'landing-page',
        },
        ConditionExpression: 'attribute_not_exists(email)',
      }),
    );

    const link = `${CONFIRM_BASE_URL}?token=${confirmToken}`;
    const copy = COPY[language];

    await ses.send(
      new SendEmailCommand({
        Source: FROM,
        Destination: { ToAddresses: [email] },
        Message: {
          Subject: { Data: copy.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: copy.html(link), Charset: 'UTF-8' },
            Text: { Data: copy.text(link), Charset: 'UTF-8' },
          },
        },
      }),
    );

    return json(200, { ok: true });
  } catch (err) {
    console.error('joinWaitlist error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
