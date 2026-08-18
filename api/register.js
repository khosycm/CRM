import { google } from 'googleapis';
import formidable from 'formidable';
import fs from 'fs';

// Configure Vercel to not parse the body automatically, allowing formidable to do it
export const config = {
  api: {
    bodyParser: false,
  },
};

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

  const form = formidable({ 
    multiples: true,
    maxFileSize: 5 * 1024 * 1024, // 5MB limit
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error('Error parsing form data:', err);
      // Check if it's a file size error
      if (err.code === 1009 || err.message.includes('maxFileSize')) {
        return res.status(413).json({ status: 'error', message: 'Ukuran file terlalu besar. Maksimal 5MB.' });
      }
      return res.status(500).json({ status: 'error', message: 'Form parsing failed' });
    }

    try {
      // Clean up fields from array to string (formidable v3 parses as arrays by default)
      const cleanFields = {};
      for (const key in fields) {
        cleanFields[key] = Array.isArray(fields[key]) ? fields[key][0] : fields[key];
      }
      
      const formType = cleanFields.formType; // 'Daycare', 'TK', 'SD', 'SMP', 'SMA'
      const leadId = cleanFields.leadId || '';
      const unitTujuan = (cleanFields.unitTujuan || '').toLowerCase();

      if (!formType) {
        return res.status(400).json({ status: 'error', message: 'Form Type missing' });
      }

      // Google Authentication
      const spreadsheetId = process.env.SPREADSHEET_ID;
      const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
      
      // Dynamic Folder Routing
      let folderId = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
      if (formType === 'Daycare') folderId = process.env.FOLDER_DAYCARE || folderId;
      else if (formType === 'TK') folderId = process.env.FOLDER_TK || folderId;
      else if (formType === 'SMP') folderId = process.env.FOLDER_SMP || folderId;
      else if (formType === 'SMA') folderId = process.env.FOLDER_SMA || folderId;
      else if (formType === 'SD') {
        if (unitTujuan.includes('makassar')) folderId = process.env.FOLDER_SD_MAKASSAR || folderId;
        else if (unitTujuan.includes('bilingual')) folderId = process.env.FOLDER_SD_BILINGUAL || folderId;
        else folderId = process.env.FOLDER_SD_BANDUNG || folderId;
      }

      if (!spreadsheetId || !clientEmail || !privateKey) {
        throw new Error('Google credentials not configured.');
      }

      const auth = new google.auth.JWT(
        clientEmail,
        null,
        privateKey,
        [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file'
        ]
      );

      const sheets = google.sheets({ version: 'v4', auth });
      const drive = google.drive({ version: 'v3', auth });

      // Helper to upload file to drive
      const uploadFile = async (fileKey, fileName) => {
        const fileObj = Array.isArray(files[fileKey]) ? files[fileKey][0] : files[fileKey];
        if (!fileObj) return '';
        
        const fileMetadata = {
          name: `${leadId ? leadId + '_' : ''}${fileName}_${fileObj.originalFilename}`,
          parents: folderId ? [folderId] : []
        };
        const media = {
          mimeType: fileObj.mimetype,
          body: fs.createReadStream(fileObj.filepath)
        };
        
        try {
          const driveRes = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
          });
          
          // Optionally set permissions so anyone with the link can view
          await drive.permissions.create({
            fileId: driveRes.data.id,
            requestBody: {
              role: 'reader',
              type: 'anyone',
            },
          });
          
          return driveRes.data.webViewLink;
        } catch (uploadErr) {
          console.error(`Upload error for ${fileKey}:`, uploadErr);
          return 'Upload Failed';
        }
      };

      // Handle Schemas
      let range = '';
      let rowRecord = [];

      if (formType === 'Daycare') {
        range = 'Form Daycare!A1';
        
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        
        const formatAddress = (suffix) => {
           const provRaw = cleanFields['Provinsi' + suffix];
           const kotaRaw = cleanFields['Kota/Kabupaten' + suffix];
           const kecRaw = cleanFields['Kecamatan' + suffix];
           const kelRaw = cleanFields['Kelurahan/Desa' + suffix];
           
           const prov = provRaw ? provRaw.split('|')[0] : '';
           const kota = kotaRaw ? kotaRaw.split('|')[0] : '';
           const kec = kecRaw ? kecRaw.split('|')[0] : '';
           const kel = kelRaw ? kelRaw.split('|')[0] : '';
           const kodePos = cleanFields['Kode Pos' + suffix] || '';
           const detail = cleanFields['Alamat Lengkap' + suffix] || '';
           
           let parts = [];
           if (detail) parts.push(detail);
           if (kel) parts.push(`Kel/Desa ${kel}`);
           if (kec) parts.push(`Kec. ${kec}`);
           if (kota) parts.push(kota);
           if (prov) parts.push(`Prov. ${prov}`);
           if (kodePos) parts.push(`Kode Pos ${kodePos}`);
           
           return parts.join(', ');
        };

        const alamatAnak = formatAddress('');
        const alamatAyah = formatAddress(' Ayah');
        const alamatIbu = formatAddress(' Ibu');

        rowRecord = [
          leadId,
          cleanFields['Program daycare'], cleanFields['Nama Lengkap'], cleanFields['Nama Panggilan'],
          cleanFields['Tempat Lahir'], cleanFields['Tanggal Lahir'], cleanFields['Jenis Kelamin'],
          cleanFields['Anak ke-'], cleanFields['Saudara Kandung'], cleanFields['Saudara Tiri'],
          cleanFields['Saudara Angkat'], cleanFields['Status Orang Tua'], cleanFields['Kewarganegaraan'],
          cleanFields['Golongan Darah'], cleanFields['Berat Badan'], cleanFields['Tinggi Badan'],
          alamatAnak, cleanFields['Jenis Tinggal'], cleanFields['Riwayat PenyakitAnak'],
          cleanFields['Riwayat Penyakit Keluarga'], cleanFields['Nama Lengkap Ayah'], cleanFields['Tempat Lahir Ayah'],
          cleanFields['Tanggal Lahir Ayah'], alamatAyah, cleanFields['Nomor Handphone Ayah'],
          cleanFields['Pekerjaan/Profesi Ayah'], cleanFields['Nama & Alamat Tepat Kerja Ayah'], cleanFields['Pendidikan Terakhir Ayah'],
          cleanFields['Riwayat Penyakit Ayah'], cleanFields['Golongan Darah Ayah'], cleanFields['Nama Lengkap Ibu'],
          cleanFields['Tempat Lahir Ibu'], cleanFields['Tanggal Lahir Ibu'], alamatIbu,
          cleanFields['Nomor Handphone Ibu'], cleanFields['Pekerjaan/Profesi Ibu'], cleanFields['Nama & Alamat Tepat Kerja Ibu'],
          cleanFields['Pendidikan Terakhir Ibu'], cleanFields['Riwayat Penyakit Ibu'], cleanFields['Golongan Darah Ibu'],
          timestamp
        ];
      } else if (formType === 'TK') {
        range = 'Form TK!A1';
        const kkLink = await uploadFile('Kartu Keluarga', 'KK');
        const aktaLink = await uploadFile('Akta Kelahiran', 'Akta');
        const ktpAyahLink = await uploadFile('KTP Ayah', 'KTP_Ayah');
        const ktpIbuLink = await uploadFile('KTP Ibu', 'KTP_Ibu');
        
        const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        
        rowRecord = [
          leadId,
          cleanFields['Nama Lengkap Anak'], cleanFields['Nama Panggilan'], cleanFields['Kelas'],
          cleanFields['Tempat Lahir'], cleanFields['Tanggal Lahir'], cleanFields['Jenis Kelamin'],
          cleanFields['Gologan Darah'], cleanFields['Hobi'], cleanFields['Cita Cita'],
          cleanFields['No. NIK'], cleanFields['No. Kartu Keluarga'], kkLink,
          cleanFields['No. Akta Kelahiran'], aktaLink, cleanFields['Anak ke Berapa Berdasarkan KK'],
          cleanFields['Jumlah Saudara Kandung'], cleanFields['Alamat Rumah'], cleanFields['RT'],
          cleanFields['RW'], cleanFields['Kelurahan'], cleanFields['Kecamatan'],
          cleanFields['Kab/Kota'], cleanFields['Provinsi'], cleanFields['Kode POS'], cleanFields['Jenis Tinggal'],
          cleanFields['Alat Transportasi ke Sekolah'], cleanFields['Jarak Tempat Tinggal ke Sekolah'], cleanFields['Waktu Tempuh'],
          cleanFields['Berat Badan'], cleanFields['Tinggi Badan'], cleanFields['Lingkar Kepala'],
          cleanFields['Berkebutuhan Khusus'], cleanFields['Nama Ayah/Wali'], cleanFields['Tanggal Lahir Ayah'],
          cleanFields['No. NIK Ayah'], cleanFields['Pekerjaan Ayah/Wali'], cleanFields['Penghasilan Ayah/Wali'],
          cleanFields['Pendidikan Terakhir Ayah/Wali'], cleanFields['No. Telepon Ayah'], ktpAyahLink,
          cleanFields['Nama Ibu/Wali'], cleanFields['Tanggal Lahir Ibu'], cleanFields['No. NIK Ibu'],
          cleanFields['Pekerjaan Ibu/Wali'], cleanFields['Penghasilan Ibu/Wali'], cleanFields['Pendidikan Terakhir Ibu/Wali'],
          cleanFields['No. Telepon Ibu'], ktpIbuLink,
          timestamp
        ];
      } else if (formType === 'SD') {
        range = 'Form SD!A1';
        rowRecord = [
          cleanFields['Nama Lengkap Siswa'], cleanFields['Jenis Kelamin'], cleanFields['Tempat Lahir'],
          cleanFields['Tanggal Lahir'], cleanFields['Anak ke'], cleanFields['Jumlah Saudara Kandung'],
          cleanFields['No. NIK Siswa'], cleanFields['No. Akta Kelahiran'], cleanFields['No. Kartu Keluarga'],
          cleanFields['Berkebutuhan Khusus'], cleanFields['Berat Badan'], cleanFields['Tinggi Badan'],
          cleanFields['Lingkar Kepala'], cleanFields['Alamat Rumah'], cleanFields['Garis Lintang dari Rumah ke Sekolah'],
          cleanFields['Garis Bujur dari Rumah ke Sekolah'], cleanFields['RT'], cleanFields['RW'],
          cleanFields['Kelurahan'], cleanFields['Kecamatan'], cleanFields['Kab/Kota'],
          cleanFields['Kode POS'], cleanFields['Jarak Rumah ke Sekolah'], cleanFields['No. Telepon Siswa'],
          cleanFields['Nama Lengkap Ayah'], cleanFields['Tanggal Lahir Ayah'], cleanFields['Jenjang Pendidikan Terakhir Ayah'],
          cleanFields['Pekerjaan Ayah'], cleanFields['Penghasilan Ayah'], cleanFields['No. NIK Ayah'],
          cleanFields['Nama Lengkap Ibu'], cleanFields['Tanggal Lahir Ibu'], cleanFields['Jenjang Pendidikan Terakhir Ibu'],
          cleanFields['Pekerjaan Ibu'], cleanFields['Penghasilan Ibu'], cleanFields['No. NIK Ibu']
        ];
      } else if (formType === 'SMP') {
        range = 'Form SMP!A1';
        const aktaLink = await uploadFile('Akta Kelahiran', 'Akta');
        const kkLink = await uploadFile('Kartu Keluarga', 'KK');
        rowRecord = [
          cleanFields['Nama Lengkap Siswa'], cleanFields['Nama Panggilan'], cleanFields['Tempat Lahir'],
          cleanFields['Tanggal Lahir'], cleanFields['Jenis Kelamin'], cleanFields['No. Telepon Siswa'],
          cleanFields['No. Akta Kelahiran'], cleanFields['No. Kartu Keluarga'], cleanFields['No. NIK Siswa'],
          aktaLink, kkLink, cleanFields['Nilai Rapor Kelas 5 Ganjil'],
          cleanFields['Nilai Rapor Kelas 5 Genap'], cleanFields['Nilai Rapor Kelas 6 Ganjil'], cleanFields['Anak Ke'],
          cleanFields['Jumlah Saudara Kandung'], cleanFields['Jumlah Saudara Tiri'], cleanFields['Jumlah Saudara Angkat'],
          cleanFields['Status Dalam Keluarga'], cleanFields['Bahasa Sehari-hari'], cleanFields['Kewarganegaraan'],
          cleanFields['Asal Negara WNA'], cleanFields['Tinggi Badan'], cleanFields['Berat Badan'],
          cleanFields['Golongan Darah'], cleanFields['Alamat Siswa'], cleanFields['Kelurahan'],
          cleanFields['Kecamatan'], cleanFields['Kab/Kota'], cleanFields['Kode POS'],
          cleanFields['Jenis Tinggal'], cleanFields['Alat Transportasi ke Sekolah'], cleanFields['Jarak Tempat Tinggal ke Sekolah'],
          cleanFields['Waktu Tempuh'], cleanFields['Minat dan Bakat Siswa'], cleanFields['Kelainan Jasmani'],
          cleanFields['Jenis Prestasi'], cleanFields['Tingkat Prestasi'], cleanFields['Nama Prestasi/Tahun/Penyelenggara'],
          cleanFields['Nama Sekolah Dasar Asal'], cleanFields['Alamat Sekolah Dasar Asal'], cleanFields['Tanggal Tamat Sekolah Dasar'],
          cleanFields['Status Ayah'], cleanFields['Nama Lengkap Ayah'], cleanFields['Tempat Lahir Ayah'],
          cleanFields['Tanggal Lahir Ayah'], cleanFields['Agama Ayah'], cleanFields['Alamat Rumah Ayah'],
          cleanFields['No. Telepon Ayah'], cleanFields['Pekerjaan Ayah'], cleanFields['Nama Instansi/Perusahaan/Lembaga/Wirausaha Ayah'],
          cleanFields['Jabatan Ayah'], cleanFields['Alamat Instansi Ayah'], cleanFields['Penghasilan Ayah'],
          cleanFields['Jenjang Pendidikan Ayah'], cleanFields['Kewarganegaraan Ayah'], cleanFields['Asal Negara WNA Ayah'],
          cleanFields['Status Ibu'], cleanFields['Nama Lengkap Ibu'], cleanFields['Tempat Lahir Ibu'],
          cleanFields['Tanggal Lahir Ibu'], cleanFields['Agama Ibu'], cleanFields['Alamat Rumah Ibu'],
          cleanFields['No. Telepon Ibu'], cleanFields['Pekerjaan Ibu'], cleanFields['Nama Instansi/Perusahaan/Lembaga/Wirausaha Ibu'],
          cleanFields['Jabatan Ibu'], cleanFields['Alamat Instansi Ibu'], cleanFields['Penghasilan Ibu'],
          cleanFields['Jenjang Pendidikan Ibu'], cleanFields['Kewarganegaraan Ibu'], cleanFields['Asal Negara WNA Ibu'],
          cleanFields['Berkebutuhan Khusus Siswa'], cleanFields['Jenis Kebutuhan Khusus'], cleanFields['Terapi yang Dijalani'],
          cleanFields['Nama Tempat Terapi'], cleanFields['Nama Terapis'], cleanFields['Nama Lengkap Pengisi Data']
        ];
      } else if (formType === 'SMA') {
        range = 'Form SMA!A1';
        const aktaLink = await uploadFile('Akta Lahir Siswa', 'Akta');
        const kkLink = await uploadFile('Kartu Keluarga', 'KK');
        const fotoLink = await uploadFile('Pas Foto', 'Foto');
        rowRecord = [
          cleanFields['Nama Lengkap'], cleanFields['Nama Panggilan'], cleanFields['Tempat Lahir'],
          cleanFields['Tanggal Lahir'], cleanFields['Jenis Kelamin'], cleanFields['Agama'],
          cleanFields['Bahasa Sehari-hari'], cleanFields['Kewarganegaraan'], cleanFields['Tinggi Badan'],
          cleanFields['Berat Badan'], cleanFields['Golongan Darah'], cleanFields['Asal SMP'],
          cleanFields['Alamat SMP'], cleanFields['Tanggal Tamat SMP'], cleanFields['Nama Lengkap Ayah'],
          cleanFields['Tempat Lahir Ayah'], cleanFields['Tanggal Lahir Ayah'], cleanFields['Pekerjaan/Profesi Ayah'],
          cleanFields['Nama & Alamat Tempat Kerja Ayah'], cleanFields['Penghasilan Ayah'], cleanFields['Pendidikan Terakhir Ayah'],
          cleanFields['Nama Lengkap Ibu'], cleanFields['Tempat Lahir Ibu'], cleanFields['Tanggal Lahir Ibu'],
          cleanFields['Pekerjaan/Profesi Ibu'], cleanFields['Nama & Alamat Tempat Kerja Ibu'], cleanFields['Penghasilan'],
          cleanFields['Pendidikan Terakhir Ibu'], aktaLink, kkLink, fotoLink, cleanFields['NISN']
        ];
      }

      if (!range) {
         return res.status(400).json({ status: 'error', message: 'Invalid Form Type' });
      }
      
      // Append Lead ID for tracking at the very end for forms other than Daycare and TK
      if (formType !== 'Daycare' && formType !== 'TK') {
          rowRecord.push(leadId);
      }

      // Convert undefined to empty string to avoid errors with googleapis
      const sanitizedRowRecord = rowRecord.map(val => val === undefined || val === null ? '' : val);

      // Append to sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: range,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [sanitizedRowRecord]
        }
      });

      return res.status(200).json({ status: 'success', message: 'Pendaftaran berhasil dikirim!' });

    } catch (err) {
      console.error('API Error:', err);
      return res.status(500).json({ status: 'error', message: err.message || 'Internal Server Error' });
    }
  });
}
