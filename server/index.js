const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

const app = express();

// Allow all origins (adjust if needed for security)
app.use(cors({ origin: '*' }));
app.use(express.json());

// ── Serve static frontend files from the project root ──────────────────────
// On Render, the server runs from /server, so we go one level up to project root
const STATIC_DIR = path.join(__dirname, '..');
app.use(express.static(STATIC_DIR));

// ── Config endpoint: safely exposes public runtime config to frontend ───────
// Only expose keys that are SAFE to be client-visible
app.get('/api/config', (req, res) => {
  res.json({
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  });
});

// ── OTP Mail endpoint ───────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

app.post('/api/send-otp', async (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ status: 'error', message: 'email and otp are required.' });
  }
  try {
    await transporter.sendMail({
      from: `"Exatopia" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: 'Exatopia — Your Verification Code',
      text: `Your Exatopia verification code is: ${otp}`,
      html: `<p>Your Exatopia verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${otp}</p>`,
    });
    res.json({ status: 'success', message: 'OTP sent to ' + email });
  } catch (err) {
    console.error('[send-otp] mail failed:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// ── SPA fallback: serve index.html for any unmatched routes ────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Exatopia server listening on port', PORT));
