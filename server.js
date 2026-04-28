/**
 * ╔══════════════════════════════════════════════════════╗
 *  Sukhdev Earth Movers — Lead Capture Backend Server
 *  Stack : Node.js + Express
 *  Routes: POST /lead
 *  Stores: leads.json (local) + Google Sheets (optional)
 *  Notify: WhatsApp API + Nodemailer (SMTP)
 * ╚══════════════════════════════════════════════════════╝
 */

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const fs         = require('fs');
const path       = require('path');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ─── MIDDLEWARE ────────────────────────────────────────────────── */
app.use(cors({
  origin: [
    'http://localhost:5500',
    'https://yourdomain.netlify.app',   // ← update after Netlify deploy
    'https://sukhdevearthmovers.com'    // ← update if custom domain
  ]
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─── STORAGE PATH ──────────────────────────────────────────────── */
const LEADS_FILE = path.join(__dirname, 'leads.json');

function readLeads() {
  if (!fs.existsSync(LEADS_FILE)) fs.writeFileSync(LEADS_FILE, '[]');
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf-8'));
}

function saveLead(lead) {
  const leads = readLeads();
  leads.push(lead);
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

/* ─── EMAIL TRANSPORTER ─────────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,   // smtp.gmail.com
  port:   Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS    // Gmail App Password
  }
});

/* ─── WHATSAPP HELPER ───────────────────────────────────────────── */
async function sendWhatsApp(phone, message) {
  if (!process.env.WA_API_URL || !process.env.WA_API_TOKEN) {
    console.warn('[WA] API not configured — skipping WhatsApp notification.');
    return;
  }
  const res = await fetch(process.env.WA_API_URL, {
    method : 'POST',
    headers: {
      'Content-Type' : 'application/json',
      'Authorization': `Bearer ${process.env.WA_API_TOKEN}`
    },
    body: JSON.stringify({ phone, message })
  });
  if (!res.ok) throw new Error(`WhatsApp API error: ${res.status}`);
}

/* ─── MAIN LEAD ENDPOINT ────────────────────────────────────────── */
/**
 * POST /lead
 * Body: { name, phone, service, location?, message?, source? }
 */
app.post('/lead', async (req, res) => {
  const { name, phone, service, location, message, source } = req.body;

  // ── Validate ──
  if (!name || !phone || !service) {
    return res.status(400).json({
      success: false,
      error  : 'name, phone, and service are required.'
    });
  }

  const lead = {
    id       : uuidv4(),
    name     : name.trim(),
    phone    : phone.trim(),
    service  : service.trim(),
    location : (location || '').trim(),
    message  : (message  || '').trim(),
    source   : source || 'website',
    timestamp: new Date().toISOString()
  };

  const errors = [];

  // ── 1. Save to file ──
  try {
    saveLead(lead);
    console.log(`[LEAD SAVED] ${lead.id} — ${lead.name} (${lead.phone})`);
  } catch (err) {
    console.error('[LEAD SAVE ERROR]', err.message);
    errors.push('storage_failed');
  }

  // ── 2. Notify Admin via WhatsApp ──
  const adminMsg =
    `🚧 NEW LEAD — Sukhdev Earth Movers\n\n` +
    `Name    : ${lead.name}\n` +
    `Phone   : ${lead.phone}\n` +
    `Service : ${lead.service}\n` +
    `Location: ${lead.location || 'Not specified'}\n` +
    `Message : ${lead.message || '—'}\n` +
    `Time    : ${new Date(lead.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
    `ID      : ${lead.id}`;

  try {
    await sendWhatsApp(process.env.ADMIN_PHONE, adminMsg);
    console.log('[WA ADMIN] Notification sent.');
  } catch (err) {
    console.error('[WA ADMIN ERROR]', err.message);
    errors.push('whatsapp_admin_failed');
  }

  // ── 3. Confirmation WhatsApp to user (10-second delay) ──
  setTimeout(async () => {
    const userMsg =
      `Hi ${lead.name} 👋\n\n` +
      `Thank you for contacting *Sukhdev Earth Movers*.\n\n` +
      `We have received your enquiry for *${lead.service}*.\n\n` +
      `Our team will get back to you within 24 hours.\n\n` +
      `📞 02836-241384\n` +
      `📍 Anjar, Kutch – Gujarat\n\n` +
      `— Team Sukhdev Earth Movers`;
    try {
      await sendWhatsApp(lead.phone, userMsg);
      console.log('[WA USER] Confirmation sent.');
    } catch (err) {
      console.error('[WA USER ERROR]', err.message);
    }
  }, 10_000);

  // ── 4. Admin Email Notification ──
  try {
    await transporter.sendMail({
      from   : `"SEM Website" <${process.env.SMTP_USER}>`,
      to     : process.env.ADMIN_EMAIL,
      subject: `[New Lead] ${lead.service} — ${lead.name}`,
      html   : `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:8px;overflow:hidden;">
          <div style="background:#F5A200;padding:20px 24px;">
            <h2 style="margin:0;color:#111;font-size:1.4rem;">🚧 New Enquiry — Sukhdev Earth Movers</h2>
          </div>
          <div style="padding:24px;background:#fff;">
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 0;color:#888;width:110px;">Name</td>      <td style="padding:8px 0;font-weight:600;">${lead.name}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Phone</td>     <td style="padding:8px 0;">${lead.phone}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Service</td>   <td style="padding:8px 0;">${lead.service}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Location</td>  <td style="padding:8px 0;">${lead.location || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Message</td>   <td style="padding:8px 0;">${lead.message || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Time</td>      <td style="padding:8px 0;">${new Date(lead.timestamp).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})}</td></tr>
              <tr><td style="padding:8px 0;color:#888;">Lead ID</td>   <td style="padding:8px 0;font-family:monospace;font-size:12px;">${lead.id}</td></tr>
            </table>
          </div>
          <div style="padding:14px 24px;background:#f9f9f9;font-size:12px;color:#aaa;">
            Sukhdev Earth Movers — Govt. Approved Contractor, Anjar Kutch Gujarat
          </div>
        </div>
      `
    });
    console.log('[EMAIL ADMIN] Notification sent.');
  } catch (err) {
    console.error('[EMAIL ERROR]', err.message);
    errors.push('email_failed');
  }

  // ── 5. Respond ──
  return res.status(200).json({
    success : true,
    leadId  : lead.id,
    warnings: errors.length ? errors : undefined
  });
});

/* ─── GET /leads  (protected — basic token auth) ─────────────────── */
app.get('/leads', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(readLeads());
});

/* ─── HEALTH CHECK ──────────────────────────────────────────────── */
app.get('/health', (_, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

/* ─── START ─────────────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🚧  Sukhdev Earth Movers — Backend running on port ${PORT}\n`);
});
