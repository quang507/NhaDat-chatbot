const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(__dirname, 'data.md');

function getAllMdFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(getAllMdFiles(file));
        } else if (file.endsWith('.md') && !file.includes('qa-generated_backup_goc.md')) {
            results.push(file);
        }
    });
    return results;
}

const files = getAllMdFiles(DATA_DIR);
let combined = '';

files.forEach(f => {
    const relativeName = path.relative(__dirname, f);
    const content = fs.readFileSync(f, 'utf8');
    combined += `\n\n## 📄 [Source] ➡ ${relativeName}\n\n${content}`;
});

fs.writeFileSync(OUT_FILE, combined.trim(), 'utf8');
console.log(`Generated data.md from ${files.length} files. Total size: ${combined.length} bytes.`);
