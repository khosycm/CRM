import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const defaultUnits = ["Quranic Daycare Cendekia Muda 1", "Quranic Daycare Cendekia Muda 2", "TK Islam Cendekia Muda", "SD Islam Cendekia Muda Bandung", "SD Islam Cendekia Muda Makassar", "SD Islam Cendekia Muda Bilingual", "SMP Islam Cendekia Muda", "SMA Islam Cendekia Muda"];
  const defaultStatus = ["Leads Cold", "Leads Warm", "Leads Hot", "Form", "Daftar", "Konfirmasi", "Cancel Setelah Daftar", "Cancel Setelah Konfirmasi", "Mutasi - Daftar", "Mutasi - Konfirmasi"];
  const defaultSumber = ["Rekomendasi", "Instagram", "Ads", "Baliho", "Website", "AI", "TikTok", "YouTube", "Lainnya"];
  const defaultDiscount = ["Tanpa Diskon", "Diskon Early Bird (10%)", "Diskon Siblings (15%)", "Diskon Alumni (20%)", "Diskon Beasiswa (50%)", "Diskon Khusus (Custom)"];

  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return res.status(200).json({
        status: 'fallback',
        units: defaultUnits,
        statusList: defaultStatus,
        sumberInfo: defaultSumber,
        discountList: defaultDiscount
      });
    }

    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'MasterData!A2:D100',
    });

    const rows = response.data.values || [];
    const units = [];
    const statusList = [];
    const sumbers = [];
    const discounts = [];

    rows.forEach(row => {
      const u = String(row[0] || '').trim();
      const st = String(row[1] || '').trim();
      const s = String(row[2] || '').trim();
      const d = String(row[3] || '').trim();

      if (u && !units.includes(u)) units.push(u);
      if (st && !statusList.includes(st)) statusList.push(st);
      if (s && !sumbers.includes(s)) sumbers.push(s);
      if (d && !discounts.includes(d)) discounts.push(d);
    });

    return res.status(200).json({
      status: 'success',
      units: units.length > 0 ? units : defaultUnits,
      statusList: statusList.length > 0 ? statusList : defaultStatus,
      sumberInfo: sumbers.length > 0 ? sumbers : defaultSumber,
      discountList: discounts.length > 0 ? discounts : defaultDiscount
    });
  } catch (err) {
    console.error('Error fetching masterdata:', err);
    return res.status(200).json({
      status: 'fallback',
      units: defaultUnits,
      statusList: defaultStatus,
      sumberInfo: defaultSumber,
      discountList: defaultDiscount
    });
  }
}
