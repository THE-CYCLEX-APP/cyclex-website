export const SUPPORTED_LANGS = ['en', 'de', 'es'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

interface WelcomeCopy {
  subject: string;
  preheader: string;
  greeting: string;
  p1: string;
  p2: string;
  p3: string;
  cardLabel: string;
  cardItems: [string, string, string];
  badge: string;
  shareLine: string;
  ctaLabel: string;
  signoffLine1: string;
  signoffLine2: string;
  footerReceiving: string;
  footerOptOut: string;
}

const COPY: Record<Lang, WelcomeCopy> = {
  en: {
    subject: 'Welcome to CYCLEX 🩷',
    preheader: "You're in. Here's what happens next.",
    greeting: 'Hi there, 👋',
    p1: 'Thank you for joining the CYCLEX waitlist.',
    p2: "You're joining a movement to make women's training better. We've spent months building an app that works with your cycle instead of ignoring it, and you're one of the first to be part of it.",
    p3: "We'll keep you posted on every step as we get closer to launch.",
    cardLabel: 'WHAT CYCLEX DOES FOR YOU',
    cardItems: ['Understand<br>your cycle', 'Optimize<br>your training', 'Unlock<br>your potential'],
    badge: "YOU'RE ON THE LIST",
    shareLine: "Know someone who'd love this too? Share CYCLEX with her. 💕",
    ctaLabel: 'Share thecyclexapp.com →',
    signoffLine1: 'Thank you,',
    signoffLine2: 'The CYCLEX team',
    footerReceiving: "You're receiving this because you joined the waitlist at thecyclexapp.com.",
    footerOptOut: "If you'd rather not hear from us, just reply and let us know.",
  },
  de: {
    subject: 'Willkommen bei CYCLEX 🩷',
    preheader: 'Du bist dabei. So geht es weiter.',
    greeting: 'Hallo, 👋',
    p1: 'Danke, dass du dich für die CYCLEX-Warteliste angemeldet hast.',
    p2: 'Du wirst Teil einer Bewegung, die Training für Frauen besser macht. Wir haben Monate damit verbracht, eine App zu bauen, die mit deinem Zyklus arbeitet statt ihn zu ignorieren — und du gehörst zu den Ersten, die dabei sind.',
    p3: 'Wir halten dich auf dem Laufenden, während wir dem Start näherkommen.',
    cardLabel: 'DAS BRINGT DIR CYCLEX',
    cardItems: ['Verstehe<br>deinen Zyklus', 'Optimiere<br>dein Training', 'Entfalte dein<br>Potenzial'],
    badge: 'DU BIST AUF DER LISTE',
    shareLine: 'Kennst du jemanden, der das auch lieben würde? Teile CYCLEX mit ihr. 💕',
    ctaLabel: 'thecyclexapp.com teilen →',
    signoffLine1: 'Danke,',
    signoffLine2: 'Dein CYCLEX-Team',
    footerReceiving: 'Du erhältst diese E-Mail, weil du dich auf der Warteliste auf thecyclexapp.com angemeldet hast.',
    footerOptOut: 'Wenn du lieber nichts mehr von uns hören möchtest, antworte einfach auf diese E-Mail.',
  },
  es: {
    subject: 'Bienvenida a CYCLEX 🩷',
    preheader: 'Ya estás dentro. Esto es lo que viene ahora.',
    greeting: '¡Hola! 👋',
    p1: 'Gracias por unirte a la lista de espera de CYCLEX.',
    p2: 'Te unes a un movimiento para mejorar el entrenamiento femenino. Llevamos meses creando una app que trabaja con tu ciclo en vez de ignorarlo, y eres una de las primeras en formar parte de esto.',
    p3: 'Te iremos contando cada paso según nos acerquemos al lanzamiento.',
    cardLabel: 'LO QUE CYCLEX HACE POR TI',
    cardItems: ['Entiende<br>tu ciclo', 'Optimiza<br>tu entrenamiento', 'Desbloquea<br>tu potencial'],
    badge: 'YA ESTÁS EN LA LISTA',
    shareLine: '¿Conoces a alguien a quien le encantaría esto? Comparte CYCLEX con ella. 💕',
    ctaLabel: 'Compartir thecyclexapp.com →',
    signoffLine1: 'Gracias,',
    signoffLine2: 'El equipo de CYCLEX',
    footerReceiving: 'Recibes este email porque te uniste a la lista de espera en thecyclexapp.com.',
    footerOptOut: 'Si prefieres no saber más de nosotras, simplemente responde a este email y lo tendremos en cuenta.',
  },
};

// Same table-based structure/styling as the Claude Design mockup, with the
// Brevo-specific {{unsubscribe}} merge tag swapped for a plain opt-out line
// (we're sending straight through SES, not a marketing-ESP template engine).
export function renderWelcomeEmailHtml(lang: Lang): string {
  const c = COPY[lang];
  const [item1, item2, item3] = c.cardItems;

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Welcome to CYCLEX</title>
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,600;1,600&family=Space+Grotesk:wght@400;500;600&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
<style>
body{margin:0;padding:0;background:#07080a}
a{color:#FF2E9A}a:hover{color:#ffffff}
@media (max-width:620px){.wrap{width:100%!important}.pad{padding-left:28px!important;padding-right:28px!important}.q{font-size:30px!important}.h1{font-size:34px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:#07080a;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${c.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#07080a;">
<tr><td align="center" style="padding:40px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

<tr><td class="pad" align="center" style="padding:8px 48px 36px;">
<div style="font-family:'Space Mono','Courier New',monospace;font-weight:700;font-size:24px;letter-spacing:0.14em;color:#f0efe8;">CYCLEX</div>
</td></tr>

<tr><td class="pad" style="padding:0 48px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;color:#f0efe8;">
<div class="h1" style="font-family:'Lora',Georgia,serif;font-weight:600;font-size:40px;line-height:1.15;letter-spacing:-0.01em;">${c.greeting}</div>
<p style="margin:24px 0 0;font-size:17px;line-height:1.65;color:#d9d8d1;">${c.p1}</p>
<p style="margin:16px 0 0;font-size:17px;line-height:1.65;color:#d9d8d1;">${c.p2}</p>
<p style="margin:16px 0 0;font-size:17px;line-height:1.65;color:#d9d8d1;">${c.p3}</p>
</td></tr>

<tr><td class="pad" style="padding:40px 48px 0;">
<div style="font-family:'Space Mono','Courier New',monospace;font-weight:700;font-size:12px;letter-spacing:0.12em;color:#FF2E9A;text-align:center;">${c.cardLabel}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
<td class="fb" width="32%" valign="top" style="width:32%;padding:22px 12px;border:1px solid rgba(240,239,232,0.12);border-radius:18px;text-align:center;background:rgba(240,239,232,0.03);">
<div style="font-size:26px;line-height:1;">🔄</div>
<div style="margin-top:12px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:600;font-size:15px;line-height:1.3;color:#f0efe8;">${item1}</div>
</td><td width="2%" style="width:2%;min-width:10px;font-size:1px;">&nbsp;</td><td class="fb" width="32%" valign="top" style="width:32%;padding:22px 12px;border:1px solid rgba(240,239,232,0.12);border-radius:18px;text-align:center;background:rgba(240,239,232,0.03);">
<div style="font-size:26px;line-height:1;">💪</div>
<div style="margin-top:12px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:600;font-size:15px;line-height:1.3;color:#f0efe8;">${item2}</div>
</td><td width="2%" style="width:2%;min-width:10px;font-size:1px;">&nbsp;</td><td class="fb" width="32%" valign="top" style="width:32%;padding:22px 12px;border:1px solid rgba(240,239,232,0.12);border-radius:18px;text-align:center;background:rgba(240,239,232,0.03);">
<div style="font-size:26px;line-height:1;">🚀</div>
<div style="margin-top:12px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:600;font-size:15px;line-height:1.3;color:#f0efe8;">${item3}</div>
</td>
</tr></table>
</td></tr>

<tr><td class="pad" style="padding:40px 48px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-radius:28px;background-color:#1a0a12;background-image:radial-gradient(120% 90% at 0% 0%,#4a1430 0%,#1a0a12 45%,#0b0b0d 100%);">
<tr><td style="padding:40px 40px 44px;">
<div style="font-family:'Space Mono','Courier New',monospace;font-weight:700;font-size:13px;letter-spacing:0.12em;color:#FF2E9A;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#FF2E9A;margin-right:10px;vertical-align:middle;"></span>${c.badge}</div>
<div class="q" style="margin-top:30px;font-family:'Lora',Georgia,serif;font-weight:600;font-size:56px;line-height:1.05;letter-spacing:-0.01em;color:#f0efe8;">Train your <em style="color:#FF2E9A;font-style:italic;">way.</em></div>
</td></tr>
</table>
</td></tr>

<tr><td class="pad" style="padding:40px 48px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;color:#d9d8d1;">
<p style="margin:0;font-size:17px;line-height:1.65;">${c.shareLine}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;"><tr>
<td style="border-radius:999px;background:#FF2E9A;"><a href="https://thecyclexapp.com" style="display:inline-block;padding:15px 30px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:600;font-size:16px;color:#07080a;text-decoration:none;border-radius:999px;">${c.ctaLabel}</a></td>
</tr></table>
<p style="margin:40px 0 0;font-size:17px;line-height:1.65;">${c.signoffLine1}<br><span style="color:#f0efe8;font-weight:600;">${c.signoffLine2}</span></p>
</td></tr>

<tr><td class="pad" align="center" style="padding:56px 48px 8px;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#8a8984;">
<a href="https://www.instagram.com/thecyclexapp/" style="color:#f0efe8;text-decoration:none;">Instagram @thecyclexapp</a> &nbsp;·&nbsp; <a href="mailto:contact@thecyclexapp.com" style="color:#f0efe8;text-decoration:none;">contact@thecyclexapp.com</a><br>
${c.footerReceiving}<br>
${c.footerOptOut}
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderWelcomeEmailText(lang: Lang): string {
  const c = COPY[lang];
  const items = c.cardItems.map((i) => i.replace('<br>', ' ')).join(' / ');
  return `${c.greeting}\n\n${c.p1}\n\n${c.p2}\n\n${c.p3}\n\n${c.cardLabel}: ${items}\n\n${c.shareLine}\nhttps://thecyclexapp.com\n\n${c.signoffLine1}\n${c.signoffLine2}\n\n${c.footerReceiving}\n${c.footerOptOut}`;
}

export function welcomeEmailSubject(lang: Lang): string {
  return COPY[lang].subject;
}
