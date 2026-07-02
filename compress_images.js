const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const targetDir = 'C:\\Users\\QuangLêBáDuy\\OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBot, LiveSlide\\ChatBotImages_Upload';

async function compressImage(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return;
    }

    const tempPath = filePath + '.tmp';
    
    // Đọc thông tin kích thước ảnh
    const image = sharp(filePath);
    const metadata = await image.metadata();

    const maxW = 2560;
    const maxH = 1440;

    let width = metadata.width;
    let height = metadata.height;

    if (!width || !height) return;

    let needResize = false;
    // Tính toán tỉ lệ co để không làm méo ảnh
    if (width > maxW || height > maxH) {
      needResize = true;
      const ratioW = maxW / width;
      const ratioH = maxH / height;
      const scale = Math.min(ratioW, ratioH);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    // Luôn resize nếu ảnh quá lớn hoặc nén chất lượng với chất lượng 80% (giảm dung lượng file)
    let pipeline = sharp(filePath);
    if (needResize) {
      pipeline = pipeline.resize(width, height);
    }

    if (ext === '.jpg' || ext === '.jpeg') {
      await pipeline.jpeg({ quality: 80 }).toFile(tempPath);
    } else if (ext === '.png') {
      await pipeline.png({ quality: 80, compressionLevel: 9 }).toFile(tempPath);
    } else if (ext === '.webp') {
      await pipeline.webp({ quality: 80 }).toFile(tempPath);
    } else {
      return;
    }

    // So sánh dung lượng file mới và cũ, chỉ thay thế khi dung lượng nhỏ hơn
    const oldSize = fs.statSync(filePath).size;
    const newSize = fs.statSync(tempPath).size;

    if (newSize < oldSize) {
      fs.unlinkSync(filePath);
      fs.renameSync(tempPath, filePath);
      console.log(`[OK] Compressed: ${path.basename(filePath)} (${(oldSize/1024).toFixed(1)}KB -> ${(newSize/1024).toFixed(1)}KB)`);
    } else {
      fs.unlinkSync(tempPath);
      console.log(`[Skip] Already optimized: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.error(`[Error] Failed to process ${filePath}:`, err.message);
  }
}

function processDirectory(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Thư mục không tồn tại: ${dir}`);
    return [];
  }
  
  let files = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files = files.concat(processDirectory(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  console.log('--- ĐANG QUÉT VÀ NÉN ẢNH ĐỆ QUY ---');
  console.log(`Thư mục đích: ${targetDir}`);
  
  const allFiles = processDirectory(targetDir);
  console.log(`Tìm thấy tổng cộng ${allFiles.length} tệp tin.`);
  
  let count = 0;
  for (const file of allFiles) {
    await compressImage(file);
    count++;
  }
  
  console.log(`--- HOÀN THÀNH XỬ LÝ ${count} FILE ---`);
}

main();
