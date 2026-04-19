/**
 * Cloudflare Worker: Armory Records Intake Proxy
 *
 * Handles application form submissions from armoryrecords.net
 * and emails them to Matthew Messina.
 *
 * SETUP:
 * 1. dash.cloudflare.com → Workers & Pages → Create
 * 2. Name it "armory-intake"
 * 3. Paste this code
 * 4. Settings → Variables and Secrets → add (encrypted):
 *    - RESEND_API_KEY = Resend API token
 * 5. Expected endpoint: armory-intake.<subdomain>.workers.dev
 */

const ALLOWED_ORIGINS = [
  'https://armoryrecords.net',
  'https://www.armoryrecords.net',
  'https://c9352221.github.io',
  'http://localhost',
  'http://127.0.0.1',
];

const CLIENT_EMAIL = 'mattyacids@yahoo.com';
const FROM_EMAIL = 'Armory Records <applications@armoryrecords.net>';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendEmail(env, body) {
  const name = escapeHtml(body.name);
  const email = escapeHtml(body.email);
  const referredBy = escapeHtml(body.referredBy || 'Not specified');
  const services = escapeHtml(body.services || 'Not specified');
  const message = escapeHtml(body.message || '');

  const subject = `New Armory Records Application — ${body.name || 'Unknown'}`;

  const text = [
    `A new application just came through armoryrecords.net.`,
    ``,
    `Name: ${body.name || '—'}`,
    `Email: ${body.email || '—'}`,
    `Referred by: ${body.referredBy || '—'}`,
    `Services of interest: ${body.services || '—'}`,
    ``,
    `What they're looking to improve:`,
    body.message || '(none provided)',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #131b2b;">
      <h2 style="color: #1e3a5f; border-bottom: 2px solid #b8892e; padding-bottom: 10px;">New Armory Records Application</h2>
      <p style="color: #5a6376;">A new application just came through <strong>armoryrecords.net</strong>.</p>
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 8px 0; color: #8c93a3; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">Name</td></tr>
        <tr><td style="padding: 0 0 16px; font-size: 16px; border-bottom: 1px solid #e5e2d6;">${name}</td></tr>
        <tr><td style="padding: 16px 0 8px; color: #8c93a3; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">Email</td></tr>
        <tr><td style="padding: 0 0 16px; font-size: 16px; border-bottom: 1px solid #e5e2d6;"><a href="mailto:${email}" style="color: #1e3a5f;">${email}</a></td></tr>
        <tr><td style="padding: 16px 0 8px; color: #8c93a3; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">Referred by</td></tr>
        <tr><td style="padding: 0 0 16px; font-size: 16px; border-bottom: 1px solid #e5e2d6;">${referredBy}</td></tr>
        <tr><td style="padding: 16px 0 8px; color: #8c93a3; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">Services of interest</td></tr>
        <tr><td style="padding: 0 0 16px; font-size: 16px; border-bottom: 1px solid #e5e2d6;">${services}</td></tr>
        <tr><td style="padding: 16px 0 8px; color: #8c93a3; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em;">What they're looking to improve</td></tr>
        <tr><td style="padding: 0 0 16px; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</td></tr>
      </table>
      <p style="font-size: 13px; color: #8c93a3; border-top: 1px solid #e5e2d6; padding-top: 16px; margin-top: 24px;">Reply directly to this email to respond to ${name}.</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [CLIENT_EMAIL],
      reply_to: body.email,
      subject,
      text,
      html,
    }),
  });

  return res.ok;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    const safeOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0];

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(safeOrigin) });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ success: false, message: 'Method not allowed' }, 405, safeOrigin);
    }

    if (!isAllowed) {
      return jsonResponse({ success: false, message: 'Forbidden' }, 403, safeOrigin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ success: false, message: 'Invalid request body' }, 400, safeOrigin);
    }

    if (!body.name || !body.email) {
      return jsonResponse({ success: false, message: 'Name and email are required' }, 400, safeOrigin);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return jsonResponse({ success: false, message: 'Invalid email address' }, 400, safeOrigin);
    }

    if (!env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return jsonResponse({ success: false, message: 'Service not configured' }, 503, safeOrigin);
    }

    try {
      const sent = await sendEmail(env, body);
      if (!sent) {
        return jsonResponse({ success: false, message: 'Unable to send application. Please try again.' }, 502, safeOrigin);
      }
      return jsonResponse({ success: true, message: 'Application received' }, 200, safeOrigin);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ success: false, message: 'Service unavailable. Please try again later.' }, 503, safeOrigin);
    }
  },
};
