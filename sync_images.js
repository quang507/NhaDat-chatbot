const fs = require('fs');
const path = require('path');

const DEFAULT_ONEDRIVE = path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'OneDrive - Nha Dat Co Ltd\\Team Mktg - NPD mktg\\mktg - private\\03_Content\\ChatBot, LiveSlide');
const ONEDRIVE_IMAGES_DIR = process.env.CHATBOT_IMAGES_DIR || path.join(DEFAULT_ONEDRIVE, 'ChatBotImages_Upload');
const LOCAL_IMAGES_DIR = path.join(__dirname, 'public', 'images');
const LOCAL_DATA_DIR = path.join(__dirname, 'data');
const LOCAL_IMAGES_METADATA_FILE = path.join(LOCAL_DATA_DIR, 'generated_images_metadata.md');
const VISUALS_CATALOG_FILE = path.join(__dirname, 'lib', 'visuals_catalog.ts');

const TAG_DICTIONARY = {
  'bep': ['bếp', 'nhà ăn', 'nấu ăn', 'phòng ăn', 'nấu nướng', 'tủ lạnh', 'chén bát', 'bếp núc'],
  'gara': ['gara', 'ô tô', 'đỗ xe', 'đậu xe', 'xe hơi', 'đỗ con', 'để xe', 'mẹc', 'oto', 's600', 'mercedes', 'bmw', 'audi'],
  'phong-khach': ['phòng khách', 'sofa', 'tiếp khách', 'sinh hoạt', 'sinh hoạt chung'],
  'ngu-master': ['phòng ngủ', 'giường', 'master', 'ngủ con', 'phòng ngủ master', 'ngủ master', 'master bedroom', 'phòng ngủ ba mẹ', 'phòng ngủ vợ chồng', 'giường đôi'],
  'master-bedroom': ['phòng ngủ', 'giường', 'master', 'ngủ con', 'phòng ngủ master', 'ngủ master', 'master bedroom', 'phòng ngủ ba mẹ', 'phòng ngủ vợ chồng', 'giường đôi'],
  'phong-ngu': ['phòng ngủ', 'giường', 'master', 'ngủ con', 'ngủ nhỏ', 'ngủ phụ', 'con nít', 'trẻ em'],
  'wc': ['wc', 'toilet', 'vệ sinh', 'tắm', 'phòng tắm', 'lavabo', 'nhà vệ sinh', 'bồn tắm'],
  'vi_tri': ['vị trí', 'bản đồ', 'ở đâu', 'chỗ nào', 'võ văn kiệt', 'quận 8', 'trương đình hội', 'nguyễn văn linh', 'địa chỉ', 'đường đi', 'di chuyển', 'maps', 'an dương vương'],
  'ban_do': ['vị trí', 'bản đồ', 'ở đâu', 'chỗ nào', 'võ văn kiệt', 'quận 8', 'trương đình hội', 'nguyễn văn linh', 'địa chỉ', 'đường đi', 'di chuyển', 'maps', 'an dương vương'],
  'cong_vien': ['tiện ích', 'công viên', 'hồ bơi', 'bể bơi', 'sân thể thao', 'cầu lông', 'bóng rổ', 'sân chơi', 'landmark', 'tiện nghi', 'ban công', 'sân thượng', 'vườn', 'xanh', 'con nít', 'trẻ em', 'đứa nhỏ', 'chạy nhảy', 'xích đu', 'cầu trượt', 'vui chơi'],
  'tien_ich': ['tiện ích', 'công viên', 'hồ bơi', 'bể bơi', 'sân thể thao', 'cầu lông', 'bóng rổ', 'sân chơi', 'landmark', 'tiện nghi', 'ban công', 'sân thượng', 'vườn', 'xanh', 'con nít', 'trẻ em', 'đứa nhỏ', 'chạy nhảy', 'xích đu', 'cầu trượt', 'vui chơi'],
  'mat_bang': ['mặt bằng', 'mẫu nhà', 'thiết kế nhà', 'phối cảnh', 'toàn cảnh', 'ngoại thất', 'thiết kế', 'bố cục', 'phân lô'],
  'layout': ['mặt bằng', 'mẫu nhà', 'thiết kế nhà', 'phối cảnh', 'toàn cảnh', 'ngoại thất', 'thiết kế', 'bố cục', 'phân lô'],
  'gia_ban': ['giá bán', 'giá', 'bao nhiêu tỷ', 'mấy tỷ'],
  'phap_ly': ['pháp lý', 'sổ hồng', 'giấy phép', 'sở hữu'],
  'chinh_sach': ['thanh toán', 'chiết khấu', 'chính sách', 'hợp đồng', 'cam kết'],
  'thanh_toan': ['thanh toán', 'chiết khấu', 'chính sách', 'hợp đồng', 'cam kết']
};

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
      if (name.startsWith('.') || name.startsWith('~') || name === 'Thumbs.db' || name.endsWith('.bat')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
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

  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let isDir = false;
      try { isDir = fs.statSync(full).isDirectory(); } catch {}
      if (isDir) { walk(full); continue; }

      const ext = path.extname(name).toLowerCase();
      if (!imageExtensions.includes(ext)) continue;

      const rel = path.relative(imagesDir, full).replace(/\\/g, '/');
      const baseName = path.basename(name, ext);
      const parts = baseName.split('_');
      const cleanParts = parts.map(p => p.replace(/-/g, ' ').trim());
      const title = cleanParts[cleanParts.length - 1];
      const folderKw = path.dirname(rel) !== '.' ? path.dirname(rel).replace(/[\/_-]/g, ' ').trim() + ', ' : '';
      const keywords = folderKw + cleanParts.join(', ');
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

// ---------- Tự động tạo file visuals_catalog.ts ----------
function buildVisualsCatalog(imagesDir, catalogOutputPath) {
  if (!fs.existsSync(imagesDir)) return;

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  const catalog = [];

  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let isDir = false;
      try { isDir = fs.statSync(full).isDirectory(); } catch {}
      if (isDir) { walk(full); continue; }

      const ext = path.extname(name).toLowerCase();
      if (!imageExtensions.includes(ext)) continue;

      const rel = path.relative(imagesDir, full).replace(/\\/g, '/');
      const baseName = path.basename(name, ext).toLowerCase();
      const lowerRel = rel.toLowerCase();

      // 1. Phân loại model dựa trên đường dẫn
      let models = ['all'];
      if (lowerRel.includes('cosmo_gen_2')) {
        models = ['cosmo_gen_2'];
      } else if (lowerRel.includes('fusion_gen_5')) {
        models = ['fusion_gen_5'];
      } else if (lowerRel.includes('opus')) {
        models = ['opus'];
      } else if (lowerRel.includes('signature_by_codinachs')) {
        models = ['signature'];
      }

      // 2. Trích xuất tags thông minh
      const tagsSet = new Set();
      
      // Tách các từ trong tên file và thư mục
      const pathParts = rel.replace(/\//g, '_').split('_');
      pathParts.forEach(part => {
        const cleanPart = part.replace(/-/g, ' ').replace(ext, '').trim().toLowerCase();
        if (cleanPart) {
          tagsSet.add(cleanPart);
          // Chia nhỏ thành các từ đơn
          cleanPart.split(' ').forEach(w => {
            if (w.length > 1) tagsSet.add(w);
          });
        }
      });

      // Đối chiếu từ điển tag
      Object.keys(TAG_DICTIONARY).forEach(key => {
        if (baseName.includes(key) || lowerRel.includes(key)) {
          TAG_DICTIONARY[key].forEach(tag => tagsSet.add(tag));
        }
      });

      // Quy tắc đặc biệt: Với Fusion Gen 5, tang-2 chính là khu Bếp
      if (models.includes('fusion_gen_5') && baseName.includes('tang-2')) {
        TAG_DICTIONARY['bep'].forEach(tag => tagsSet.add(tag));
      }

      const tags = Array.from(tagsSet).filter(t => t && t.length > 1);

      catalog.push({
        url: `/images/${rel}`,
        tags,
        models
      });
    }
  };
  walk(imagesDir);

  const fileContent = `// File này được tự động sinh bởi sync_images.js. Không chỉnh sửa trực tiếp.
export const IMAGE_CATALOG = ${JSON.stringify(catalog, null, 2)};
`;

  fs.writeFileSync(catalogOutputPath, fileContent, 'utf-8');
  console.log(`Đã tự động tạo danh mục visuals_catalog.ts gồm ${catalog.length} ảnh!`);
}

