const fs = require('fs');
const cheerio = require('cheerio');

const file = 'form-daycare.html';
let html = fs.readFileSync(file, 'utf-8');
const $ = cheerio.load(html, { decodeEntities: false });

// For Anak, Ayah, Ibu
const targetNames = ['Alamat Lengkap', 'Alamat Lengkap Ayah', 'Alamat Lengkap Ibu'];

targetNames.forEach(name => {
    // Find the textarea container
    const textarea = $(`textarea[name="${name}"]`);
    if (textarea.length > 0) {
        const container = textarea.closest('.sm\\:col-span-2');
        // The previous element is the grid block
        const prevBlock = container.prev();
        
        if (prevBlock.hasClass('sm:col-span-2') && prevBlock.hasClass('grid')) {
            // It's the location API block!
            
            // Check if there is a checkbox div inside it at the top
            // The checkbox div has class sm:col-span-2 and mb-2
            const firstChild = prevBlock.children().first();
            if (firstChild.find('input[type="checkbox"]').length > 0) {
                // Insert after the checkbox
                container.insertAfter(firstChild);
            } else {
                // Prepend to the grid block
                prevBlock.prepend(container);
            }
        }
    }
});

fs.writeFileSync(file, $.html(), 'utf-8');
console.log('Successfully reordered Alamat Lengkap!');
