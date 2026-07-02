const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

const DEFAULT_ONEDRIVE = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBot, LiveSlide');
const ONEDRIVE_DIR = process.env.CHATBOT_UPLOAD_DIR || path.join(DEFAULT_ONEDRIVE, 'ChatBotData_Upload');
const ONEDRIVE_IMAGES_DIR_GLOBAL = process.env.CHATBOT_IMAGES_DIR || path.join(DEFAULT_ONEDRIVE, 'ChatBotImages_Upload');
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
let GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Thử đọc từ .env.local
if (fs.existsSync(path.join(__dirname, '.env.local'))) {
  const envContent = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf-8');
  const matchGemini = envContent.match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
  if (matchGemini) {
    GEMINI_API_KEY = matchGemini[1].trim().replace(/^['"]|['"]$/g, '');
  }
}

// Thử đọc từ api_key.txt
if (!GEMINI_API_KEY && fs.existsSync(path.join(__dirname, 'api_key.txt'))) {
  GEMINI_API_KEY = fs.readFileSync(path.join(__dirname, 'api_key.txt'), 'utf-8').trim();
}

if (!GEMINI_API_KEY) {
  console.error("Lỗi: Không tìm thấy GEMINI_API_KEY.");
  process.exit(1);
}

const EMBED_MODEL = 'gemini-embedding-001'; // PHẢI khớp lib/rag.ts (runtime query) và index hiện tại
const EMBED_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DIMS = 3072; // gemini-embedding-001 mặc định 3072 chiều
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

// Loại bỏ các khối "list.txt" (danh sách file kiểu ffmpeg concat: file 'C:/...') vô tình
// lẫn vào tài liệu (vd copy nhầm lúc gộp nhiều tài liệu). Đây là rác kỹ thuật dựng phim,
// không có giá trị cho RAG, và sinh ra hàng loạt chunk gần giống nhau (near-dup) vì
// toàn đường dẫn file lặp lại theo mẫu giống hệt nhau.
function stripJunkListDumps(text) {
  const lines = text.split('\n');
  const out = [];
  let i = 0;
  let removedLines = 0;
  while (i < lines.length) {
    const isListHeading = /^#{1,6}\s*list[._]?txt\b/i.test(lines[i].trim());
    let k = isListHeading ? i + 1 : i;
    let fileLineCount = 0;
    while (k < lines.length) {
      const t = lines[k].trim();
      if (t === '') { k++; continue; }
      if (/^file\s+'[^']*'\s*$/.test(t)) { fileLineCount++; k++; continue; }
      break;
    }
    if (fileLineCount >= 3) {
      removedLines += (k - i);
      i = k;
      continue;
    }
    out.push(lines[i]);
    i++;
  }
  if (removedLines > 0) {
    console.log(`  (Đã lọc bỏ ${removedLines} dòng 'list.txt' rác - danh sách file dựng phim lẫn vào tài liệu)`);
  }
  return out.join('\n');
}

// NEAR-DUP: gộp các chunk gần như y hệt (cùng nội dung lặp lại ở nhiều file/nguồn khác nhau).
// Cùng ngưỡng + logic với lib/rag.ts buildIndex() để nhất quán giữa 2 đường build index.
function dedupeNearDuplicates(chunks) {
  const NEAR_DUP = 0.985;
  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const isTable = (t) => t.trim().startsWith('|') || t.includes('\n|');
  const sourcePriority = (file) => {
    const f = (file || '').toLowerCase();
    if (f.includes('03_human-qa')) return 5;
    if (f.includes('drive-extracted')) return 4;
    if (f.includes("nyah-phudinh") || f.includes("nyah-ph") || f.includes('01 nyah')) return 3;
    if (f.includes('qa-generated')) return 2;
    if (f.includes('web-crawl')) return 1;
    return 3;
  };
  const kept = [];
  let removed = 0;
  for (const c of chunks) {
    if (!c.vec || !c.vec.length || isTable(c.text)) { kept.push(c); continue; }
    let dupIdx = -1;
    for (let j = 0; j < kept.length; j++) {
      const k = kept[j];
      if (!k.vec || !k.vec.length || isTable(k.text)) continue;
      if (dot(c.vec, k.vec) > NEAR_DUP) { dupIdx = j; break; }
    }
    if (dupIdx >= 0) {
      removed++;
      if (sourcePriority(c.file) > sourcePriority(kept[dupIdx].file)) kept[dupIdx] = c;
    } else {
      kept.push(c);
    }
  }
  if (removed > 0) console.log(`\n(Dedup) Đã lọc bỏ ${removed} chunk near-dup (cosine > ${NEAR_DUP}) trên tổng ${chunks.length} chunk.`);
  return kept;
}

// ---------- Copy thư mục đệ quy ----------
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src);
  for (const name of entries) {
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);
    
    let isDir = false;
    try {
      isDir = fs.statSync(srcPath).isDirectory();
    } catch {}

    if (isDir) {
      copyDir(srcPath, destPath);
    } else {
      // Bỏ qua các file rác hoặc file script trong OneDrive
      if (name.startsWith('.') || name.startsWith('~') || name === 'Thumbs.db' || name.endsWith('.bat')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------- Quét thư mục đệ quy thu thập files ----------
function scanDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir);
  for (const name of entries) {
    const fullPath = path.join(dir, name);
    
    let isDir = false;
    try {
      isDir = fs.statSync(fullPath).isDirectory();
    } catch {}

    if (isDir) {
      scanDir(fullPath, fileList);
    } else {
      const ext = path.extname(name).toLowerCase();
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
    // Nếu block là bảng biểu markdown, tách riêng làm chunk độc lập để tránh bị chia cắt/gộp sai
    const isTable = b.startsWith('|');
    if (isTable) {
      if (cur) { chunks.push(cur); cur = ''; }
      if (b.length > CHUNK) {
        // cắt cứng nếu bảng quá lớn
        for (let i = 0; i < b.length; i += CHUNK - OVERLAP) {
          chunks.push(b.slice(i, i + CHUNK));
        }
      } else {
        chunks.push(b);
      }
      continue;
    }

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

// Đọc "retryDelay" (vd "38s") mà Gemini tự đề xuất trong lỗi 429, để đợi ĐÚNG thời gian
// thay vì đoán cứng — quota free-tier tính theo request/phút nên đợi thiếu vẫn dính lại 429.
function parseRetryDelaySeconds(errText) {
  const m = errText.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.ceil(parseFloat(m[1])) : null;
}

async function embedBatch(texts, taskType) {
  if (texts.length === 0) return [];
  const out = [];

  // Dùng Gemini Embedding (gemini-embedding-001, 3072 chiều) — khớp runtime lib/rag.ts
  // BATCH_SIZE nhỏ (20) để 1 file lớn không "ăn" hết quota free-tier (100 request/phút) chỉ trong 1 lần gọi.
  const BATCH_SIZE = 20;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(15000);
    const chunk = texts.slice(i, i + BATCH_SIZE);
    console.log(`[Gemini] Đang tạo vector embedding cho chunks ${i} đến ${Math.min(i + BATCH_SIZE, texts.length)}... (Tổng: ${texts.length})`);
    const res = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: chunk.map(text => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          // KHÔNG ép outputDimensionality: gemini-embedding-001 mặc định 3072 chiều,
          // phải khớp với query 3072 chiều trong lib/rag.ts, nếu không bot sẽ trả về rỗng.
        })),
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        const retryS = parseRetryDelaySeconds(errText);
        if (retryS) {
          console.log(`  (429 — Gemini đề xuất đợi ${retryS}s, đang đợi ${retryS + 3}s...)`);
          await sleep((retryS + 3) * 1000);
          // Thử lại đúng 1 lần với batch này sau khi đợi đủ thời gian Gemini yêu cầu
          const retryRes = await fetch(`${EMBED_BASE}/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`, {
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
          if (!retryRes.ok) {
            throw new Error(`Batch embedding lỗi ${retryRes.status} (sau khi đợi ${retryS}s): ${await retryRes.text()}`);
          }
          const retryData = await retryRes.json();
          for (const emb of (retryData.embeddings || [])) out.push(normalize(emb.values || []));
          continue;
        }
      }
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

// ---------- Tự động trích xuất tag từ tên file ảnh và sinh file markdown chỉ mục ----------
function generateImageMetadata(imagesDir, outputMdPath) {
  if (!fs.existsSync(imagesDir)) {
    if (fs.existsSync(outputMdPath)) {
      try { fs.unlinkSync(outputMdPath); } catch (e) {}
    }
    return;
  }

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const entries = [];

  // Duyệt ĐỆ QUY mọi thư mục con (vd 01_NyAh-PhuDinh/, cong_ty/) để không bỏ sót ảnh
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let isDir = false;
      try { isDir = fs.statSync(full).isDirectory(); } catch {}
      if (isDir) { walk(full); continue; }

      const ext = path.extname(name).toLowerCase();
      if (!imageExtensions.includes(ext)) continue;

      const rel = path.relative(imagesDir, full).replace(/\\/g, '/'); // vd: 01_NyAh-PhuDinh/phoi-canh.jpg
      const baseName = path.basename(name, ext);
      const parts = baseName.split('_');
      const cleanParts = parts.map(p => p.replace(/-/g, ' ').trim());
      const title = cleanParts[cleanParts.length - 1];
      // Gộp tên thư mục cha vào từ khóa để RAG khớp đúng dự án
      const folderKw = path.dirname(rel) !== '.' ? path.dirname(rel).replace(/[\/_-]/g, ' ').trim() + ', ' : '';
      const keywords = folderKw + cleanParts.join(', ');
      // Encode đường dẫn để URL hợp lệ kể cả khi tên file có dấu cách / tiếng Việt
      const urlPath = rel.split('/').map(encodeURIComponent).join('/');

      entries.push(`## 🔖 [Ảnh Minh Họa] · ${baseName}
Hình ảnh minh họa, ảnh chụp, bản vẽ hoặc phối cảnh thực tế liên quan đến: ${keywords}.
Chi tiết: ${title}.
Đường dẫn hình ảnh: ![${title}](/images/${urlPath})

---`);
    }
  };
  walk(imagesDir);

  if (entries.length > 0) {
    const content = `# 📸 Danh Sách Ảnh Minh Họa Tự Động Sinh\n\nTài liệu này chứa thông tin và đường dẫn đến các hình ảnh dự án phục vụ cho RAG.\n\n${entries.join('\n\n')}\n`;
    fs.writeFileSync(outputMdPath, content, 'utf-8');
    console.log(`Đã tạo/cập nhật chỉ mục ảnh minh họa với ${entries.length} ảnh tại ${outputMdPath}.`);
  } else {
    if (fs.existsSync(outputMdPath)) {
      try { fs.unlinkSync(outputMdPath); } catch (e) {}
    }
  }
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
      execSync('git checkout -f chatbot-logs');
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
      execSync('git checkout -f main');
    } catch (e) {
      console.log("Không tìm thấy chỉ mục cũ hoặc có lỗi. Sẽ tạo mới toàn bộ. Chi tiết:", e.message);
      try { execSync('git checkout -f main'); } catch {}
    }

    // 2. Đồng bộ thư mục văn bản OneDrive về Git local (MIRROR: xóa sạch data/ cũ trước khi copy)
    console.log("2. Đang đồng bộ dữ liệu văn bản từ OneDrive vào Git local...");
    // Đảm bảo nguồn OneDrive có dữ liệu trước khi xóa data/ (tránh xóa nhầm khi OneDrive trống/online-only)
    const srcEntries = fs.readdirSync(ONEDRIVE_DIR);
    if (srcEntries.length === 0) {
      console.error('Lỗi: Thư mục nguồn OneDrive đang trống. Dừng để tránh xóa nhầm dữ liệu.');
      process.exit(1);
    }
    // Xóa data/ cũ để loại bỏ folder/file đã bị xóa/đổi tên bên OneDrive (vd: ChatBotData_Upload trùng lặp)
    if (fs.existsSync(LOCAL_DATA_DIR)) {
      fs.rmSync(LOCAL_DATA_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(LOCAL_DATA_DIR, { recursive: true });
    copyDir(ONEDRIVE_DIR, LOCAL_DATA_DIR);
    console.log("Đồng bộ thư mục văn bản thành công!");

    // 2b. Đồng bộ hình ảnh từ OneDrive (nếu có)
    const ONEDRIVE_IMAGES_DIR = ONEDRIVE_IMAGES_DIR_GLOBAL;
    const LOCAL_IMAGES_DIR = path.join(__dirname, 'public', 'images');
    const LOCAL_IMAGES_METADATA_FILE = path.join(LOCAL_DATA_DIR, 'generated_images_metadata.md');
    // MIRROR ảnh: ChatBotImages_Upload (OneDrive) -> public/images (xóa cũ rồi copy, để ảnh đã xóa cũng biến mất)
    if (fs.existsSync(ONEDRIVE_IMAGES_DIR) && fs.readdirSync(ONEDRIVE_IMAGES_DIR).length > 0) {
      if (fs.existsSync(LOCAL_IMAGES_DIR)) fs.rmSync(LOCAL_IMAGES_DIR, { recursive: true, force: true });
      fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
      copyDir(ONEDRIVE_IMAGES_DIR, LOCAL_IMAGES_DIR);
      console.log("Đồng bộ hình ảnh từ OneDrive vào public/images thành công!");
    } else {
      console.log("Bỏ qua đồng bộ ảnh: thư mục ảnh OneDrive trống hoặc không tồn tại.");
    }
    // Sinh metadata ảnh (đường dẫn /images/...) để RAG/slide biết URL ảnh mà chèn vào slide
    generateImageMetadata(LOCAL_IMAGES_DIR, LOCAL_IMAGES_METADATA_FILE);

    // 2c. COMMIT + PUSH data/ và public/images/ lên main NGAY BÂY GIỜ, trước khi đụng tới nhánh
    // chatbot-logs. QUAN TRỌNG: nếu để việc này tới cuối script (sau khi đã checkout sang
    // chatbot-logs rồi quay lại), `git checkout -f` sẽ XÓA SẠCH các thay đổi data/ chưa commit
    // (vì data/ không giống nhau giữa 2 nhánh) -> mirror-copy coi như vô nghĩa, GitHub main
    // không bao giờ nhận được cập nhật/xóa file thật (dù index.json vẫn đúng vì embed đọc
    // trực tiếp từ đĩa trước khi nhánh bị đổi). Commit ngay ở đây để không bị mất.
    console.log("Đang push dữ liệu văn bản + hình ảnh lên main NGAY (trước khi đụng nhánh chatbot-logs)...");
    execSync('git add -A data/'); // -A để stage cả file/folder bị xóa (mirror)
    if (fs.existsSync(LOCAL_IMAGES_DIR)) {
      execSync('git add -A public/images/');
    }
    try {
      execSync('git commit -m "Sync data folders and images from OneDrive"');
      execSync('git push origin main');
      console.log("Đã đẩy dữ liệu và hình ảnh lên main branch thành công!");
    } catch (e) {
      console.log("Không có thay đổi dữ liệu hay hình ảnh nào cần commit trên main branch.");
    }

    // 3. Phân tích các file, phát hiện các file mới/thay đổi để gom chunks
    console.log("3. Đang phân tích files dữ liệu...");
    const files = scanDir(LOCAL_DATA_DIR);
    console.log(`Tìm thấy ${files.length} file dữ liệu.`);

    let finalChunks = [];
    let filesSkipped = 0;
    let filesToEmbed = [];

    for (const file of files) {
      const relativePath = path.relative(LOCAL_DATA_DIR, file).replace(/\\/g, '/');
      if (relativePath.startsWith('03_Human-QA/') || relativePath.includes('Signature by Codinachs') || relativePath.includes('2c8a')) {
        continue;
      }
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

    // Ưu tiên embed các file QUAN TRỌNG trước, để nếu dính 429 giữa chừng thì dữ liệu
    // cốt lõi (URL ảnh, bảng giá/diện tích từng lô) vẫn kịp vào index.
    // Số càng nhỏ càng được nhúng sớm.
    const embedPriority = (p) => {
      if (p.includes('generated_images_metadata')) return 0; // URL ảnh cho slide
      if (p.includes('Data_productlist')) return 1;          // bảng giá + diện tích GCN từng lô
      if (p.includes('05_ThongTinCacLo')) return 2;          // bảng gộp thông tin lô
      if (p.includes('qa-generated')) return 3;              // Q&A chuẩn văn phong
      return 10;
    };
    filesToEmbed.sort((a, b) => embedPriority(a.relativePath) - embedPriority(b.relativePath));

    console.log(`Giữ nguyên: ${filesSkipped} files. Cần sinh vector mới cho: ${filesToEmbed.length} files.`);

    // 4. Sinh vector cho từng file (file-by-file) để hỗ trợ lưu trữ lũy tiến và tránh lỗi 429
    let hitLimit = false;
    let filesEmbeddedCount = 0;

    for (let idx = 0; idx < filesToEmbed.length; idx++) {
      const item = filesToEmbed[idx];
      
      // Nếu đã bị dính rate limit ở file trước, khôi phục cache file này (nếu có) và bỏ qua
      if (hitLimit) {
        if (cacheMap[item.relativePath]) {
          finalChunks.push(...cacheMap[item.relativePath].chunks);
        }
        continue;
      }

      let fileText = await parseFile(item.file);
      fileText = stripJunkListDumps(fileText);
      if (!fileText.trim()) continue;

      // Xây dựng breadcrumb đường dẫn chi tiết thân thiện với LLM
      let cleanPath = item.relativePath;
      cleanPath = cleanPath
        .replace(/^00_NhaDat-CongTy/, 'Nhà Đất Company')
        .replace(/^01_NyAh-PhuDinh/, "Ny'ah Phú Định")
        .replace(/^02_Villa-NyAh/, "Villa Ny'ah")
        .replace(/^drive-extracted\//, 'Tài liệu Google Drive > ');

      const rawChunks = chunkText(fileText);
      const annotatedChunks = rawChunks.map(text => `## 🔖 Thư mục: ${cleanPath}\n\n${text}`);

      if (annotatedChunks.length === 0) continue;

      console.log(`[${idx + 1}/${filesToEmbed.length}] Đang xử lý: ${item.relativePath} (${annotatedChunks.length} chunks)...`);

      let vecs = null;
      let retries = 0;
      
      while (retries < 2) {
        try {
          vecs = await embedBatch(annotatedChunks, 'RETRIEVAL_DOCUMENT');
          break;
        } catch (err) {
          retries++;
          console.warn(`⚠️ Cảnh báo: Lỗi sinh vector (Lần thử ${retries}):`, err.message);
          if (retries < 2) {
            console.log("Đang tạm dừng 20 giây trước khi thử lại...");
            await sleep(20000);
          }
        }
      }

      if (vecs && vecs.length === annotatedChunks.length) {
        // Gắn vector vào chunks mới
        const fileChunks = annotatedChunks.map((text, i) => ({
          text,
          file: item.relativePath,
          hash: item.hash,
          vec: vecs[i] || []
        }));
        
        finalChunks.push(...fileChunks);
        filesEmbeddedCount++;
        console.log(`-> Thành công sinh vector cho ${annotatedChunks.length} chunks.`);
        
        // Sleep 20s giữa các file để tránh rate limits (RPM) — 2s trước đây quá ngắn, hay dính 429
        await sleep(20000);
      } else {
        console.error(`❌ Lỗi: Không thể sinh vector cho file: ${item.relativePath}. Dừng sinh vector mới để lưu tiến trình.`);
        hitLimit = true;
        // Phục hồi từ cache cũ để không bị mất dữ liệu
        if (cacheMap[item.relativePath]) {
          finalChunks.push(...cacheMap[item.relativePath].chunks);
          console.log(`- Đã giữ lại chỉ mục cũ của: ${item.relativePath}`);
        }
      }
    }

    console.log(`\nTổng kết: Giữ nguyên ${filesSkipped} files. Đã sinh vector mới cho ${filesEmbeddedCount} files. Các file còn lại được giữ nguyên hoặc bỏ qua.`);

    // Dọn near-dup TRƯỚC KHI lưu: sync tool trước đây không hề dedup (khác buildIndex() của web admin),
    // nên các file trùng nội dung dưới nhiều đường dẫn khác nhau (vd cùng nội dung ở 2 vị trí cũ/mới)
    // vẫn lọt vào index gây lãng phí context + trả lời không nhất quán.
    const dedupedChunks = dedupeNearDuplicates(finalChunks);

    const index = { chunks: dedupedChunks, builtAt: new Date().toISOString() };

    // 5. Lưu index.json tạm thời
    const tempIndexPath = path.join(__dirname, 'index_temp.json');
    fs.writeFileSync(tempIndexPath, JSON.stringify(index), 'utf-8');
    console.log("5. Đã lưu index tạm thời.");

    // 6. Chuyển nhánh git đẩy index.json lên GitHub
    console.log("6. Đang chuyển sang nhánh chatbot-logs...");
    execSync('git checkout -f chatbot-logs');
    try { execSync('git pull origin chatbot-logs'); } catch {}

    const destIndexPath = path.join(__dirname, 'index.json');
    fs.copyFileSync(tempIndexPath, destIndexPath);
    fs.unlinkSync(tempIndexPath); // Xóa file tạm
    console.log("7. Đã copy index.json vào nhánh chatbot-logs.");

    console.log("8. Đang push index.json lên GitHub...");
    execSync('git add index.json');
    try {
      execSync('git commit -m "Update index.json via local OneDrive incremental reindex script (partial/full)"');
      execSync('git push origin chatbot-logs');
      console.log("Đã cập nhật chỉ mục (index.json) thành công!");
    } catch (e) {
      console.log("Không có thay đổi chỉ mục nào cần commit.");
    }

    // 9. Trở lại main (data/ và public/images/ đã được push từ bước 2c ở trên rồi, không push lại)
    console.log("9. Đang trở về nhánh main...");
    execSync('git checkout -f main');

    if (hitLimit) {
      console.log("\n⚠️ LƯU Ý: Quá trình đồng bộ chưa hoàn thành 100% do giới hạn hạn mức (rate limit) của API. Hãy chạy lại file BAT sau vài phút để tiếp tục đồng bộ phần còn lại.");
    } else {
      console.log("\n🚀 HOÀN THÀNH: Tất cả dữ liệu đã được đồng bộ & RAG index đã hoạt động hoàn hảo!");
    }
  } catch (e) {
    console.error("Lỗi thực thi:", e);
    try {
      execSync('git checkout -f main');
    } catch {}
    process.exit(1);
  }
}

main();
