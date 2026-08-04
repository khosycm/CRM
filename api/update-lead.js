import { google } from 'googleapis';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,PATCH,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-admin-pin'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    // 1. PIN Security Verification
    const providedPin = req.headers['x-admin-pin'] || (req.body && req.body.pin);
    const requiredPin = process.env.ADMIN_PIN || '123456';

    if (providedPin !== requiredPin) {
      return res.status(401).json({ status: 'error', message: 'PIN Admin tidak valid. Gagal memperbarui data.' });
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

    // Update Columns L to Q (12th to 17th column: L=Status, M=Catatan, N=Kategori, O=Level, P=Discount, Q=Terakhir Diperbarui)
    const updateRange = `Leads!L${targetRowIndex}:Q${targetRowIndex}`;
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
