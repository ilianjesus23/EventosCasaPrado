// Vercel Cron — corre cada día a las 9am UTC
// Busca eventos en 7 y 1 día y manda recordatorios.

const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_ANON_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL;
const FROM_EMAIL     = process.env.FROM_EMAIL || 'onboarding@resend.dev';

function addDays(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

async function getEventsForDate(dateStr) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/events?date=eq.${dateStr}&select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

async function sendReminder(ev, daysUntil) {
  const to = [ADMIN_EMAIL, ev.manager_email].filter(Boolean);
  if (!to.length) return;

  const name    = ev.name || '—';
  const label   = daysUntil === 1 ? '¡Mañana es el evento!' : `Faltan ${daysUntil} días para el evento`;
  const html = `
    <div style="font-family:Inter,Segoe UI,sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1D9E75;padding:20px 28px;">
        <span style="color:#fff;font-size:18px;font-weight:700;">🍽️ EventosPro — Casa Prado</span>
      </div>
      <div style="padding:28px;">
        <h2 style="margin:0 0 8px;font-size:20px;color:#111827;">⏰ Recordatorio de evento</h2>
        <p style="color:#6b7280;font-size:14px;margin:0 0 16px;">${label}</p>
        <div style="background:#f9fafb;border-radius:8px;padding:16px;font-size:14px;color:#374151;line-height:1.6;">
          <div><strong>Evento:</strong> ${name}</div>
          <div><strong>Restaurante:</strong> ${ev.restaurant || '—'}</div>
          <div><strong>Fecha:</strong> ${fmtDate(ev.date)}</div>
          <div><strong>Responsable:</strong> ${ev.manager || '—'}</div>
          ${ev.guests ? `<div><strong>Personas:</strong> ${ev.guests}</div>` : ''}
        </div>
      </div>
      <div style="background:#f9fafb;padding:14px 28px;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
        Correo automático — EventosPro Casa Prado
      </div>
    </div>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject: `⏰ Recordatorio: ${name} — ${label}`, html }),
  });
}

module.exports = async function handler(req, res) {
  if (!RESEND_API_KEY || !SUPABASE_URL) {
    return res.status(500).json({ error: 'Missing env vars' });
  }

  const [events7, events1] = await Promise.all([
    getEventsForDate(addDays(7)),
    getEventsForDate(addDays(1)),
  ]);

  const results = [];
  for (const ev of events7) { await sendReminder(ev, 7); results.push({ name: ev.name, days: 7 }); }
  for (const ev of events1) { await sendReminder(ev, 1); results.push({ name: ev.name, days: 1 }); }

  return res.status(200).json({ ok: true, reminders_sent: results });
};
