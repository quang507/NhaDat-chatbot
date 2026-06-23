const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const ONEDRIVE_DIR = `C:\\Users\\QuangLêBáDuy\\OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBotData_Upload`;
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
let GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Thử đọc từ .env.local
if (!GEMINI_API_KEY && fs.existsSync(path.join(__dirname, '.env.local'))) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
  const match = envContent.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
  if (match) {
    GEMINI_API_KEY = match[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

// Thử đọc từ api_key.txt
if (!GEMINI_API_KEY && fs.existsSync(path.join(__dirname, 'api_key.txt'))) {
  GEMINI_API_KEY = fs.readFileSync(path.join(__dirname, 'api_key.txt'), 'utf-8').trim();
}

if (!GEMINI_API_KEY) {
  console.error("Lỗi: Không tìm thấy GEMINI_API_KEY trong env, .env.local hoặc api_key.txt.");
  process.exit(1);
}

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DIMS = 3072;
const BRANCH = 'chatbot-logs';
const INDEX_PATH = 'index.json';

// ---------- Tính mã MD5 của File ----------
function getFileHash(filePath) {
  try {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  } catch (e) {
    return '';
  }
}

// ---------- Trình đọc file văn bản/Word/Excel ----------
async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const buffer = fs.readFileSync(filePath);

  if (ext === 'md' || ext === 'txt') {
    return buffer.toString('utf-8');
  }
  
  if (ext === 'docx') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (e) {
      console.error(`Lỗi đọc file Word ${filePath}:`, e.message);
      return '';
    }
  }

  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    try {
      const XLSX = require('xlsx');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      return wb.ItemNames ? '' : wb.SheetNames.map(s => `### ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`).join('\n\n');
    } catch (e) {
      console.error(`Lỗi đọc file Excel ${filePath}:`, e.message);
      return '';
    }
  }

  return ''; // Bỏ qua định dạng khác (hoặc ảnh)
}

// ---------- Copy thư mục đệ quy ----------
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      // Bỏ qua các file rác hoặc file script trong OneDrive
      if (entry.name.startsWith('.') || entry.name.startsWith('~') || entry.name === 'Thumbs.db' || entry.name.endsWith('.bat')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------- Quét thư mục đệ quy thu thập files ----------
function scanDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath, fileList);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.md', '.txt', '.docx', '.xlsx', '.xls', '.csv'].includes(ext)) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

// ---------- Chunk Text ----------
const CHUNK = 1800;
const OVERLAP = 200;

