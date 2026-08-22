// Nodemailer wrapper for sending the weekly digest email — SMTP config
// comes entirely from .env (see .env.example: EMAIL_HOST/PORT/USER/PASS/FROM/TO).
import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS) {
    throw new Error(
      'SMTP is not configured — set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS in .env (see .env.example)'
    );
  }

  const port = Number(EMAIL_PORT);
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port,
    secure: port === 465, // true for 465 (implicit TLS), false for 587/25 (STARTTLS)
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });
  return transporter;
}

function getRecipients() {
  const { EMAIL_TO } = process.env;
  if (!EMAIL_TO) {
    throw new Error('EMAIL_TO is not set in .env — comma-separated recipient list required');
  }
  return EMAIL_TO.split(',').map((addr) => addr.trim()).filter(Boolean);
}

/**
 * @param {string} subject
 * @param {{text: string, html?: string}} body - plain-text digest content,
 *   plus an optional HTML version (sent as a multipart alternative — the
 *   text stays as a fallback for clients that don't render HTML).
 */
export async function sendDigestEmail(subject, { text, html } = {}) {
  const transport = getTransporter();
  const to = getRecipients();
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  const info = await transport.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
  return { messageId: info.messageId, to };
}
