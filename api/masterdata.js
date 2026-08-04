import { google } from 'googleapis';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const defaultUnits = ["Daycare", "TK", "SD Bandung", "SD Makassar", "SD Bilingual", "SMP", "SMA"];
  const defaultSumber = ["Word of Mouth", "Instagram", "Ads", "Baliho", "Website", "AI", "TikTok", "YouTube", "Lainnya"];

  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return res.status(200).json({
        status: 'fallback',
        units: defaultUnits,
        sumberInfo: defaultSumber
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
      range: 'MasterData!A2:C100',
    });

    const rows = response.data.values || [];
    const units = [];
    const sumbers = [];

    rows.forEach(row => {
      const u = String(row[0] || '').trim();
      const s = String(row[2] || '').trim();
      if (u && !units.includes(u)) units.push(u);
      if (s && !sumbers.includes(s)) sumbers.push(s);
    });

    return res.status(200).json({
      status: 'success',
      units: units.length > 0 ? units : defaultUnits,
      sumberInfo: sumbers.length > 0 ? sumbers : defaultSumber
    });
  } catch (err) {
    console.error('Error fetching masterdata:', err);
    return res.status(200).json({
      status: 'fallback',
      units: defaultUnits,
      sumberInfo: defaultSumber
    });
  }
}
