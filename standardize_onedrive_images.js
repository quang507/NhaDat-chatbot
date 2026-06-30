const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const TARGET_DIR = 'C:\\Users\\QuangLêBáDuy\\OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBot, LiveSlide\\ChatBotImages_Upload';

// List of exact correct file names that MUST keep their PNG extension to avoid breaking code mapping
const KEEP_PNG_FILENAMES = [
  'cosmo-gen-2_bep', 'cosmo-gen-2_gara', 'cosmo-gen-2_phong-khach', 'cosmo-gen-2_ngu-master',
  'cosmo-gen-2_phong-ngu-2', 'cosmo-gen-2_phong-ngu-3', 'cosmo-gen-2_tang-2', 'cosmo-gen-2_wc',
  'cosmo-gen-2_phong-ngu-con-2', 'cosmo-gen-2_phong-ngu-con-3', 'cosmo-gen-2_tang-2-phong-ngu-ong-ba-1',
  'fusion-gen-5_gara', 'fusion-gen-5_phong-khach', 'fusion-gen-5_master-bedroom', 'fusion-gen-5_phong-hoc',
  'fusion-gen-5_phong-ngu-con', 'fusion-gen-5_tang-2', 'fusion-gen-5_tang-3',
  'nyah-phu-dinh_phoi-canh-garage', 'nyah-phu-dinh_phoi-canh-phong-khach', 'nyah-phu-dinh_phoi-canh-wc',
  'nyah-phu-dinh_cong-vien'
];

// Helper to remove Vietnamese diacritics
function removeVietnameseTones(str) {
  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  str = str.replace(/đ/g, "d").replace(/Đ/g, "d");
  return str;
}

// Standardize string name
function standardizeName(fileNameWithoutExt) {
  let name = removeVietnameseTones(fileNameWithoutExt).toLowerCase();
  
  // Replace non-alphanumeric chars (except underscores/dashes) with dashes
  name = name.replace(/[^a-z0-9_-]/g, '-');
  
  // Replace consecutive underscores/dashes with a single one
  name = name.replace(/[-_]+/g, (match) => match.includes('_') ? '_' : '-');
  
  // Remove leading/trailing dashes/underscores
  name = name.replace(/^[-_]+|[-_]+$/g, '');
  
  return name;
}

async function processImage(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'].includes(ext)) {
      return;
    }

    const dirName = path.dirname(filePath);
    const baseName = path.basename(filePath, ext);
    
    // 1. Standardize name
    const stdName = standardizeName(baseName);
    
    // 2. Decide target extension
    let targetExt = '.jpg';
    if (ext === '.png') {
      const isKeepPng = KEEP_PNG_FILENAMES.includes(stdName) || stdName.includes('logo');
      targetExt = isKeepPng ? '.png' : '.jpg';
    }

    const targetFileName = stdName + targetExt;
    const targetFilePath = path.join(dirName, targetFileName);
    const tempPath = targetFilePath + '.tmp';

    // 3. Read metadata and check dimensions
    const metadata = await sharp(filePath).metadata();
    const maxW = 2048;
    const maxH = 2048;
    let width = metadata.width;
    let height = metadata.height;

    if (!width || !height) return;

    let needResize = false;
    if (width > maxW || height > maxH) {
      needResize = true;
      const ratioW = maxW / width;
      const ratioH = maxH / height;
      const scale = Math.min(ratioW, ratioH);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    let pipeline = sharp(filePath);
    if (needResize) {
      pipeline = pipeline.resize(width, height);
    }

    // 4. Compress to target format
    if (targetExt === '.jpg') {
      await pipeline.jpeg({ quality: 80, mozjpeg: true }).toFile(tempPath);
    } else if (targetExt === '.png') {
      await pipeline.png({ quality: 80, compressionLevel: 9 }).toFile(tempPath);
    }

    // Compare file sizes
    const oldSize = fs.statSync(filePath).size;
    const newSize = fs.statSync(tempPath).size;

    // Delete original file and rename temp file to target path
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    // In case the target file already exists (e.g. if we are renaming NPD_vi_tri.jpg to npd-vi-tri.jpg and npd-vi-tri.jpg already existed)
    if (fs.existsSync(targetFilePath)) {
      fs.unlinkSync(targetFilePath);
    }

    fs.renameSync(tempPath, targetFilePath);
    console.log(`[OK] Standardized: ${path.relative(TARGET_DIR, filePath)} -> ${targetFileName} (${(oldSize/1024/1024).toFixed(2)}MB -> ${(newSize/1024).toFixed(1)}KB)`);

  } catch (err) {
    console.error(`[Error] Failed to process ${path.relative(TARGET_DIR, filePath)}:`, err.message);
  }
}

async function walkDir(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    let isDir = false;
    try { isDir = fs.statSync(full).isDirectory(); } catch {}
    if (isDir) {
      await walkDir(full);
    } else {
      // Skip markdown and gitkeep files
      if (entry.endsWith('.md') || entry.startsWith('.') || entry === 'Thumbs.db') continue;
      await processImage(full);
    }
  }
}

async function main() {
  console.log("=== BẮT ĐẦU CHUẨN HÓA TÊN VÀ NÉN ẢNH ONEDRIVE ===");
  console.log(`Thư mục quét: ${TARGET_DIR}`);
  if (!fs.existsSync(TARGET_DIR)) {
    console.error("Lỗi: Không tìm thấy thư mục OneDrive!");
    return;
  }
  await walkDir(TARGET_DIR);
  console.log("=== CHUẨN HÓA VÀ NÉN ẢNH HOÀN THÀNH ===");
}

main();
