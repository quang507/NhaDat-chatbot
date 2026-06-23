const fs = require('fs');
const path = require('path');

const ONEDRIVE_DIR = `C:\\Users\\QuangLêBáDuy\\OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBotData_Upload`;
const DATA_FILE = path.join(__dirname, 'data.md');

const MARKER = /^## 🔖 \[([^\]]+)\] · (.+)$/gm;

function parseEntries(raw) {
  const matches = Array.from(raw.matchAll(MARKER));
  if (matches.length === 0) {
    return raw.trim()
      ? [{ id: 'legacy', cat: 'Khác', date: 'dữ liệu cũ', content: raw.trim() }]
      : [];
  }
  const entries = [];
  const pre = raw.slice(0, matches[0].index).trim();
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : raw.length;
    let content = raw.slice(start, end).trim();
    content = content.replace(/\n*---\s*$/, '').trim();
    entries.push({ id: `${i}`, cat: m[1], date: m[2], content });
  }
  if (pre) entries.push({ id: 'legacy', cat: 'Khác', date: 'dữ liệu cũ', content: pre });
  return entries;
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')             // Replace spaces with -
    .replace(/[^\w\d\-]/g, '')         // Remove all non-word chars (except -)
    .replace(/\-\-+/g, '-')           // Replace multiple - with single -
    .replace(/^-+/, '')               // Trim - from start of text
    .replace(/-+$/, '')               // Trim - from end of text
    .slice(0, 35);                    // Limit length
}

function getFilename(entry) {
  // Trích dòng đầu tiên của nội dung để làm tên file
  const firstLine = entry.content.split('\n')[0].replace(/[#*`]/g, '').trim();
  const dateStr = entry.date.replace(/[: ]/g, '-');
  
  if (firstLine && firstLine.length > 3) {
    // Chuyển tiếng Việt không dấu đơn giản để đặt tên file cho đẹp
    const cleanLine = firstLine.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const slug = slugify(cleanLine);
    if (slug) return `${dateStr}_${slug}.md`;
  }
  return `${dateStr}_entry-${entry.id}.md`;
}

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error("Lỗi: Không tìm thấy file data.md tại thư mục chatbot.");
    process.exit(1);
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const entries = parseEntries(raw);
  console.log(`Đã đọc ${entries.length} mục từ data.md.`);

  // Tạo thư mục gốc OneDrive nếu chưa có
  if (!fs.existsSync(ONEDRIVE_DIR)) {
    fs.mkdirSync(ONEDRIVE_DIR, { recursive: true });
    console.log(`Đã tạo thư mục gốc OneDrive: ${ONEDRIVE_DIR}`);
  }

  let count = 0;
  for (const entry of entries) {
    const catDir = path.join(ONEDRIVE_DIR, entry.cat.replace(/[\\/:*?"<>|]/g, '-')); // Sanitize folder name
    if (!fs.existsSync(catDir)) {
      fs.mkdirSync(catDir, { recursive: true });
    }

    const filename = getFilename(entry);
    const filePath = path.join(catDir, filename);
    
    // Ghi nội dung vào file md
    fs.writeFileSync(filePath, entry.content, 'utf-8');
    count++;
  }

  console.log(`🎉 THÀNH CÔNG: Đã xuất ${count} file vào thư mục OneDrive!`);
}

main();
