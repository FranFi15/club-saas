import { Resend } from 'resend';

let resendClient = null;

function getResend() {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key) return null;
  if (!resendClient) resendClient = new Resend(key);
  return resendClient;
}

function defaultFrom() {
  return (
    String(process.env.EMAIL_FROM || '').trim() ||
    'Hermes Club <onboarding@resend.dev>'
  );
}

/**
 * Send a transactional email via Resend.
 * @returns {Promise<{ id?: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const resend = getResend();
  if (!resend) {
    const err = new Error(
      'Email no configurado: falta RESEND_API_KEY en el servidor.',
    );
    err.statusCode = 503;
    throw err;
  }

  const { data, error } = await resend.emails.send({
    from: defaultFrom(),
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text: text || undefined,
  });

  if (error) {
    const err = new Error(error.message || 'No se pudo enviar el email.');
    err.statusCode = 502;
    throw err;
  }

  return data || {};
}

export function isEmailConfigured() {
  return Boolean(String(process.env.RESEND_API_KEY || '').trim());
}