function chunkText(raw) {
  const text = raw.replace(/\r\n/g, '\n').trim();
  if (!text) return [];
  const blocks = text.split(/\n(?=#{1,6}\s)|\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const b of blocks) {
    if (b.length > CHUNK) {
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < b.length; i += CHUNK - OVERLAP) {
        chunks.push(b.slice(i, i + CHUNK));
      }
      continue;
    }
    if ((cur + '\n\n' + b).length > CHUNK) {
      if (cur) chunks.push(cur);
      cur = b;
    } else {
      cur = cur ? cur + '\n\n' + b : b;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

// ---------- Embedding API ----------
function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map(x => +(x / n).toFixed(5));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function embedBatch(texts, taskType) {
  if (texts.length === 0) return [];
  const out = [];
  const BATCH_SIZE = 100;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(1000);
    const chunk = texts.slice(i, i + BATCH_SIZE);
    console.log(`Đang tạo vector embedding cho chunks ${i} đến ${Math.min(i + BATCH_SIZE, texts.length)}... (Tổng: ${texts.length})`);
    const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: chunk.map(text => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
        })),
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Batch embedding lỗi ${res.status}: ${errText}`);
    }
    const data = await res.json();
    const embeddings = data.embeddings || [];
    for (const emb of embeddings) {
      out.push(normalize(emb.values || []));
    }
  }
  return out;
}

async function main() {
  try {
    if (!fs.existsSync(ONEDRIVE_DIR)) {
      console.error(`Lỗi: Không tìm thấy thư mục OneDrive: ${ONEDRIVE_DIR}`);
      process.exit(1);
    }

    // 1. Đọc index.json cũ từ nhánh chatbot-logs để nạp bộ nhớ đệm (cache)
    let cacheMap = {};
    try {
      console.log("Đang đọc chỉ mục index.json cũ từ nhánh chatbot-logs...");
      execSync('git checkout chatbot-logs');
      try { execSync('git pull origin chatbot-logs'); } catch {}
      if (fs.existsSync(INDEX_PATH)) {
        const rawIndex = fs.readFileSync(INDEX_PATH, 'utf-8');
        const parsed = JSON.parse(rawIndex);
        if (parsed && Array.isArray(parsed.chunks)) {
          for (const c of parsed.chunks) {
            if (c.file && c.hash && c.vec && c.vec.length === DIMS) {
              if (!cacheMap[c.file]) cacheMap[c.file] = { hash: c.hash, chunks: [] };
              cacheMap[c.file].chunks.push(c);
            }
          }
          console.log(`Đã nạp bộ nhớ đệm RAG thành công cho ${Object.keys(cacheMap).length} files.`);
        }
      }
      execSync('git checkout main');
    } catch (e) {
      console.log("Không tìm thấy chỉ mục cũ hoặc có lỗi. Sẽ tạo mới toàn bộ. Chi tiết:", e.message);
      try { execSync('git checkout main'); } catch {}
    }

    // 2. Đồng bộ thư mục OneDrive về Git local
    console.log("2. Đang đồng bộ dữ liệu từ OneDrive vào Git local...");
    if (fs.existsSync(LOCAL_DATA_DIR)) {
      fs.rmSync(LOCAL_DATA_DIR, { recursive: true, force: true });
    }
    copyDir(ONEDRIVE_DIR, LOCAL_DATA_DIR);
    console.log("Đồng bộ thư mục thành công!");

    // 3. Phân tích các file, phát hiện các file mới/thay đổi để gom chunks
    console.log("3. Đang phân tích files dữ liệu...");
    const files = scanDir(LOCAL_DATA_DIR);
    console.log(`Tìm thấy ${files.length} file dữ liệu.`);

    let finalChunks = [];
    let chunksToEmbed = [];
    let filesSkipped = 0;
    let filesToEmbed = [];

    for (const file of files) {
      const relativePath = path.relative(LOCAL_DATA_DIR, file).replace(/\\/g, '/');
      const currentHash = getFileHash(file);

      // Nếu file không thay đổi nội dung, dùng lại cache
      if (cacheMap[relativePath] && cacheMap[relativePath].hash === currentHash) {
        finalChunks.push(...cacheMap[relativePath].chunks);
        filesSkipped++;
        continue;
      }

      console.log(`Phát hiện file mới/thay đổi: ${relativePath}`);
      filesToEmbed.push({ file, relativePath, hash: currentHash });
    }

    // Phân tích và sinh chunks cho các file cần cập nhật
    let newChunks = [];
    for (const item of filesToEmbed) {
      const fileText = await parseFile(item.file);
      if (!fileText.trim()) continue;

      const parts = item.relativePath.split('/');
      const category = parts.length > 1 ? parts[0] : 'Khác';

      const rawChunks = chunkText(fileText);
      const annotatedChunks = rawChunks.map(text => `## 🔖 [${category}] · OneDrive\n\n${text}`);

      for (const text of annotatedChunks) {
        newChunks.push({
          text,
          file: item.relativePath,
          hash: item.hash
        });
      }
    }

    console.log(`Giữ nguyên: ${filesSkipped} files. Cần sinh vector mới cho: ${filesToEmbed.length} files (${newChunks.length} chunks).`);

    // 4. Sinh vector cho các chunks mới (sử dụng batching của API để tối ưu RPM)
    if (newChunks.length > 0) {
      try {
        console.log("4. Bắt đầu sinh vector embedding cho các chunks mới...");
        const vecs = await embedBatch(newChunks.map(c => c.text), 'RETRIEVAL_DOCUMENT');
        
        // Gắn vector vào chunks mới
        newChunks.forEach((c, idx) => {
          c.vec = vecs[idx] || [];
        });

        finalChunks.push(...newChunks);
        console.log(`Đã cập nhật vector thành công cho ${newChunks.length} chunks.`);
      } catch (err) {
        console.error(`⚠️ LỖI: Hết hạn mức API Gemini khi sinh vector:`, err.message);
        console.log(`Khôi phục các chunks cũ của các file bị lỗi để dữ liệu chatbot không bị thiếu hụt.`);
        
        // Phục hồi dữ liệu cũ từ cache cho các file không sinh được vector
        for (const item of filesToEmbed) {
          if (cacheMap[item.relativePath]) {
            finalChunks.push(...cacheMap[item.relativePath].chunks);
            console.log(`- Đã giữ lại chỉ mục cũ của: ${item.relativePath}`);
          }
        }
      }
    }

    const index = { chunks: finalChunks, builtAt: new Date().toISOString() };

    // 5. Lưu index.json tạm thời
    const tempIndexPath = path.join(__dirname, 'index_temp.json');
    fs.writeFileSync(tempIndexPath, JSON.stringify(index), 'utf-8');
    console.log("5. Đã lưu index tạm thời.");

    // 6. Chuyển nhánh git đẩy index.json lên GitHub
    console.log("6. Đang chuyển sang nhánh chatbot-logs...");
    execSync('git checkout chatbot-logs');
    try { execSync('git pull origin chatbot-logs'); } catch {}

    const destIndexPath = path.join(__dirname, 'index.json');
    fs.copyFileSync(tempIndexPath, destIndexPath);
    fs.unlinkSync(tempIndexPath); // Xóa file tạm
    console.log("7. Đã copy index.json vào nhánh chatbot-logs.");

    console.log("8. Đang push index.json lên GitHub...");
    execSync('git add index.json');
    execSync('git commit -m "Update index.json via local OneDrive incremental reindex script"');
    execSync('git push origin chatbot-logs');
    console.log("Đã cập nhật chỉ mục (index.json) thành công!");

    // 7. Trở lại main và push các file data lên GitHub
    console.log("9. Đang trở về nhánh main...");
    execSync('git checkout main');
    
    console.log("10. Đang push các file thư mục data lên GitHub...");
    execSync('git add data/');
    try {
      execSync('git commit -m "Sync data folders from OneDrive"');
      execSync('git push origin main');
      console.log("Đã đẩy dữ liệu thư mục data lên main branch thành công!");
    } catch (e) {
      console.log("Không có thay đổi dữ liệu nào cần commit trên main branch.");
    }

    console.log("\n🚀 HOÀN THÀNH: Tất cả dữ liệu đã được đồng bộ & RAG index đã hoạt động hoàn hảo!");
  } catch (e) {
    console.error("Lỗi thực thi:", e);
    try {
      execSync('git checkout main');
    } catch {}
    process.exit(1);
  }
}

main();
