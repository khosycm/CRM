import { google } from 'googleapis';
import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const { email, password } = req.body || {};

    if (!email || !email.trim()) {
      return res.status(400).json({ status: 'error', message: 'Email wajib diisi.' });
    }

    if (!password || !password.trim()) {
      return res.status(400).json({ status: 'error', message: 'Password wajib diisi.' });
    }

    const inputEmail = email.toLowerCase().trim();
    const inputPassword = password.trim();

    // Google Authentication & Access Sheet Reading
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    let isValidUser = false;
    let matchedEmail = inputEmail;

    if (spreadsheetId && clientEmail && privateKey) {
      try {
        const auth = new google.auth.JWT(
          clientEmail,
          null,
          privateKey,
          ['https://www.googleapis.com/auth/spreadsheets.readonly']
        );
        const sheets = google.sheets({ version: 'v4', auth });

        // Read 'Access' sheet (Col A: Email, Col B: Password)
        const accessRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Access!A2:B100',
        });

        const rows = accessRes.data.values || [];
        for (const row of rows) {
          const sheetEmail = String(row[0] || '').toLowerCase().trim();
          const sheetPassword = String(row[1] || '').trim();

          if (sheetEmail === inputEmail && sheetPassword === inputPassword) {
            isValidUser = true;
            matchedEmail = sheetEmail;
            break;
          }
        }
      } catch (e) {
        console.warn('Warning reading Access sheet, checking fallback credentials:', e.message);
      }
    }

    // Fallback credentials if spreadsheet is not connected or Access sheet check didn't pass
    if (!isValidUser) {
      const fallbackEmail = (process.env.ADMIN_EMAIL || 'admin@cendekiamuda.sch.id').toLowerCase();
      const fallbackPass = process.env.ADMIN_PIN || 'admin123';
      if (inputEmail === fallbackEmail && inputPassword === fallbackPass) {
        isValidUser = true;
        matchedEmail = fallbackEmail;
      }
    }

    if (!isValidUser) {
      return res.status(401).json({
        status: 'error',
        message: 'Email atau password salah / tidak memiliki hak akses admin.'
      });
    }

    // Generate Signed Session Token (Valid 24 hours)
    const secret = process.env.SESSION_SECRET || process.env.ADMIN_PIN || 'cendekiamuda_crm_secret_key_2026';
    const expiresAt = Date.now() + (24 * 3600 * 1000);
    const payloadData = { email: matchedEmail, expiresAt };
    const payloadStr = JSON.stringify(payloadData);
    const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
    const sessionToken = Buffer.from(JSON.stringify({ payloadStr, signature })).toString('base64');

    return res.status(200).json({
      status: 'success',
      message: 'Login berhasil!',
      token: sessionToken,
      user: {
        email: matchedEmail,
        name: matchedEmail.split('@')[0]
      }
    });

  } catch (err) {
    console.error('Error in login API:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan sistem: ' + (err.message || err.toString())
    });
  }
}
