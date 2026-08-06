import { google } from 'googleapis';
import crypto from 'crypto';

function verifyAuthToken(req) {
  const authHeader = req.headers['authorization'] || '';
  const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, '').trim();
  const legacyPin = req.headers['x-admin-pin'] || (req.body && req.body.pin);
  const token = tokenFromHeader || legacyPin || '';

  const secret = process.env.SESSION_SECRET || process.env.ADMIN_PIN || 'cendekiamuda_crm_secret_key_2026';
  const requiredPin = process.env.ADMIN_PIN || '123456';

  if (token === requiredPin) return true;

  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
    const expectedSig = crypto.createHmac('sha256', secret).update(decoded.payloadStr).digest('hex');
    if (expectedSig !== decoded.signature) return false;
    const payload = JSON.parse(decoded.payloadStr);
    if (Date.now() > payload.expiresAt) return false;
    return true;
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,PATCH,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-admin-pin'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    // 1. Security Verification (Session Token / PIN)
    if (!verifyAuthToken(req)) {
      return res.status(401).json({ status: 'error', message: 'Sesi Admin tidak valid atau telah kadaluwarsa. Gagal memperbarui data.' });
    }

    const { idLead, statusLead, catatanAdmin, kategoriPendaftaran, levelTarget, discount } = req.body || {};

    if (!idLead) {
      return res.status(400).json({ status: 'error', message: 'ID Lead wajib disertakan.' });
    }

    // 2. Google Sheets Authentication
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return res.status(200).json({
        status: 'success',
        message: 'Demo Mode: Status & discount lead berhasil diperbarui secara lokal!'
      });
    }

    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    // Find row index by ID Lead
    const getRows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Leads!A:A',
    });

    const leadIds = getRows.data.values || [];
    let targetRowIndex = -1;

    for (let i = 0; i < leadIds.length; i++) {
      if (leadIds[i][0] === idLead) {
        targetRowIndex = i + 1; // 1-indexed row number
        break;
      }
    }

    if (targetRowIndex === -1) {
      return res.status(404).json({ status: 'error', message: `Record dengan ID Lead '${idLead}' tidak ditemukan.` });
    }

    // Generate WIB GMT+7 Timestamp for Terakhir Diperbarui (Col Q)
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const wibTime = new Date(utcTime + (7 * 3600000));
    
    const pad = (n) => String(n).padStart(2, '0');
    const timeFormatted = `${pad(wibTime.getDate())}/${pad(wibTime.getMonth() + 1)}/${wibTime.getFullYear()} ${pad(wibTime.getHours())}:${pad(wibTime.getMinutes())}:${pad(wibTime.getSeconds())}`;

    // Update Columns N to S (14th to 19th column: N=Status, O=Catatan, P=Kategori, Q=Level, R=Discount, S=Terakhir Diperbarui)
    const updateRange = `Leads!N${targetRowIndex}:S${targetRowIndex}`;
    const updateValues = [
      [
        statusLead !== undefined ? statusLead : 'Leads Cold',
        catatanAdmin !== undefined ? catatanAdmin : '',
        kategoriPendaftaran !== undefined ? kategoriPendaftaran : 'Siswa Baru',
        levelTarget !== undefined ? levelTarget : '',
        discount !== undefined ? discount : '',
        timeFormatted
      ]
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: updateValues
      }
    });

    return res.status(200).json({
      status: 'success',
      message: `Data Lead '${idLead}' berhasil diperbarui!`,
      idLead: idLead,
      terakhirDiperbarui: timeFormatted
    });

  } catch (err) {
    console.error('Error updating lead record:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Gagal memperbarui data: ' + (err.message || err.toString())
    });
  }
}
