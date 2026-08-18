const fs = require('fs');

const forms = ['form-daycare.html', 'form-sd.html', 'form-smp.html', 'form-sma.html', 'form-tk.html'];

for (const file of forms) {
    if (!fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf-8');

    // Remove "flex items-center justify-center" from body
    // Also handle "flex flex-col items-center justify-center" which is in form-tk
    html = html.replace(/<body([^>]*)class="([^"]*)\bflex\b(.*?)">/, (match, p1, p2, p3) => {
        let newClasses = (p2 + ' ' + p3).replace(/\bflex\b/g, '')
                                       .replace(/\bitems-center\b/g, '')
                                       .replace(/\bjustify-center\b/g, '')
                                       .replace(/\bflex-col\b/g, '')
                                       .replace(/\s+/g, ' ').trim();
        return `<body${p1}class="${newClasses}">`;
    });
    
    // For form-tk, it has a wrapper div:
    // <div class="relative z-10 py-10 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center min-h-screen">
    html = html.replace(/class="([^"]*)\bflex\b([^"]*)\bjustify-center\b([^"]*)">/g, (match, p1, p2, p3) => {
        if (match.includes('min-h-screen')) {
           let newClasses = (p1 + p2 + p3).replace(/\bflex\b/g, '')
                                          .replace(/\bitems-center\b/g, '')
                                          .replace(/\bjustify-center\b/g, '')
                                          .replace(/\bflex-col\b/g, '')
                                          .replace(/\s+/g, ' ').trim();
           return `class="${newClasses}">`;
        }
        return match;
    });

    // Add mx-auto to the max-w-4xl container
    if (!html.includes('max-w-4xl w-full mx-auto')) {
        html = html.replace(/max-w-4xl w-full/g, 'max-w-4xl w-full mx-auto');
    }

    fs.writeFileSync(file, html, 'utf-8');
    console.log('Fixed scrolling in', file);
}
