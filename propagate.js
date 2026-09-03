const fs = require('fs');
const cheerio = require('cheerio');

const forms = {
    'form-daycare.html': { primary: '#f06a35', secondary: '#444444', bg: '#f8fafc' },
    'form-sd.html': { primary: '#d62037', secondary: '#313556', bg: '#fefefe' },
    'form-smp.html': { primary: '#62b63c', secondary: '#313556', bg: '#ffffff' },
    'form-sma.html': { primary: '#0987c6', secondary: '#3f3b5c', bg: '#ffffff' }
};

const addressApiScript = `
  <script>
    // Location API Logic
    async function loadEMSIFA() {
      const provSelect = document.getElementById('provinsi_select');
      const kotaSelect = document.getElementById('kota_select');
      const kecSelect = document.getElementById('kecamatan_select');
      const kelSelect = document.getElementById('kelurahan_select');

      if(!provSelect) return;

      const fetchAPI = async (url) => {
        try { const res = await fetch(url); return await res.json(); }
        catch (e) { console.error('API Error:', e); return null; }
      };

      const populateSelect = (select, data, placeholder, valueKey, nameKey) => {
        select.innerHTML = '<option value="" disabled selected>-- Pilih ' + placeholder + ' --</option>';
        if (data) {
          data.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item[nameKey] + '|' + item[valueKey];
            opt.textContent = item[nameKey];
            select.appendChild(opt);
          });
        }
        select.disabled = !data;
      };

      // Initial Load
      const provData = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/provinces.json');
      populateSelect(provSelect, provData, 'Provinsi', 'id', 'name');

      provSelect.addEventListener('change', async (e) => {
        const id = e.target.value.split('|')[1];
        const data = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/regencies/'+id+'.json');
        populateSelect(kotaSelect, data, 'Kota/Kabupaten', 'id', 'name');
        kecSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kecamatan --</option>'; kecSelect.disabled = true;
        kelSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelurahan --</option>'; kelSelect.disabled = true;
      });

      kotaSelect.addEventListener('change', async (e) => {
        const id = e.target.value.split('|')[1];
        const data = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/districts/'+id+'.json');
        populateSelect(kecSelect, data, 'Kecamatan', 'id', 'name');
        kelSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelurahan --</option>'; kelSelect.disabled = true;
      });

      kecSelect.addEventListener('change', async (e) => {
        const id = e.target.value.split('|')[1];
        const data = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/villages/'+id+'.json');
        populateSelect(kelSelect, data, 'Kelurahan', 'id', 'name');
      });
    }
  </script>
`;

