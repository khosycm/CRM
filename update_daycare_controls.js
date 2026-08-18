const fs = require('fs');
const cheerio = require('cheerio');

const file = 'form-daycare.html';
let html = fs.readFileSync(file, 'utf-8');
const $ = cheerio.load(html, { decodeEntities: false });

const baseInputClass = "mt-1.5 block w-full rounded-lg border-slate-300 shadow-sm sm:text-sm p-2.5 border transition-colors bg-white/50 focus:bg-white focus:border-brand-primary focus:ring-brand-primary";

// Helper to replace text input with select
function convertToSelect(selector, optionsHtml) {
    $(selector).each((i, el) => {
        if ($(el).is('input[type="text"]')) {
            const name = $(el).attr('name');
            const required = $(el).attr('required') ? 'required="required"' : '';
            const newSelect = `<select name="${name}" class="${baseInputClass}" ${required}>
                ${optionsHtml}
            </select>`;
            $(el).replaceWith(newSelect);
        }
    });
}

// 1. Program Daycare
convertToSelect('input[name="Program daycare"]', `
    <option value="" disabled selected>-- Pilih Program --</option>
    <option value="Halfday">Halfday</option>
    <option value="Fullday">Fullday</option>
`);

// 2. Status Orang Tua
convertToSelect('input[name="Status Orang Tua"]', `
    <option value="" disabled selected>-- Pilih Status --</option>
    <option value="Lengkap">Lengkap (Kedua orang tua ada)</option>
    <option value="Yatim">Yatim (Ayah meninggal)</option>
    <option value="Piatu">Piatu (Ibu meninggal)</option>
    <option value="Yatim Piatu">Yatim Piatu (Keduanya meninggal)</option>
`);

// 3. Kewarganegaraan
convertToSelect('input[name="Kewarganegaraan"]', `
    <option value="" disabled selected>-- Pilih Kewarganegaraan --</option>
    <option value="WNI">WNI</option>
    <option value="WNA">WNA</option>
`);

// 4. Golongan Darah (Anak, Ayah, Ibu)
convertToSelect('input[name="Golongan Darah"], input[name="Golongan Darah Ayah"], input[name="Golongan Darah Ibu"]', `
    <option value="" disabled selected>-- Pilih Golongan Darah --</option>
    <option value="O">O</option>
    <option value="A">A</option>
    <option value="B">B</option>
    <option value="AB">AB</option>
`);

// 5. Berat Badan & Tinggi Badan (Add kg and cm suffixes)
$('input[name="Berat Badan"], input[name="Tinggi Badan"]').each((i, el) => {
    // Only wrap if not already wrapped
    if ($(el).parent().hasClass('flex')) return;
    
    const isWeight = $(el).attr('name') === 'Berat Badan';
    const suffix = isWeight ? 'kg' : 'cm';
    
    // Adjust classes for the input to have rounded-l-lg and no border on right
    let inputClasses = baseInputClass.replace('rounded-lg', 'rounded-l-lg rounded-r-none border-r-0');
    
    // Create the wrapper
    const wrapper = $(`
        <div class="mt-1.5 flex shadow-sm">
            ${$.html(el).replace(baseInputClass, inputClasses)}
            <span class="inline-flex items-center px-3 rounded-r-lg border border-l-0 border-slate-300 bg-slate-50 text-slate-500 sm:text-sm">
                ${suffix}
            </span>
        </div>
    `);
    
    // We need to also remove the mt-1.5 from the wrapper if the input had it, or we just keep it on the wrapper and remove it from input.
    wrapper.find('input').removeClass('mt-1.5');
    
    $(el).replaceWith(wrapper);
});

// 6. Reorder Alamat Lengkap
// The address blocks have this specific class structure we injected earlier:
const addressBlocks = $('.sm\\:col-span-2.grid.grid-cols-1.sm\\:grid-cols-2.gap-4.mb-4');
addressBlocks.each((i, block) => {
    // Find Alamat Lengkap div
    // The div containing Alamat Lengkap is just a child div somewhere inside this block, wait, Alamat Lengkap is sm:col-span-2.
    // Let's find the textarea or input for Alamat Lengkap
    const alamatField = $(block).find('textarea[name^="Alamat Lengkap"], input[name^="Alamat Lengkap"]');
    if (alamatField.length > 0) {
        const alamatContainer = alamatField.closest('.sm\\:col-span-2');
        
        // We want to move this container to be the FIRST child of the grid, or right after the checkbox if it exists.
        // Wait, the checkbox container is also sm:col-span-2 and is prepended.
        const checkboxContainer = $(block).find('input[type="checkbox"]').closest('.sm\\:col-span-2');
        
        if (checkboxContainer.length > 0) {
            // Insert after checkbox
            alamatContainer.insertAfter(checkboxContainer);
        } else {
            // Insert at the very top of the block
            $(block).prepend(alamatContainer);
        }
    }
});

fs.writeFileSync(file, $.html(), 'utf-8');
console.log('Successfully updated form controls!');
