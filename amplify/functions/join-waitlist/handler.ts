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

// Table-based layout + inline styles throughout: keeps this rendering
// correctly in Outlook desktop, Gmail, and Apple Mail alike.
function emailShell(opts: {
  greeting: string;
  intro: string;
  cta: string;
  cardTitle: string;
  bullets: string[];
  signoffLine1: string;
  signoffLine2: string;
  fineprint: string;
  link: string;
}) {
  const bulletsHtml = opts.bullets
    .map(
      (b, i) =>
        `<p style="margin:0 0 ${i === opts.bullets.length - 1 ? 0 : 8}px;font-size:14px;line-height:1.5;color:#1a1a1a;">${b}</p>`,
    )
    .join('');

  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f3ef;padding:40px 16px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:36px 32px 4px;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:20px;letter-spacing:.02em;color:#ff2e9a;">CYCLEX</div>
      </td></tr>
      <tr><td style="padding:18px 32px 0;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1a1a1a;">${opts.greeting}</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#1a1a1a;">${opts.intro}</p>
      </td></tr>
      <tr><td style="padding:0 32px 28px;" align="center">
        <a href="${opts.link}" style="display:inline-block;background:#ff2e9a;color:#07080a;text-decoration:none;font-weight:700;font-size:15px;padding:14px 28px;border-radius:999px;">${opts.cta}</a>
      </td></tr>
      <tr><td style="padding:0 32px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f7;border-radius:16px;">
          <tr><td style="padding:20px 22px;">
            <p style="margin:0 0 14px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:#e0197f;">${opts.cardTitle}</p>
            ${bulletsHtml}
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 36px;">
        <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#1a1a1a;">${opts.signoffLine1}</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#1a1a1a;font-weight:600;">${opts.signoffLine2}</p>
      </td></tr>
      <tr><td style="padding:18px 32px;background:#faf9f7;border-top:1px solid #eeeeee;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#8a8a8a;">${opts.fineprint}</p>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

const COPY: Record<Lang, { subject: string; html: (link: string) => string; text: (link: string) => string }> = {
  en: {
    subject: "You're almost on the list 🎉",
    html: (link) =>
      emailShell({
        greeting: 'Hi there, 👋',
        intro:
          "Thank you so much for joining the <strong>CYCLEX</strong> waitlist! We're building an app that trains with your cycle, not against it — and we're excited to have you with us. To add you to the list, just confirm it's really you:",
        cta: 'Confirm my email →',
        cardTitle: "What's coming your way",
        bullets: ['🔄&nbsp; Understand your cycle', '💪&nbsp; Optimize your training', '🚀&nbsp; Unlock your potential'],
        signoffLine1: 'See you soon,',
        signoffLine2: 'The CYCLEX team',
        fineprint: "If you didn't request this, you can safely ignore this email.",
        link,
      }),
    text: (link) =>
      `Thank you so much for joining the CYCLEX waitlist!\n\nConfirm your email to lock in your spot: ${link}\n\nSee you soon,\nThe CYCLEX team`,
  },
  de: {
    subject: 'Du bist fast auf der Liste 🎉',
    html: (link) =>
      emailShell({
        greeting: 'Hallo, 👋',
        intro:
          'Danke, dass du dich für die <strong>CYCLEX</strong>-Warteliste angemeldet hast! Wir entwickeln eine App, die mit deinem Zyklus trainiert, nicht dagegen — und freuen uns, dich dabei zu haben. Bestätige kurz, dass du es wirklich bist, um dich auf die Liste zu setzen:',
        cta: 'E-Mail bestätigen →',
        cardTitle: 'Das erwartet dich',
        bullets: ['🔄&nbsp; Verstehe deinen Zyklus', '💪&nbsp; Optimiere dein Training', '🚀&nbsp; Entfalte dein Potenzial'],
        signoffLine1: 'Bis bald,',
        signoffLine2: 'Dein CYCLEX-Team',
        fineprint: 'Falls du dich nicht angemeldet hast, kannst du diese E-Mail einfach ignorieren.',
        link,
      }),
    text: (link) =>
      `Danke, dass du dich für die CYCLEX-Warteliste angemeldet hast!\n\nBestätige deine E-Mail, um dir deinen Platz zu sichern: ${link}\n\nBis bald,\nDein CYCLEX-Team`,
  },
  es: {
    subject: 'Estás a un clic de unirte a CYCLEX 🎉',
    html: (link) =>
      emailShell({
        greeting: '¡Hola! 👋',
        intro:
          'Muchísimas gracias por unirte a la lista de espera de <strong>CYCLEX</strong>. Estamos creando una app que entrena con tu ciclo, no en contra de él — y nos encanta tenerte con nosotras. Para añadirte a la lista, solo confirma que eres tú:',
        cta: 'Confirmar mi email →',
        cardTitle: 'Esto es lo que te espera',
        bullets: ['🔄&nbsp; Entiende tu ciclo', '💪&nbsp; Optimiza tu entrenamiento', '🚀&nbsp; Desbloquea tu potencial'],
        signoffLine1: '¡Nos vemos pronto!',
        signoffLine2: 'El equipo de CYCLEX',
        fineprint: 'Si no has solicitado esto, puedes ignorar este correo sin problema.',
        link,
      }),
    text: (link) =>
      `¡Muchísimas gracias por unirte a la lista de espera de CYCLEX!\n\nConfirma tu email para asegurar tu sitio: ${link}\n\n¡Nos vemos pronto!\nEl equipo de CYCLEX`,
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

    // TEMPORARY: thecyclexapp.com isn't verified in SES yet (DNS access still
    // pending), so SES sandbox mode would reject email to anyone who hasn't
    // been individually verified. Until that's sorted, skip the confirmation
    // email entirely and mark signups confirmed immediately. confirmToken is
    // still generated/stored so re-enabling email confirmation later (see
    // SKIP_EMAIL_CONFIRMATION) needs no schema change.
    const SKIP_EMAIL_CONFIRMATION = true;

    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          email,
          language,
          createdAt: now,
          consentAt: now,
          status: SKIP_EMAIL_CONFIRMATION ? 'confirmed' : 'pending',
          confirmToken,
          confirmedAt: SKIP_EMAIL_CONFIRMATION ? now : null,
          source: typeof payload.source === 'string' ? payload.source : 'landing-page',
        },
        ConditionExpression: 'attribute_not_exists(email)',
      }),
    );

    if (!SKIP_EMAIL_CONFIRMATION) {
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
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error('joinWaitlist error', err);
    return json(500, { ok: false, error: 'server_error' });
  }
};
