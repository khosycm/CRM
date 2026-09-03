import { google } from 'googleapis';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const formData = req.body || {};

    // 1. Validation
    if (!formData.namaSiswa || !formData.namaSiswa.trim()) {
      return res.status(400).json({ status: 'error', message: 'Nama lengkap siswa wajib diisi.' });
    }

    if (!formData.namaOrangTua || !formData.namaOrangTua.trim()) {
      return res.status(400).json({ status: 'error', message: 'Nama orang tua wajib diisi.' });
    }

    if (!['Laki-laki', 'Perempuan'].includes(formData.jenisKelamin)) {
      return res.status(400).json({ status: 'error', message: 'Jenis kelamin anak wajib dipilih.' });
    }

    if (!formData.noWa || !formData.noWa.trim()) {
      return res.status(400).json({ status: 'error', message: 'Nomor WhatsApp wajib diisi.' });
    }

    if (!formData.unitTujuan || !formData.unitTujuan.trim()) {
      return res.status(400).json({ status: 'error', message: 'Unit tujuan wajib dipilih.' });
    }

    // Phone number formatting to 628...
    let cleaned = String(formData.noWa).replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.startsWith('08')) {
      cleaned = '628' + cleaned.substring(2);
    } else if (cleaned.startsWith('8')) {
      cleaned = '628' + cleaned.substring(1);
    }

    const waRegex = /^628[1-9][0-9]{7,11}$/;
    if (!waRegex.test(cleaned)) {
      return res.status(400).json({ status: 'error', message: 'Nomor WhatsApp tidak valid.' });
    }

    // Google Authentication via Vercel Environment Variables
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    if (!spreadsheetId || !clientEmail || !privateKey) {
      return res.status(500).json({
        status: 'error',
        message: 'Google Spreadsheet credentials not configured in Vercel environment variables.'
      });
    }

    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    const sheets = google.sheets({ version: 'v4', auth });

    // Generate Lead ID & Timestamps (WIB GMT+7)
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const wibTime = new Date(utcTime + (7 * 3600000));
    
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${wibTime.getFullYear()}${pad(wibTime.getMonth() + 1)}${pad(wibTime.getDate())}`;
    const timeFormatted = `${pad(wibTime.getDate())}/${pad(wibTime.getMonth() + 1)}/${wibTime.getFullYear()} ${pad(wibTime.getHours())}:${pad(wibTime.getMinutes())}:${pad(wibTime.getSeconds())}`;

    // Get all existing Lead IDs from Column A to find maxSeqToday and prevent collisions
    const existingIds = new Set();
    let maxSeqToday = 0;
    const todayPrefix = `LD-${dateStr}-`;

    try {
      const getRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Leads!A2:A10000',
      });
      const rows = getRows.data.values || [];
      rows.forEach(r => {
        const id = String(r[0] || '').trim();
        if (id) {
          existingIds.add(id);
          if (id.startsWith(todayPrefix)) {
            const parts = id.split('-');
            const seqNum = parseInt(parts[parts.length - 1], 10);
            if (!isNaN(seqNum) && seqNum > maxSeqToday) {
              maxSeqToday = seqNum;
            }
          }
        }
      });
    } catch (e) {
      console.warn('Warning reading existing Lead IDs:', e);
    }

    // Candidate sequence start at maxSeqToday + 1
    let candidateSeq = maxSeqToday + 1;
    let idLead = `${todayPrefix}${String(candidateSeq).padStart(3, '0')}`;

    // Anti-Collision Loop: Ensure final idLead is 100% unique in existingIds Set
    while (existingIds.has(idLead)) {
      candidateSeq++;
      idLead = `${todayPrefix}${String(candidateSeq).padStart(3, '0')}`;
    }

    // Process Sumber Informasi
    let sumberStr = '';
    if (Array.isArray(formData.sumberInfo)) {
      sumberStr = formData.sumberInfo.join(', ');
    } else if (formData.sumberInfo) {
      sumberStr = String(formData.sumberInfo);
    }

    const sumberLainnya = formData.sumberLainnya ? formData.sumberLainnya.trim() : '';
    const kebutuhanKhusus = formData.kebutuhanKhusus === 'Ya' ? 'Ya' : 'Tidak';
    const detailKebutuhanKhusus = formData.detailKebutuhanKhusus ? formData.detailKebutuhanKhusus.trim() : '';

    // Keep existing columns A:W and store the new fields in X:Y.
    const rowRecord = [
      idLead,                                                      // 1. ID Lead (Col A)
      timeFormatted,                                               // 2. Timestamp (Col B)
      formData.namaSiswa.trim(),                                   // 3. Nama Lengkap Siswa (Col C)
      cleaned,                                                     // 4. No. Whatsapp Orang Tua (Col D, 628...)
      formData.unitTujuan.trim(),                                  // 5. Unit Tujuan (Col E)
      formData.kelasSaatIni ? formData.kelasSaatIni.trim() : '',   // 6. Kelas Saat Ini (Col F)
      formData.tanggalLahir ? formData.tanggalLahir.trim() : '',   // 7. Tanggal Lahir (Col G)
      formData.umur ? formData.umur.trim() : '',                   // 8. Umur (Col H)
      formData.asalSekolah ? formData.asalSekolah.trim() : '',     // 9. Asal Sekolah (Col I)
      sumberStr,                                                   // 10. Sumber Informasi (Col J)
      sumberLainnya,                                               // 11. Sumber Informasi (Lainnya) (Col K)
      kebutuhanKhusus,                                             // 12. Kebutuhan Khusus (Col L)
      detailKebutuhanKhusus,                                       // 13. Detail Kebutuhan Khusus (Col M)
      'Leads Cold',                                                // 14. Status Lead (Col N)
      '',                                                          // 15. Catatan Admin (Col O)
      'Siswa Baru',                                                // 16. Kategori Pendaftaran (Col P)
      '',                                                          // 17. Level Target (Col Q)
      '',                                                          // 18. Discount (Col R)
      timeFormatted,                                                // 19. Terakhir Diperbarui (Col S)
      '',                                                          // 20. Existing column T
      '',                                                          // 21. Existing column U
      '',                                                          // 22. Existing column V
      '',                                                          // 23. Existing column W
      formData.namaOrangTua ? formData.namaOrangTua.trim() : '',    // 24. Nama Orang Tua (Col X)
      formData.jenisKelamin ? formData.jenisKelamin.trim() : ''    // 25. Jenis Kelamin (Col Y)
    ];

    // Append to 'Leads' sheet
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Leads!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowRecord]
      }
    });

    return res.status(200).json({
      status: 'success',
      message: 'Data buku tamu berhasil dikirim!',
      idLead: idLead,
      namaSiswa: formData.namaSiswa,
      formattedWa: cleaned
    });
  } catch (err) {
    console.error('Error in submit API:', err);
    return res.status(500).json({
      status: 'error',
      message: 'Terjadi kesalahan sistem: ' + (err.message || err.toString())
    });
  }
}