for (const [file, theme] of Object.entries(forms)) {
    if (!fs.existsSync(file)) {
        console.log(`Skipping ${file}, not found.`);
        continue;
    }

    let html = fs.readFileSync(file, 'utf-8');
    
    // Load with Cheerio (disable lowercasing of tags/attributes)
    const $ = cheerio.load(html, { decodeEntities: false });

    // 1. Theme Configuration
    let tailwindConfig = $('script').filter((i, el) => $(el).html().includes('tailwind.config'));
    const configStr = `
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            brand: {
              primary: '${theme.primary}',
              secondary: '${theme.secondary}',
              bg: '${theme.bg}'
            }
          }
        }
      }
    }
    `;
    
    if (tailwindConfig.length === 0) {
        $('head').append(`<script>${configStr}</script>`);
    } else {
        tailwindConfig.html(configStr);
    }

    // Set background color globally
    $('body').removeClass(function (index, className) {
        return (className.match(/(^|\s)bg-\S+/g) || []).join(' ');
    }).addClass('bg-brand-bg');

    // Replace header gradient and borders
    $('.bg-gradient-to-r').each((i, el) => {
        if ($(el).parent().hasClass('glass-card') || $(el).hasClass('bg-gradient-to-r')) {
            $(el).removeClass(function (index, className) {
                return (className.match(/(^|\s)(from-|to-)\S+/g) || []).join(' ');
            }).addClass('bg-gradient-to-r from-brand-secondary to-brand-primary');
        }
    });

    // Replace input borders/rings
    $('input, select, textarea').each((i, el) => {
        $(el).removeClass(function (index, className) {
            return (className.match(/(^|\s)(focus:border-|focus:ring-)\S+/g) || []).join(' ');
        }).addClass('focus:border-brand-primary focus:ring-brand-primary');
        
        // Add required if not hidden
        if ($(el).attr('type') !== 'hidden') {
            $(el).attr('required', 'required');
        }
    });
    
    // 2. Add * to labels
    $('label').each((i, el) => {
        if (!$(el).find('.text-red-500').length) {
            $(el).append(' <span class="text-red-500">*</span>');
        }
    });

    // 3. Convert dropdowns and Data types
    const createDropdown = (inputEl, options, idPrefix) => {
        const name = $(inputEl).attr('name');
        const req = $(inputEl).attr('required') ? 'required' : '';
        const cls = $(inputEl).attr('class');
        
        let selectHtml = `<select name="${name}" id="${idPrefix}_select" class="${cls}" ${req}>`;
        selectHtml += `<option value="" disabled selected>-- Pilih --</option>`;
        options.forEach(opt => {
            selectHtml += `<option value="${opt}">${opt}</option>`;
        });
        selectHtml += `</select>`;
        
        if (options.includes('Lainnya')) {
            selectHtml += `
            <div id="${idPrefix}_other_container" class="hidden mt-2">
              <input type="text" id="${idPrefix}_other" class="${cls}" placeholder="Sebutkan Lainnya">
            </div>`;
        }
        $(inputEl).replaceWith(selectHtml);
    };

    $('input[type="text"]').each((i, el) => {
        const name = $(el).attr('name') || '';
        const nameLower = name.toLowerCase();

        // NIK Validation
        if (nameLower.includes('nik') || nameLower.includes('kartu keluarga') || nameLower.includes('nisn')) {
            $(el).attr('pattern', '[0-9]{16}');
            $(el).attr('minlength', '16');
            $(el).attr('maxlength', '16');
            $(el).attr('title', 'Harus terdiri dari 16 digit angka');
        }

        // Phone Validation (Convert type to tel first)
        if (nameLower.includes('telepon') || nameLower.includes('handphone') || nameLower.includes('whatsapp')) {
            $(el).attr('type', 'tel');
        }

        // Parent Dropdowns
        if (nameLower.includes('pekerjaan') || nameLower.includes('profesi')) {
            createDropdown(el, ['Pegawai Negeri Sipil (PNS)', 'TNI/POLRI', 'Karyawan Swasta', 'Wiraswasta', 'Lainnya'], 'pekerjaan_' + i);
        } else if (nameLower.includes('penghasilan')) {
            createDropdown(el, ['< Rp 3.000.000', 'Rp 3.000.000 - Rp 5.000.000', 'Rp 5.000.000 - Rp 10.000.000', '> Rp 10.000.000'], 'penghasilan_' + i);
        } else if (nameLower.includes('pendidikan')) {
            createDropdown(el, ['SMA/SMK', 'Diploma (D1-D4)', 'Sarjana (S1)', 'Magister (S2)', 'Doktor (S3)'], 'pendidikan_' + i);
        } else if (nameLower === 'jenis tinggal') {
            createDropdown(el, ['Bersama Orang Tua', 'Bersama Wali', 'Kos', 'Asrama', 'Panti Asuhan', 'Lainnya'], 'tinggal_' + i);
        } else if (nameLower === 'alat transportasi ke sekolah') {
            createDropdown(el, ['Jalan Kaki', 'Kendaraan Pribadi', 'Kendaraan Umum/Angkot', 'Jemputan Sekolah', 'Kereta Api', 'Ojek', 'Becak', 'Perahu/Rakit', 'Lainnya'], 'transport_' + i);
        } else if (nameLower.includes('berkebutuhan khusus')) {
            createDropdown(el, ['Tidak Ada', 'Tunanetra', 'Tunarungu', 'Tunagrahita Ringan', 'Tunagrahita Sedang', 'Tunadaksa Ringan', 'Tunadaksa Sedang', 'Tunalaras', 'Tunawicara', 'Tuna Ganda', 'Hiper Aktif', 'Cerdas Istimewa', 'Bakat Istimewa', 'Kesulitan Belajar', 'Narkoba', 'Indigo', 'Down Syndrome', 'Autis', 'Lainnya'], 'kebutuhan_' + i);
        }
    });

    // Update Tel fields
    $('input[type="tel"]').each((i, el) => {
        $(el).attr('pattern', '[0-9]{10,14}');
        $(el).attr('title', 'Harus terdiri dari 10-14 digit angka');
    });

    // Add Suffixes to Unit Fields
    const numberFields = ['Berat Badan', 'Tinggi Badan', 'Lingkar Kepala', 'Jarak', 'Waktu Tempuh'];
    $('input').each((i, el) => {
        const name = $(el).attr('name') || '';
        for (const num of numberFields) {
            if (name.includes(num)) {
                $(el).attr('type', 'number');
                $(el).attr('step', 'any');
            }
        }
    });

    // 4. Inject Location API if address fields exist
    let hasAddress = false;
    $('textarea').each((i, el) => {
        const name = $(el).attr('name') || '';
        if (name.toLowerCase().includes('alamat') && !name.toLowerCase().includes('kerja')) {
            hasAddress = true;
            // Inject Address block before this textarea
            const addressBlock = `
              <div class="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label class="block text-sm font-medium text-slate-700">Provinsi <span class="text-red-500">*</span></label>
                  <select id="provinsi_select" name="Provinsi" class="${$(el).attr('class')}" required>
                    <option value="" disabled selected>Loading...</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700">Kota/Kabupaten <span class="text-red-500">*</span></label>
                  <select id="kota_select" name="Kota/Kabupaten" class="${$(el).attr('class')}" required disabled>
                    <option value="" disabled selected>-- Pilih Provinsi Terlebih Dahulu --</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700">Kecamatan <span class="text-red-500">*</span></label>
                  <select id="kecamatan_select" name="Kecamatan" class="${$(el).attr('class')}" required disabled>
                    <option value="" disabled selected>-- Pilih Kota Terlebih Dahulu --</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-700">Kelurahan/Desa <span class="text-red-500">*</span></label>
                  <select id="kelurahan_select" name="Kelurahan/Desa" class="${$(el).attr('class')}" required disabled>
                    <option value="" disabled selected>-- Pilih Kecamatan Terlebih Dahulu --</option>
                  </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-slate-700">Kode Pos <span class="text-red-500">*</span></label>
                    <input type="text" name="Kode Pos" class="${$(el).attr('class')}" required placeholder="Misal: 40123" pattern="[0-9]{5}" title="Kode Pos harus 5 digit angka">
                </div>
              </div>
            `;
            if (!$(el).parent().prev().find('#provinsi_select').length && !$(el).parent().find('#provinsi_select').length) {
                $(el).parent().before(addressBlock);
            }
        }
    });

    if (hasAddress && !html.includes('loadEMSIFA()')) {
        $('body').append(addressApiScript);
    }

    // 5. Submit Handler (File Size, Auto Scroll, Auto Save)
    $('script').each((i, el) => {
        const text = $(el).html();
        if (text.includes('registrationForm') && text.includes('submitBtn')) {
            $(el).remove();
        }
    });

    const newSubmitScript = `
    <script>
      document.addEventListener("DOMContentLoaded", () => {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('leadId')) {
            const leadIdEl = document.getElementById('leadId');
            if(leadIdEl) leadIdEl.value = urlParams.get('leadId');
        }
        if (urlParams.has('unit')) {
            const unitEl = document.getElementById('unitTujuan');
            if (unitEl) unitEl.value = urlParams.get('unit');
        }

        // Location API init
        if(typeof loadEMSIFA === 'function') loadEMSIFA();

        // Lainnya Logic
        const setupLainnya = (selectId, containerId, inputId, name) => {
            const select = document.getElementById(selectId);
            const container = document.getElementById(containerId);
            const input = document.getElementById(inputId);
            if(select && container && input) {
                select.addEventListener('change', (e) => {
                    if (e.target.value === 'Lainnya') {
                        container.classList.remove('hidden');
                        input.setAttribute('name', name);
                        input.setAttribute('required', 'required');
                        select.removeAttribute('name');
                    } else {
                        container.classList.add('hidden');
                        input.removeAttribute('name');
                        input.removeAttribute('required');
                        select.setAttribute('name', name);
                    }
                });
            }
        };

        document.querySelectorAll('select').forEach(select => {
            if(select.id && select.id.endsWith('_select')) {
                const baseId = select.id.replace('_select', '');
                setupLainnya(select.id, baseId + '_other_container', baseId + '_other', select.name);
            }
        });

        // Auto Save Draft
        const form = document.getElementById('registrationForm');
        if(!form) return;
        const draftKey = '${file}_draft';
        const loadDraft = () => {
            const draft = localStorage.getItem(draftKey);
            if (draft) {
                const data = JSON.parse(draft);
                for (const key in data) {
                    const input = form.querySelector('[name="' + key + '"]');
                    if (input && input.type !== 'file' && input.tagName !== 'SELECT') {
                        input.value = data[key];
                    }
                }
            }
        };
        loadDraft();
        form.addEventListener('input', (e) => {
            if (e.target.type !== 'file') {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                localStorage.setItem(draftKey, JSON.stringify(data));
            }
        });

        // Submit Handler
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const submitBtn = document.getElementById('submitBtn');
          const alertBox = document.getElementById('alertBox');
          if(!submitBtn || !alertBox) return;
          
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengirim...';
          alertBox.classList.add('hidden');

          // Check File Sizes (5MB Limit)
          const fileInputs = form.querySelectorAll('input[type="file"]');
          for (const input of fileInputs) {
            if (input.files && input.files[0] && input.files[0].size > 5 * 1024 * 1024) {
                alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i>Ukuran file ' + input.files[0].name + ' terlalu besar. Maksimal 5MB.';
                alertBox.className = 'mt-6 rounded-xl p-4 text-sm font-bold bg-rose-50 text-rose-800 border border-rose-200';
                alertBox.classList.remove('hidden');
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim Pendaftaran';
                alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
          }
          
          try {
            const formData = new FormData(form);
            const response = await fetch('/api/register', { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok) {
              alertBox.innerHTML = '<i class="fa-solid fa-circle-check mr-2"></i>' + (result.message || 'Pendaftaran berhasil dikirim!');
              alertBox.className = 'mt-6 rounded-xl p-4 text-sm font-bold bg-emerald-50 text-emerald-800 border border-emerald-200';
              form.reset();
              localStorage.removeItem(draftKey);
            } else {
              alertBox.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-2"></i>' + (result.message || 'Terjadi kesalahan.');
              alertBox.className = 'mt-6 rounded-xl p-4 text-sm font-bold bg-rose-50 text-rose-800 border border-rose-200';
            }
          } catch (error) {
            alertBox.innerHTML = '<i class="fa-solid fa-wifi mr-2"></i> Terjadi kesalahan jaringan.';
            alertBox.className = 'mt-6 rounded-xl p-4 text-sm font-bold bg-rose-50 text-rose-800 border border-rose-200';
          } finally {
            alertBox.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Kirim Pendaftaran';
            alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      });
    </script>
    `;
    $('body').append(newSubmitScript);

    // Save
    fs.writeFileSync(file, $.html(), 'utf-8');
    console.log(`Successfully processed ${file}`);
}
