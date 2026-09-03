const fs = require('fs');
const cheerio = require('cheerio');

const forms = ['form-daycare.html', 'form-sd.html', 'form-smp.html', 'form-sma.html'];

for (const file of forms) {
    if (!fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf-8');
    const $ = cheerio.load(html, { decodeEntities: false });

    // Find all location blocks that were injected
    // They have this exact class string: sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4
    const addressBlocks = $('.sm\\:col-span-2.grid.grid-cols-1.sm\\:grid-cols-2.gap-4.mb-4');

    if (addressBlocks.length === 3) {
        const processBlock = (block, suffix, idSuffix) => {
            // Check if we already injected the checkbox (idempotency)
            if ($(block).find('#same_as_anak_' + idSuffix).length > 0) return;

            // Add Checkbox
            $(block).prepend(`
            <div class="sm:col-span-2 mb-2">
              <label class="flex items-center space-x-2 text-sm font-medium text-slate-700 cursor-pointer w-max">
                <input type="checkbox" id="same_as_anak_${idSuffix}" class="rounded border-slate-300 text-brand-primary focus:ring-brand-primary w-4 h-4">
                <span>Sama dengan alamat Anak</span>
              </label>
            </div>
            `);
            
            // Update selects and inputs to append suffix (e.g. "Provinsi Ayah")
            $(block).find('select, input[type="text"]').each((i, el) => {
                const name = $(el).attr('name');
                if (name && !name.includes(suffix)) {
                    $(el).attr('name', name + ' ' + suffix);
                }
                const id = $(el).attr('id');
                if (id && !id.includes(idSuffix)) {
                    $(el).attr('id', id.replace('_select', '_' + idSuffix + '_select'));
                }
            });
        };

        // block 0 is Anak, 1 is Ayah, 2 is Ibu
        processBlock(addressBlocks[1], 'Ayah', 'ayah');
        processBlock(addressBlocks[2], 'Ibu', 'ibu');
        
        // Remove old scripts that might have been injected before if we re-run
        $('script#location-fix-script').remove();

        const newScript = `
        <script id="location-fix-script">
          document.addEventListener("DOMContentLoaded", () => {
            
            const setupAddressCopy = (type) => {
              const checkbox = document.getElementById('same_as_anak_' + type);
              if(!checkbox) return;
              
              const suffix = type === 'ayah' ? ' Ayah' : ' Ibu';
              
              checkbox.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                const fields = ['Provinsi', 'Kota/Kabupaten', 'Kecamatan', 'Kelurahan/Desa', 'Kode Pos', 'Alamat Lengkap'];
                
                fields.forEach(f => {
                  let source = document.querySelector('[name="' + f + '"]');
                  let target = document.querySelector('[name="' + f + suffix + '"]');
                  
                  if(source && target) {
                    if(isChecked) {
                      if(target.tagName === 'SELECT') {
                        target.innerHTML = source.innerHTML; 
                      }
                      target.value = source.value;
                      target.style.pointerEvents = 'none';
                      target.style.opacity = '0.7';
                      // Clear required so hidden errors don't block
                      target.removeAttribute('required');
                    } else {
                      target.style.pointerEvents = 'auto';
                      target.style.opacity = '1';
                      target.setAttribute('required', 'required');
                      if(target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') target.value = '';
                      else target.value = ''; 
                    }
                  }
                });
              });
              
              // Bind sync on change of Anak's address if checked
              const syncFields = ['Provinsi', 'Kota/Kabupaten', 'Kecamatan', 'Kelurahan/Desa', 'Kode Pos', 'Alamat Lengkap'];
              syncFields.forEach(f => {
                  let source = document.querySelector('[name="' + f + '"]');
                  if (source) {
                      source.addEventListener('input', () => {
                          if (checkbox.checked) {
                              let target = document.querySelector('[name="' + f + suffix + '"]');
                              if(target) {
                                  if(target.tagName === 'SELECT') target.innerHTML = source.innerHTML;
                                  target.value = source.value;
                              }
                          }
                      });
                      source.addEventListener('change', () => {
                          if (checkbox.checked) {
                              let target = document.querySelector('[name="' + f + suffix + '"]');
                              if(target) {
                                  if(target.tagName === 'SELECT') target.innerHTML = source.innerHTML;
                                  target.value = source.value;
                              }
                          }
                      });
                  }
              });
            };

            setupAddressCopy('ayah');
            setupAddressCopy('ibu');

            const initEmsifaFor = async (idSuffix) => {
              const provSelect = document.getElementById('provinsi_' + idSuffix + '_select');
              const kotaSelect = document.getElementById('kota_' + idSuffix + '_select');
              const kecSelect = document.getElementById('kecamatan_' + idSuffix + '_select');
              const kelSelect = document.getElementById('kelurahan_' + idSuffix + '_select');

              if(!provSelect) return;

              const fetchAPI = async (url) => {
                try { const res = await fetch(url); return await res.json(); }
                catch (e) { return null; }
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

              const provData = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/provinces.json');
              populateSelect(provSelect, provData, 'Provinsi', 'id', 'name');

              provSelect.addEventListener('change', async (e) => {
                if(!e.target.value) return;
                const id = e.target.value.split('|')[1];
                const data = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/regencies/'+id+'.json');
                populateSelect(kotaSelect, data, 'Kota/Kabupaten', 'id', 'name');
                kecSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kecamatan --</option>'; kecSelect.disabled = true;
                kelSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelurahan --</option>'; kelSelect.disabled = true;
              });

              kotaSelect.addEventListener('change', async (e) => {
                if(!e.target.value) return;
                const id = e.target.value.split('|')[1];
                const data = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/districts/'+id+'.json');
                populateSelect(kecSelect, data, 'Kecamatan', 'id', 'name');
                kelSelect.innerHTML = '<option value="" disabled selected>-- Pilih Kelurahan --</option>'; kelSelect.disabled = true;
              });

              kecSelect.addEventListener('change', async (e) => {
                if(!e.target.value) return;
                const id = e.target.value.split('|')[1];
                const data = await fetchAPI('https://kanglerian.github.io/api-wilayah-indonesia/api/villages/'+id+'.json');
                populateSelect(kelSelect, data, 'Kelurahan', 'id', 'name');
              });
            };

            // Initialize for Ayah and Ibu since Anak is handled by original loadEMSIFA()
            initEmsifaFor('ayah');
            initEmsifaFor('ibu');
          });
        </script>
        `;
        $('body').append(newScript);
    }
    
    fs.writeFileSync(file, $.html(), 'utf-8');
    console.log('Successfully fixed', file);
}
