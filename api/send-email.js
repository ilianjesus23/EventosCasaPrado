const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const COMPRAS_EMAIL  = process.env.COMPRAS_EMAIL;
const FROM_EMAIL     = process.env.FROM_EMAIL || 'onboarding@resend.dev';

const LOCK_LABELS = {
  purchases:  'Lista de insumos (Compras)',
  production: 'Lista de producción',
  service:    'Equipo y mobiliario (Servicio)',
};

function getRecipients(trigger, ev, lockKey) {
  const manager = ev.manager_email;
  switch (trigger) {
    case 'created':       return [ADMIN_EMAIL, manager].filter(Boolean);
    case 'reminder':      return [ADMIN_EMAIL, manager].filter(Boolean);
    case 'closed':        return [ADMIN_EMAIL].filter(Boolean);
    case 'lock_completed':
      if (lockKey === 'purchases')  return [COMPRAS_EMAIL].filter(Boolean);
      if (lockKey === 'production') return [ADMIN_EMAIL].filter(Boolean);
      if (lockKey === 'service')    return [ADMIN_EMAIL].filter(Boolean);
      return [];
    default: return [];
  }
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

function buildEmail(trigger, ev, lockKey, daysUntil) {
  const date       = fmtDate(ev.date);
  const name       = ev.name || '—';
  const restaurant = ev.restaurant || '—';
  const manager    = ev.manager || '—';

  const card = `
    <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-top:16px;font-size:14px;color:#374151;line-height:1.6;">
      <div><strong>Evento:</strong> ${name}</div>
      <div><strong>Restaurante:</strong> ${restaurant}</div>
      <div><strong>Fecha:</strong> ${date}</div>
      <div><strong>Responsable:</strong> ${manager}</div>
      ${ev.type   ? `<div><strong>Tipo:</strong> ${ev.type}</div>` : ''}
      ${ev.guests ? `<div><strong>Personas:</strong> ${ev.guests}</div>` : ''}
    </div>`;

  const wrap = (title, body) => `
    <div style="font-family:Inter,Segoe UI,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1D9E75;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;">🍽️ EventosPro — Casa Prado</span>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">${title}</h2>
        ${body}
        ${card}
      </div>
      <div style="background:#f9fafb;padding:14px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
        Correo automático — EventosPro Casa Prado
      </div>
    </div>`;

  if (trigger === 'created') {
    return {
      subject: `✅ Nuevo evento: ${name}`,
      html: wrap('Nuevo evento registrado', '<p style="color:#6b7280;font-size:14px;margin:0;">Se ha creado un nuevo evento en el sistema.</p>'),
    };
  }
  if (trigger === 'closed') {
    return {
      subject: `🏁 Evento cerrado: ${name}`,
      html: wrap('Evento cerrado exitosamente', '<p style="color:#6b7280;font-size:14px;margin:0;">Los 3 candados han sido completados. El evento está listo.</p>'),
    };
  }
  if (trigger === 'lock_completed') {
    const label = LOCK_LABELS[lockKey] || lockKey;
    return {
      subject: `🔓 Candado completado: ${label} — ${name}`,
      html: wrap('Candado completado', `<p style="color:#6b7280;font-size:14px;margin:0;">Se completó: <strong>${label}</strong></p>`),
    };
  }
  if (trigger === 'reminder') {
    const label = daysUntil === 1 ? '¡Mañana es el evento!' : `Faltan ${daysUntil} días`;
    return {
      subject: `⏰ Recordatorio: ${name} — ${label}`,
      html: wrap('Recordatorio de evento', `<p style="color:#6b7280;font-size:14px;margin:0;">${label}</p>`),
    };
  }
  return { subject: `EventosPro: ${name}`, html: wrap(name, '') };
}

async function sendViaResend(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not set');
    return res.status(500).json({ error: 'RESEND_API_KEY not set' });
  }

  const { trigger, event: ev, lockKey } = req.body || {};
  if (!trigger || !ev) return res.status(400).json({ error: 'Missing trigger or event' });

  const recipients = getRecipients(trigger, ev, lockKey);
  if (!recipients.length) {
    console.log('No recipients for trigger:', trigger, lockKey);
    return res.status(200).json({ skipped: true });
  }

  const { subject, html } = buildEmail(trigger, ev, lockKey);

  try {
    const result = await sendViaResend(recipients, subject, html);
    console.log('Email sent:', trigger, recipients);
    return res.status(200).json({ ok: true, sent_to: recipients, result });
  } catch (err) {
    console.error('send-email error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
