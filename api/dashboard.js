import { google } from 'googleapis';
import crypto from 'crypto';

function verifyAuthToken(req) {
  const authHeader = req.headers['authorization'] || '';
  const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, '').trim();
  const legacyPin = req.headers['x-admin-pin'] || (req.query && req.query.pin);
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-admin-pin'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    // 1. Security Verification (Session Token / PIN)
    if (!verifyAuthToken(req)) {
      return res.status(401).json({ status: 'error', message: 'Sesi Admin tidak valid atau telah kadaluwarsa. Akses ditolak.' });
    }

    // 2. Google Sheets Authentication
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    // Default fallback masterdata options if environment variables are not set yet
    const fallbackUnits = ["Quranic Daycare Cendekia Muda", "TK Islam Cendekia Muda", "SD Islam Cendekia Muda Bandung", "SD Islam Cendekia Muda Makassar", "SD Islam Cendekia Muda Bilingual", "SMP Islam Cendekia Muda", "SMA Islam Cendekia Muda"];
    const fallbackStatus = ["Leads Cold", "Warm Leads", "Hot Leads", "Closing / Siswa Baru", "Batal / Inactive"];
    const fallbackSumber = ["Word of Mouth", "Instagram", "Ads", "Baliho", "Website", "AI", "TikTok", "YouTube", "Lainnya"];
    const fallbackDiscount = ["Tanpa Diskon", "Diskon Early Bird (10%)", "Diskon Siblings (15%)", "Diskon Alumni (20%)", "Diskon Beasiswa (50%)", "Diskon Khusus (Custom)"];

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return res.status(200).json({
        status: 'demo',
        message: 'Google Spreadsheet credentials not configured. Displaying demo CRM dashboard.',
        leads: [
          {
            idLead: "LD-20260804-001",
            timestamp: "04/08/2026 08:30:00",
            namaSiswa: "Muhammad Rayyan Al-Fatih",
            noWa: "6281234567890",
            unitTujuan: "TK",
            kelasSaatIni: "",
            tanggalLahir: "15/04/2022",
            umur: "4 Thn 3 Bln",
            asalSekolah: "",
            sumberInfo: "Instagram",
            sumberLainnya: "",
            statusLead: "Warm Leads",
            catatanAdmin: "Orang tua berminat ikutserta School Tour Sabtu ini.",
            kategoriPendaftaran: "Siswa Baru",
            levelTarget: "TK B",
            discount: "Diskon Early Bird (10%)",
            terakhirDiperbarui: "04/08/2026 08:45:00"
          },
          {
            idLead: "LD-20260804-002",
            timestamp: "04/08/2026 09:10:00",
            namaSiswa: "Aisha Nur Ramadhani",
            noWa: "6285912345678",
            unitTujuan: "SD Bandung",
            kelasSaatIni: "TK B",
            tanggalLahir: "",
            umur: "",
            asalSekolah: "TK Pembina Bandung",
            sumberInfo: "Word of Mouth, Website",
            sumberLainnya: "",
            statusLead: "Hot Leads",
            catatanAdmin: "Berkas formulir sudah lengkap, menunggu tes observasi.",
            kategoriPendaftaran: "Siswa Baru",
            levelTarget: "Kelas 1 SD",
            discount: "Diskon Siblings (15%)",
            terakhirDiperbarui: "04/08/2026 09:15:00"
          }
        ],
        masterData: {
          units: fallbackUnits,
          statusList: fallbackStatus,
          sumberList: fallbackSumber,
          discountList: fallbackDiscount
        }
      });
    }

    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch Leads data (19 Columns: A to S)
    const leadsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Leads!A2:S10000',
    });

    const leadRows = leadsResponse.data.values || [];
    const leads = leadRows.map(row => ({
      idLead: row[0] || '',
      timestamp: row[1] || '',
      namaSiswa: row[2] || '',
      noWa: row[3] || '',
      unitTujuan: row[4] || '',
      kelasSaatIni: row[5] || '',
      tanggalLahir: row[6] || '',
      umur: row[7] || '',
      asalSekolah: row[8] || '',
      sumberInfo: row[9] || '',
      sumberLainnya: row[10] || '',
      kebutuhanKhusus: row[11] || 'Tidak',
      detailKebutuhanKhusus: row[12] || '',
      statusLead: row[13] || 'Leads Cold',
      catatanAdmin: row[14] || '',
      kategoriPendaftaran: row[15] || 'Siswa Baru',
      levelTarget: row[16] || '',
      discount: row[17] || '',
      terakhirDiperbarui: row[18] || row[1] || ''
    }));

    // Fetch MasterData (Columns A: Unit, B: Status, C: Sumber, D: Diskon)
    let masterData = {
      units: fallbackUnits,
      statusList: fallbackStatus,
      sumberList: fallbackSumber,
      discountList: fallbackDiscount
    };

    try {
      const masterResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'MasterData!A2:D100',
      });

      const masterRows = masterResponse.data.values || [];
      if (masterRows.length > 0) {
        const uList = [];
        const stList = [];
        const smList = [];
        const dcList = [];

        masterRows.forEach(r => {
          const u = String(r[0] || '').trim();
          const st = String(r[1] || '').trim();
          const sm = String(r[2] || '').trim();
          const dc = String(r[3] || '').trim();

          if (u && !uList.includes(u)) uList.push(u);
          if (st && !stList.includes(st)) stList.push(st);
          if (sm && !smList.includes(sm)) smList.push(sm);
          if (dc && !dcList.includes(dc)) dcList.push(dc);
        });

        if (uList.length > 0) masterData.units = uList;
        if (stList.length > 0) masterData.statusList = stList;
        if (smList.length > 0) masterData.sumberList = smList;
        if (dcList.length > 0) masterData.discountList = dcList;
      }
    } catch (e) {
      console.warn('MasterData sheet read warning:', e);
    }

    return res.status(200).json({
      status: 'success',
      leads: leads,
      masterData: masterData
    });

  } catch (err) {
    console.error('Error in dashboard API:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan pada server dashboard: ' + (err.message || err.toString())
    });
  }
}