function main() {
  console.log("=== BẮT ĐẦU ĐỒNG BỘ ẢNH NHANH ===");
  console.log(`Nguồn OneDrive: ${ONEDRIVE_IMAGES_DIR}`);
  console.log(`Đích Local: ${LOCAL_IMAGES_DIR}`);

  if (!fs.existsSync(ONEDRIVE_IMAGES_DIR)) {
    console.error(`Lỗi: Không tìm thấy thư mục ảnh OneDrive: ${ONEDRIVE_IMAGES_DIR}`);
    process.exit(1);
  }

  const srcEntries = fs.readdirSync(ONEDRIVE_IMAGES_DIR);
  if (srcEntries.length === 0) {
    console.error('Lỗi: Thư mục ảnh nguồn OneDrive đang trống. Dừng để tránh xóa nhầm.');
    process.exit(1);
  }

  // Xóa và copy
  if (fs.existsSync(LOCAL_IMAGES_DIR)) {
    fs.rmSync(LOCAL_IMAGES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(LOCAL_IMAGES_DIR, { recursive: true });
  copyDir(ONEDRIVE_IMAGES_DIR, LOCAL_IMAGES_DIR);
  console.log("Đồng bộ hình ảnh từ OneDrive vào public/images thành công!");

  // Sinh metadata
  generateImageMetadata(LOCAL_IMAGES_DIR, LOCAL_IMAGES_METADATA_FILE);

  // Sinh visuals_catalog.ts
  buildVisualsCatalog(LOCAL_IMAGES_DIR, VISUALS_CATALOG_FILE);

  console.log("=== ĐỒNG BỘ ẢNH NHANH HOÀN THÀNH ===");
}

main();
