import { google } from 'googleapis';
import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const { credential } = req.body || {};

    if (!credential) {
      return res.status(400).json({ status: 'error', message: 'Credential token Google tidak ditemukan.' });
    }

    // 1. Verify Google ID Token
    let payload = null;
    try {
      const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      if (!googleRes.ok) {
        throw new Error('Verifikasi token Google gagal.');
      }
      payload = await googleRes.json();
    } catch (e) {
      return res.status(401).json({ status: 'error', message: 'Token Google tidak valid atau telah kadaluwarsa.' });
    }

    if (!payload || !payload.email) {
      return res.status(401).json({ status: 'error', message: 'Gagal membaca profil email dari token Google.' });
    }

    const userEmail = payload.email.toLowerCase().trim();
    const userName = payload.name || payload.email.split('@')[0];
    const userPicture = payload.picture || '';

    // 2. Strict Whitelist Authorization Check (ALLOWED_ADMIN_EMAILS)
    const allowedEmailsRaw = process.env.ALLOWED_ADMIN_EMAILS || '';
    const allowedEmails = allowedEmailsRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

    if (allowedEmails.length > 0) {
      const isAllowed = allowedEmails.includes(userEmail);
      if (!isAllowed) {
        return res.status(403).json({
          status: 'error',
          message: `Akses Ditolak: Email (${userEmail}) tidak memiliki hak akses Admin CRM.`
        });
      }
    }

    // 3. Generate Signed Session Token (Valid for 24 Hours)
    const secret = process.env.SESSION_SECRET || process.env.ADMIN_PIN || 'cendekiamuda_crm_secret_key_2026';
    const expiresAt = Date.now() + (24 * 3600 * 1000);
    const payloadData = { email: userEmail, name: userName, picture: userPicture, expiresAt };
    const payloadStr = JSON.stringify(payloadData);
    const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
    const sessionToken = Buffer.from(JSON.stringify({ payloadStr, signature })).toString('base64');

    return res.status(200).json({
      status: 'success',
      message: 'Autentikasi Google berhasil!',
      token: sessionToken,
      user: {
        email: userEmail,
        name: userName,
        picture: userPicture
      }
    });

  } catch (err) {
    console.error('Error in auth-google API:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan autentikasi: ' + (err.message || err.toString())
    });
  }
}
