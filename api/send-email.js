const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const COMPRAS_EMAIL  = process.env.COMPRAS_EMAIL;
const FROM_EMAIL     = process.env.FROM_EMAIL || 'EventosPro <onboarding@resend.dev>';

// Recipients per trigger/lockKey
function getRecipients(trigger, ev, lockKey) {
  const manager = ev.manager_email;
  switch (trigger) {
    case 'created':
      return [ADMIN_EMAIL, manager].filter(Boolean);
    case 'reminder':
      return [ADMIN_EMAIL, manager].filter(Boolean);
    case 'closed':
      return [ADMIN_EMAIL].filter(Boolean);
    case 'lock_completed':
      if (lockKey === 'purchases')   return [COMPRAS_EMAIL].filter(Boolean);
      if (lockKey === 'production')  return [ADMIN_EMAIL].filter(Boolean);
      if (lockKey === 'service')     return [ADMIN_EMAIL].filter(Boolean);
      return [];
    default:
      return [];
  }
}

const LOCK_LABELS = {
  purchases:  'Lista de insumos (Compras)',
  production: 'Lista de producción',
  service:    'Equipo y mobiliario (Servicio)',
};

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

function buildSubjectAndHtml(trigger, ev, lockKey, daysUntil) {
  const date = fmtDate(ev.date);
  const name = ev.name;
  const restaurant = ev.restaurant || '—';
  const manager = ev.manager || '—';

  const base = `
    <div style="font-family:Inter,Segoe UI,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1D9E75;padding:20px 28px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:22px;">🍽️</span>
        <span style="color:#fff;font-size:18px;font-weight:700;">EventosPro — Casa Prado</span>
      </div>
      <div style="padding:28px;">
  `;
  const footer = `
      </div>
      <div style="background:#f9fafb;padding:14px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
        Este correo fue generado automáticamente por EventosPro.
      </div>
    </div>
  `;

  const eventCard = `
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-top:16px;font-size:14px;color:#374151;">
      <div><strong>Evento:</strong> ${name}</div>
      <div style="margin-top:6px;"><strong>Restaurante:</strong> ${restaurant}</div>
      <div style="margin-top:6px;"><strong>Fecha:</strong> ${date}</div>
      <div style="margin-top:6px;"><strong>Responsable:</strong> ${manager}</div>
      ${ev.type ? `<div style="margin-top:6px;"><strong>Tipo:</strong> ${ev.type}</div>` : ''}
      ${ev.guests ? `<div style="margin-top:6px;"><strong>Personas:</strong> ${ev.guests}</div>` : ''}
    </div>
  `;

  if (trigger === 'created') {
    return {
      subject: `✅ Nuevo evento registrado: ${name}`,
      html: base + `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Nuevo evento registrado</h2>
        <p style="color:#6b7280;font-size:14px;margin:0;">Se ha creado un nuevo evento en el sistema.</p>
        ${eventCard}
      ` + footer,
    };
  }

  if (trigger === 'closed') {
    return {
      subject: `🏁 Evento cerrado: ${name}`,
      html: base + `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Evento cerrado exitosamente</h2>
        <p style="color:#6b7280;font-size:14px;margin:0;">Los 3 candados han sido completados. El evento está listo.</p>
        ${eventCard}
      ` + footer,
    };
  }

  if (trigger === 'lock_completed') {
    const lockLabel = LOCK_LABELS[lockKey] || lockKey;
    return {
      subject: `🔓 Candado completado: ${lockLabel} — ${name}`,
      html: base + `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Candado completado</h2>
        <p style="color:#6b7280;font-size:14px;margin:0;">
          Se ha marcado como completado: <strong>${lockLabel}</strong>
        </p>
        ${eventCard}
      ` + footer,
    };
  }

  if (trigger === 'reminder') {
    const label = daysUntil === 1 ? '¡Mañana es el evento!' : `Faltan ${daysUntil} días`;
    return {
      subject: `⏰ Recordatorio: ${name} — ${label}`,
      html: base + `
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">Recordatorio de evento</h2>
        <p style="color:#6b7280;font-size:14px;margin:0;">${label}</p>
        ${eventCard}
      ` + footer,
    };
  }

  return { subject: `EventosPro: ${name}`, html: base + eventCard + footer };
}

async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error ${res.status}: ${err}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  const { trigger, event: ev, lockKey } = req.body;
  if (!trigger || !ev) return res.status(400).json({ error: 'Missing trigger or event' });

  const recipients = getRecipients(trigger, ev, lockKey);
  if (!recipients.length) return res.status(200).json({ skipped: true });

  const { subject, html } = buildSubjectAndHtml(trigger, ev, lockKey);

  try {
    await sendEmail(recipients, subject, html);
    return res.status(200).json({ ok: true, sent_to: recipients });
  } catch (err) {
    console.error('send-email error:', err);
    return res.status(500).json({ error: err.message });
  }
}
