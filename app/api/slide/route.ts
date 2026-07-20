import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { loadIndex, retrieve } from '@/lib/rag';
import { detectUnit, unitContext, imageFamily, getGeneralUnsoldContext } from '@/lib/units';
import { hasProjectKeyword, isCompetitor, COMPETITORS } from '@/lib/intent';
import {
  matchStaticSlide,
  ROOM_SLIDES, TOPIC_SLIDES, MODEL_INTRO, MODEL_INTRO_NYAH, MODEL_INTRO_KEYWORDS,
} from '@/lib/static_slides';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Chọn thư mục ảnh theo họ mẫu nhà của 1 căn (1 nguồn: lib/units). Chỉ có 3 bộ ảnh.
// office->opus, cashmere/signature->cosmo (tạm) — xử lý trong imageFamily().
function imageModelForUnit(n: number): 'opus' | 'fusion_gen_5' | 'cosmo_gen_2' {
  return imageFamily(n);
}
// Công năng từng tầng THẬT (theo datasheet + data.md). Dùng cho slide tĩnh khi khách
// hỏi "tầng X" — tránh để LLM bịa số liệu. Cosmo/Fusion là nhà ở đa thế hệ (tầng 2 = ông bà),
// Opus là nhà phố thương mại (tầng dưới kinh doanh/văn phòng).
type FloorInfo = { name: string; points: string[]; speech: string; img?: string };
const FLOOR_FUNCTIONS: Record<'cosmo_gen_2' | 'fusion_gen_5' | 'opus', Record<number, FloorInfo>> = {
  cosmo_gen_2: {
    1: { name: 'Garage & Phòng khách', points: ['Garage ô tô trong nhà, cách âm cách nhiệt', 'Phòng khách thông tầng siêu sáng', 'Sảnh đón riêng trang trọng'], speech: 'Tầng trệt Cosmo gồm garage ô tô trong nhà và phòng khách thông tầng siêu sáng.' },
    2: { name: 'Phòng ông bà', points: ['Tầng dành riêng cho ông bà', 'Phòng ngủ en-suite có sảnh riêng', 'Gần bếp và trệt, đi lại nhẹ nhàng'], speech: 'Tầng 2 mẫu Cosmo dành riêng cho ông bà, là phòng ngủ en-suite có sảnh riêng, gần bếp và tầng trệt nên đi lại rất nhẹ nhàng.', img: '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_tang-2-phong-ngu-ong-ba-1.png' },
    3: { name: 'Bếp, Bar & Phòng ăn', points: ['Bếp đảo đa năng như quầy bar', 'Phòng ăn có view thiên nhiên', 'Tiện lợi nhờ giặt sấy tại bếp'], speech: 'Tầng 3 là không gian bếp đảo đa năng kết hợp quầy bar và phòng ăn có view thiên nhiên.' },
    4: { name: 'Phòng ngủ Master', points: ['Phòng master chuẩn villa', 'Walk-in closet rộng', 'Phòng tắm 5 sao'], speech: 'Tầng 4 là phòng ngủ master đẳng cấp villa với walk-in closet và phòng tắm 5 sao.' },
    5: { name: 'Phòng ngủ con', points: ['Hai phòng ngủ cho con cái', 'Đón sáng từ giếng trời', 'Phòng tắm riêng tiện nghi'], speech: 'Tầng 5 gồm hai phòng ngủ cho con cái, đón sáng tự nhiên từ giếng trời.' },
    6: { name: 'Sân thượng', points: ['Sân thượng thoáng đãng', 'Thang máy lên tận nơi', 'Không gian thư giãn, trồng cây'], speech: 'Trên cùng là sân thượng thoáng đãng, có thang máy lên tận nơi để thư giãn và trồng cây.' },
  },
  fusion_gen_5: {
    1: { name: 'Garage & Phòng khách', points: ['Garage ô tô trong nhà', 'Phòng khách thông tầng', 'Lối vào thông thoáng'], speech: 'Tầng trệt Fusion gồm garage ô tô và phòng khách thông tầng thoáng đãng.' },
    2: { name: 'Phòng ông bà', points: ['Tầng dành riêng cho ông bà', 'Phòng ngủ en-suite ấm cúng', 'Kết nối gần bếp và trệt'], speech: 'Tầng 2 mẫu Fusion dành cho ông bà, là phòng ngủ riêng tư, gần bếp và trệt để đi lại thuận tiện.' },
    3: { name: 'Bếp & Phòng ăn', points: ['Bếp thiết kế mở hiện đại', 'Phòng ăn rộng cho gia đình', 'Ban công đón gió'], speech: 'Tầng 3 mẫu Fusion là khu bếp và phòng ăn thiết kế mở, rộng rãi cho gia đình.' },
    4: { name: 'Phòng ngủ Master', points: ['Phòng master ấm cúng', 'Tích hợp phòng thay đồ', 'Nhà vệ sinh riêng'], speech: 'Tầng 4 là phòng ngủ master ấm áp, tích hợp phòng thay đồ và nhà vệ sinh riêng.' },
    5: { name: 'Phòng ngủ con & Sân thượng', points: ['Phòng ngủ con tiện nghi', 'Sân thượng đón gió', 'Đón sáng tự nhiên'], speech: 'Tầng trên cùng mẫu Fusion gồm phòng ngủ con và sân thượng đón gió thoáng mát.' },
  },
  opus: {
    1: { name: 'Mặt bằng kinh doanh', points: ['Mặt tiền lớn cho kinh doanh', 'Phù hợp showroom, văn phòng', 'Lối đi riêng tiện lợi'], speech: 'Tầng trệt mẫu Opus có mặt tiền lớn, lý tưởng cho kinh doanh, showroom hoặc văn phòng.' },
    2: { name: 'Phòng kinh doanh', points: ['Tầng 2 bố trí cho kinh doanh', 'Linh hoạt làm văn phòng', 'Phù hợp vừa ở vừa làm việc'], speech: 'Tầng 2 mẫu Opus được bố trí cho kinh doanh hoặc văn phòng, phù hợp nhu cầu vừa ở vừa làm việc.' },
    3: { name: 'Không gian sinh hoạt', points: ['Khu vực sinh hoạt gia đình', 'Bếp và phòng ăn tiện nghi', 'Tách biệt khu kinh doanh'], speech: 'Tầng 3 mẫu Opus là không gian sinh hoạt gia đình, tách biệt khỏi khu kinh doanh bên dưới.' },
    4: { name: 'Phòng ngủ', points: ['Các phòng ngủ riêng tư', 'Thiết kế thoáng đãng', 'Đón sáng tự nhiên'], speech: 'Tầng 4 mẫu Opus bố trí các phòng ngủ riêng tư, thoáng đãng cho gia đình.' },
  },
};

// Công năng tầng CHUNG khi khách chỉ nói "tầng X" mà KHÔNG kèm mẫu nhà.
// Phân biệt rõ: Cosmo/Fusion (nhà ở đa thế hệ) vs Opus (nhà phố thương mại).
const FLOOR_GENERAL: Record<number, FloorInfo> = {
  1: { name: 'Tầng trệt', points: ['Cosmo & Fusion: garage và phòng khách', 'Opus: mặt bằng kinh doanh, showroom', 'Mặt tiền thoáng, lối vào riêng'], speech: 'Tầng trệt: với Cosmo và Fusion là garage và phòng khách; với nhà phố Opus là mặt bằng kinh doanh hoặc showroom.' },
  2: { name: 'Tầng 2', points: ['Cosmo & Fusion: phòng ngủ ông bà', 'Opus: phòng kinh doanh, văn phòng', 'Bố trí theo nhu cầu từng mẫu'], speech: 'Tầng 2 thì tùy mẫu nhà: với Cosmo và Fusion là phòng dành cho ông bà; còn với nhà phố Opus thì là phòng để kinh doanh hoặc làm văn phòng.', img: '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_tang-2-phong-ngu-ong-ba-1.png' },
  3: { name: 'Tầng 3', points: ['Cosmo & Fusion: bếp, phòng ăn', 'Opus: không gian sinh hoạt', 'Khu vực sinh hoạt chung của gia đình'], speech: 'Tầng 3 thường là khu bếp và phòng ăn với Cosmo, Fusion; còn Opus là không gian sinh hoạt gia đình.' },
  4: { name: 'Tầng 4', points: ['Phòng ngủ master đẳng cấp', 'Walk-in closet và phòng tắm riêng', 'Không gian nghỉ ngơi riêng tư'], speech: 'Tầng 4 thường là phòng ngủ master với walk-in closet và phòng tắm riêng.' },
  5: { name: 'Tầng 5', points: ['Phòng ngủ cho con cái', 'Đón sáng từ giếng trời', 'Phòng tắm riêng tiện nghi'], speech: 'Tầng 5 là các phòng ngủ cho con cái, đón sáng tự nhiên từ giếng trời.' },
  6: { name: 'Sân thượng', points: ['Sân thượng thoáng đãng', 'Thang máy lên tận nơi', 'Thư giãn, trồng cây, phơi đồ'], speech: 'Trên cùng là sân thượng thoáng đãng, có thang máy lên tận nơi để thư giãn và trồng cây.' },
};

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const IMAGES_ROOT = path.join(process.cwd(), 'public', 'images', '01_NyAh-PhuDinh');

// Đọc ảnh trong 1 thư mục (không đệ quy), lọc theo đuôi file + từ khóa tùy chọn.
// filesOnly=true: bỏ qua thư mục con (dùng cho "ảnh gốc" của 1 model/dự án).
function listImages(absDir: string, urlPrefix: string, opts: { fileKeyword?: string; filesOnly?: boolean } = {}): string[] {
  try {
    if (!existsSync(absDir)) return [];
    const entries = readdirSync(absDir, { withFileTypes: true });
    let names = opts.filesOnly ? entries.filter(e => !e.isDirectory()).map(e => e.name) : entries.map(e => e.name);
    names = names.filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()));
    if (opts.fileKeyword) names = names.filter(f => f.toLowerCase().includes(opts.fileKeyword!));
    return names.map(f => `${urlPrefix}/${f}`);
  } catch (e) {
    console.error(`Lỗi đọc thư mục ảnh ${absDir}:`, e);
    return [];
  }
}

// Ưu tiên thư mục riêng của model; nếu rỗng thì rớt về thư mục chung (shared) của không gian đó.
// Nếu ko tìm thấy ảnh với keyword, rớt về toàn bộ ảnh của space (bỏ keyword).
function getImagesForSpace(model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' | null, spaceName: string, fileKeyword?: string): string[] {
  if (model) {
    const specific = listImages(
      path.join(IMAGES_ROOT, 'noi_that', model, spaceName),
      `/images/01_NyAh-PhuDinh/noi_that/${model}/${spaceName}`,
      { fileKeyword }
    );
    if (specific.length > 0) return specific;
  }
  const general = listImages(
    path.join(IMAGES_ROOT, 'noi_that', spaceName),
    `/images/01_NyAh-PhuDinh/noi_that/${spaceName}`,
    { fileKeyword }
  );
  if (general.length > 0) return general;
  // Fallback: nếu ko có ảnh với keyword, lấy tất cả ảnh của space
  return listImages(
    path.join(IMAGES_ROOT, 'noi_that', spaceName),
    `/images/01_NyAh-PhuDinh/noi_that/${spaceName}`
  );
}

// Gom ảnh của 1 không gian (vd "bep") từ CẢ 3 model + thư mục chung — dùng khi chưa rõ model.
// Nếu ko tìm thấy ảnh với keyword, fallback lấy toàn bộ ảnh của space.
function getGeneralImagesForSpace(spaceName: string, fileKeyword?: string): string[] {
  const models: Array<'cosmo_gen_2' | 'fusion_gen_5' | 'opus'> = ['cosmo_gen_2', 'fusion_gen_5', 'opus'];
  const allImgs = models.flatMap(m => listImages(
    path.join(IMAGES_ROOT, 'noi_that', m, spaceName),
    `/images/01_NyAh-PhuDinh/noi_that/${m}/${spaceName}`,
    { fileKeyword }
  ));
  allImgs.push(...listImages(
    path.join(IMAGES_ROOT, 'noi_that', spaceName),
    `/images/01_NyAh-PhuDinh/noi_that/${spaceName}`,
    { fileKeyword }
  ));
  // Fallback: nếu ko có ảnh với keyword, lấy tất cả ảnh của space từ tất cả model
  if (allImgs.length === 0) {
    allImgs.push(...models.flatMap(m => listImages(
      path.join(IMAGES_ROOT, 'noi_that', m, spaceName),
      `/images/01_NyAh-PhuDinh/noi_that/${m}/${spaceName}`
    )));
    allImgs.push(...listImages(
      path.join(IMAGES_ROOT, 'noi_that', spaceName),
      `/images/01_NyAh-PhuDinh/noi_that/${spaceName}`
    ));
  }
  return allImgs;
}

// Lấy ẢNH GỐC (root) của 1 model — KHÔNG lấy trong các thư mục con (bep, gara, phong_khach...).
// Dùng khi hỏi chung chung "cosmo gen 2" mà không chỉ rõ phòng nào.
// Lấy ảnh từ các subfolder chính: bep, gara, phong_khach, phong_ngu, etc.
function getRootImagesForModel(model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus'): string[] {
  const spaces = ['bep', 'gara', 'phong_khach', 'phong_ngu', 'wc', 'tang-2'];
  const allImgs: string[] = [];
  for (const space of spaces) {
    const imgs = listImages(
      path.join(IMAGES_ROOT, 'noi_that', model, space),
      `/images/01_NyAh-PhuDinh/noi_that/${model}/${space}`,
      { filesOnly: true }
    );
    allImgs.push(...imgs);
    if (allImgs.length >= 6) break;
  }
  return allImgs;
}

// Lấy ẢNH GỐC (root) của toàn dự án (không thuộc model nào cụ thể).
function getRootImagesForProject(): string[] {
  const rootFiles = listImages(IMAGES_ROOT, '/images/01_NyAh-PhuDinh', { filesOnly: true });
  // Trả về ngẫu nhiên 3 tấm nếu có nhiều
  return rootFiles.length > 3 ? rootFiles.sort(() => 0.5 - Math.random()).slice(0, 3) : rootFiles;
}

// ── DỰNG SLIDE TĨNH TỪ CATALOG (lib/static_slides.ts) ────────────────────────
// Dữ liệu slide (title/points/speech/ảnh) nằm trong catalog; ở đây chỉ ráp lại +
// lấy ảnh chung theo thư mục cho biến thể 'nyah' (không rõ mẫu nhà).
type SlideModel = 'cosmo_gen_2' | 'fusion_gen_5' | 'opus';

function roomSlide(key: 'bep' | 'gara' | 'phong_khach' | 'phong_ngu', model: SlideModel | null): any {
  const v = ROOM_SLIDES[key].variants[model ?? 'nyah'];
  return {
    layout_type: 'split_image_right',
    title: v.title,
    points: v.points,
    speech_text: v.speech_text,
    image_urls: v.image_urls ? [...v.image_urls] : getGeneralImagesForSpace(v.imageSpace!),
  };
}

function topicSlide(key: keyof typeof TOPIC_SLIDES): any {
  const t = TOPIC_SLIDES[key];
  const s: any = { layout_type: 'split_image_right', title: t.title, points: t.points, speech_text: t.speech_text, image_urls: [...t.image_urls] };
  if (t.maps_url) s.maps_url = t.maps_url;
  return s;
}

// Slide "mẫu nhà" (nhánh has('mẫu nhà')): text theo mẫu + ảnh giới thiệu cố định.
function modelIntroSlide(model: SlideModel | null): any {
  if (model) {
    const i = MODEL_INTRO[model];
    return { layout_type: 'split_image_right', title: i.title, points: i.points, speech_text: i.speech_text, image_urls: [...i.introImages] };
  }
  const n = MODEL_INTRO_NYAH;
  return { layout_type: 'split_image_right', title: n.title, points: n.points, speech_text: n.speech_text, image_urls: [...(n.image_urls || [])] };
}

const SOURCE_RULE = `\n\nNGUYÊN TẮC DỮ LIỆU CHO SLIDE BOT (DYNAMIC LAYOUT):
- CHỈ trả lời dựa trên phần "DỮ LIỆU LIÊN QUAN". Không bịa thêm thông tin.
- Nếu câu hỏi KHÔNG có thông tin liên quan trong phần dữ liệu để trả lời -> BẮT BUỘC trả về {"skip": true} và để trống tất cả các trường khác.
- BẮT BUỘC TOÀN BỘ CÂU TRẢ LỜI (Title, Points, Speech_text) PHẢI BẰNG TIẾNG VIỆT (VIETNAMESE).
- Đóng vai trò là Giám đốc Nghệ thuật (Art Director), bạn phải tự quyết định layout nào phù hợp nhất với nội dung.
- Bạn PHẢI trả về ĐÚNG chuẩn JSON với cấu trúc sau, KHÔNG thêm markdown \`\`\`json:
{
  "skip": true_nếu_không_có_thông_tin_dữ_liệu_dự_án_để_trả_lời,
  "layout_type": "Loại bố cục (chỉ chọn 1 trong 5: 'split_image_right', 'split_image_left', 'full_background', 'dark_minimal', 'text_only')",
  "title": "Tiêu đề ngắn gọn, ấn tượng (Tối đa 10 chữ)",
  "points": ["Ý chính 1 (Là một CÂU TRẢ LỜI NGẮN GỌN súc tích, đủ ý, ~10-20 chữ. KHÔNG dùng dạng gạch đầu dòng/đầu mục cụt lủn)", "Ý chính 2", "Ý chính 3"],
  "highlight_number": "Một con số nổi bật nhất trong đoạn văn (ví dụ '18 phút', '9,5 triệu lít', '5,19 tỷ'). Nếu không có số liệu nào ấn tượng, để trống ''. Chỉ dùng cho layout dark_minimal hoặc split.",
  "speech_text": "Câu trả lời NGẮN GỌN để HIỂN THỊ trên slide (KHÔNG đọc ra tiếng). Tối đa 1-2 câu, súc tích, đi thẳng trọng tâm. KHÔNG emoji, KHÔNG ký tự đặc biệt (*, _, #), KHÔNG ngoặc kép.",
  "image_urls": ["Đường dẫn ảnh 1", "Đường dẫn ảnh 2", ...] (Mảng chứa các đường dẫn hình ảnh tìm thấy trong phần dữ liệu liên quan. CHỈ được chọn các đường dẫn bắt đầu bằng "/images/" như "/images/01_NyAh-PhuDinh/...", TUYỆT ĐỐI KHÔNG lấy các đường dẫn bắt đầu bằng "2 - trình chiếu" hoặc các file PowerPoint local. Nếu không có ảnh nào bắt đầu bằng "/images/", trả về mảng rỗng []).
}

SỐ LƯỢNG Ý CHÍNH: Đưa ra tối đa 3-4 ý ("points") để slide thoáng. MỖI Ý PHẢI LÀ MỘT CÂU TRẢ LỜI NGẮN, mang thông tin giải thích (vd thay vì "Vị trí đắc địa", hãy viết "Dự án nằm ngay mặt tiền Trương Đình Hội, dễ dàng di chuyển").

VỀ LINK/URL/MÃ KEY: TUYỆT ĐỐI KHÔNG đưa đường link, URL hay mã key nào vào title/points/speech_text (đặc biệt link album Google Photos/Drive kèm "key=..."). Khi dữ liệu có link album/tài liệu, thay bằng: "Liên hệ tư vấn viên để nhận chi tiết". (Trường image_urls dạng "/images/..." thì vẫn dùng bình thường.)

CÁCH CHỌN LAYOUT_TYPE (HÃY ĐA DẠNG, đừng luôn chọn 1 kiểu — biến đổi theo nội dung):
- 'text_only': Nếu KHÔNG tìm thấy bất kỳ hình ảnh minh họa hoặc đường dẫn hình ảnh nào liên quan đến câu hỏi trong dữ liệu, hoặc nếu câu trả lời chỉ cần văn bản và số liệu.
- 'dark_minimal': Nếu nội dung thiên về 1 con số cụ thể cực kỳ ấn tượng (vd: 18 phút đến Q1, 9.5 triệu lít không khí) và có ít nhất 1 hình ảnh đi kèm. Yêu cầu bắt buộc phải có "highlight_number".
- 'full_background': Nếu đang miêu tả toàn cảnh, cảnh quan, không gian sống bao quát, sang trọng và có 1 hình ảnh chất lượng cao làm nền.
- 'split_image_right' / 'split_image_left': Nếu đang liệt kê nhiều ý chính, có từ 1 đến 3 hình ảnh minh hoạ cụ thể (Mặt bằng, thiết kế, danh sách tiện ích). Hãy xen kẽ trái phải để linh hoạt.`;

// hasProjectKeyword + isCompetitor + COMPETITORS được import từ @/lib/intent (single source of truth)

async function readRepoFile(name: string): Promise<string> {
  try { return await readFile(path.join(process.cwd(), name), 'utf-8'); } catch { return ''; }
}

let cachedPersona: string | null = null;
async function getPersona(): Promise<string> {
  if (cachedPersona) return cachedPersona;
  const p = (await readRepoFile('persona.md')).trim() || DEFAULT_PERSONA;
  cachedPersona = p;
  return p;
}

async function buildPrompt(message: string, ambient = false): Promise<{ prompt: string; hasChunks: boolean }> {
  const persona = await getPersona();

  // Khách hỏi 1 căn cụ thể -> nhét THÔNG TIN CHÍNH XÁC (mẫu nhà, diện tích, mặt tiền, tầng)
  let unitFacts = '';
  let ragQuery = message;
  try {
    const unit = detectUnit(message);
    if (unit) {
      const { facts, modelKeywords } = unitContext(unit);
      unitFacts = `\n\n=== ${facts} ===`;
      ragQuery = `${message} ${modelKeywords}`;
    } else {
      const qLower = message.toLowerCase();
      const isGeneralUnsold = /(chưa\s*bán|còn\s*trống|rổ\s*hàng|bảng\s*giá|giá\s*bán|giá\s*cả|còn\s*căn|còn\s*lô|còn\s*hàng)/i.test(qLower) || 
                              (/(căn|lô)\s*nào/i.test(qLower) && /giá/i.test(qLower)) ||
                              /giá\s*(bao\s*nhiêu|thế\s*nào|mấy)/i.test(qLower);
      if (isGeneralUnsold) {
        unitFacts = `\n\n${getGeneralUnsoldContext()}`;
      }
    }
  } catch (e) { console.warn('Slide unit lookup failed:', e); }

  try {
    const index = await loadIndex();
    if (index && index.chunks.length) {
      // Ambient: Lọc 2 tầng —
      //   Tầng 1 (nhanh, miễn phí): Kiểm tra keyword — nếu không có keyword dự án → SKIP ngay
      //   Tầng 2 (embedding): minScore=0.71 — nếu vector score thấp → SKIP
      // Lý do 2 tầng: score embedding có variance (~±0.02), keyword detection ổn định 100%
      if (ambient && !hasProjectKeyword(message)) {
        console.log(`[Slide] Ambient SKIP (no keyword): "${message.slice(0, 60)}"`);
        return { prompt: '', hasChunks: false };
      }
      // CHỈ nới cổng confidence khi khách nói RÕ số căn/lô (tín hiệu chắc chắn).
      // KHÔNG nới theo tên mẫu nhà (opus/cosmo/fusion) — STT rất hay nghe NHẦM ra các tên này
      // (xem VN_SPEECH_FIXES), làm cổng tin cậy bị tắt oan -> slide sai. Tên mẫu nhà vẫn qua ngưỡng RAG.
      const hasUnit = detectUnit(message) !== null;
      const minScore = (ambient && !hasUnit) ? 0.71 : 0;
      // Nghe ngầm: ít chunk hơn (6) -> prompt ngắn -> LLM trả NHANH hơn; chat trực tiếp giữ 10.
      const chunks = await retrieve(ragQuery, index, ambient ? 6 : 10, minScore);
      // Có facts của căn cụ thể -> luôn tạo slide kể cả khi RAG rỗng (đã có dữ liệu chính xác)
      if (chunks.length > 0 || unitFacts) {
        return {
          prompt: `${persona}${unitFacts}${SOURCE_RULE}\n\n=== DỮ LIỆU LIÊN QUAN ===\n${chunks.join('\n\n')}`,
          hasChunks: true,
        };
      }
      // Ambient + rỗng chunks — signal để route tự trả skip:true không cần gọi model
      return { prompt: '', hasChunks: false };
    }
  } catch (e) {
    console.warn("RAG retrieval failed in slide API:", e);
  }
  const data = await readRepoFile('data.md');
  const truncated = data.length > 40000 ? data.slice(0, 40000) : data;
  return {
    prompt: `${persona}${unitFacts}${SOURCE_RULE}\n\n=== DỮ LIỆU ===\n${truncated}`,
    hasChunks: true,
  };
}

// Parse JSON slide từ text model trả về (xử lý cả khi bị bọc ```json)
function parseSlide(text: string | null): Record<string, unknown> {
  try {
    let clean = (text || '').trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(clean);
    if (!parsed.image_urls) parsed.image_urls = parsed.image_url ? [parsed.image_url] : [];
    return parsed;
  } catch {
    console.error("Lỗi parse JSON slide:", text);
    return {
      title: "Lỗi hiển thị",
      points: ["Không thể phân tích dữ liệu thành slide."],
      speech_text: "Xin lỗi anh chị, em không thể xử lý thông tin này. Anh chị vui lòng hỏi lại giúp em nhé.",
      image_urls: [],
    };
  }
}

// CHẾ ĐỘ NGHE NGẦM: chỉ ép "speech ngắn gọn". KHÔNG còn ép LLM tự quyết {"skip":true} —
// việc lọc câu mơ hồ đã do CỔNG TIN CẬY xử lý ở tầng deterministic (intent client + minScore RAG
// + slide tĩnh). Trước đây luật ép-skip khiến LLM trả skip/không ảnh cho cả chủ đề thật -> mất slide.
const AMBIENT_RULE = `\n\nCHẾ ĐỘ NGHE NGẦM: Đây là hội thoại đang diễn ra; hãy tạo slide bám sát chủ đề vừa nghe từ phần dữ liệu bên dưới. "speech_text" phải CỰC KỲ NGẮN GỌN (1-2 câu, ~15 giây đọc), đi thẳng trọng tâm, không chào hỏi dài dòng.`;

export async function POST(req: NextRequest) {
  try {
    const { message, ambient } = await req.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    // --- BỘ ĐỆM SLIDE TĨNH: Trả slide ngay lập tức trong 0.1ms nếu khớp từ khóa trực tiếp, bypass AI hoàn toàn ---
    const cleanMsg = message.toLowerCase();
    // Hàm bỏ dấu tiếng Việt để so khớp cả khi STT trả về không dấu
    const removeDiacritics = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    const noD = removeDiacritics(cleanMsg); // bản không dấu
    // Hàm kiểm tra: khớp nếu có dấu HOẶC không dấu
    const has = (...keywords: string[]) => keywords.some(k => cleanMsg.includes(k) || noD.includes(removeDiacritics(k)));

    // CHẶN DỰ ÁN/THƯƠNG HIỆU KHÁC (COMPETITORS imported từ @/lib/intent)
    if (has(...COMPETITORS)) {
      console.log(`[Slide] Bỏ qua: hỏi dự án/thương hiệu khác -> "${message.slice(0, 60)}"`);
      return NextResponse.json({ skip: true });
    }

    let model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' | null = null;
    if (has('fusion', 'gen 5', 'gen5', 'phiêu dân', 'phiêu-dân', 'phiu dân', 'phiu-dân', 'fiu', 'phiu', 'fuse', 'phút dân')) {
      model = 'fusion_gen_5';
    } else if (has('opus', 'ô-pút', 'ô pút', 'o pút', 'opút', 'o-pút', 'ô put', 'ô-put', 'o put')) {
      model = 'opus';
    } else if (has('cosmo', 'cót mô', 'cót-mô', 'cốt mô', 'cát mô', 'cat mo', 'cát-mô', 'gen 2', 'gen2', 'gen hai')) {
      model = 'cosmo_gen_2';
    } else {
      const unitNo = detectUnit(message);
      if (unitNo) model = imageModelForUnit(unitNo);
    }
    // null = không rõ model → dùng ảnh chung của dự án
    const hasExplicitModel = model !== null;

    // (0) Catalog COMBO (lib/static_slides.ts, entry có allOf như "bếp + signature")
    // — chạy TRƯỚC chuỗi nhánh generic để tổ hợp cụ thể thắng nhánh chung.
    let staticSlide: any = matchStaticSlide(cleanMsg, 'combo');

    if (!staticSlide && has(...TOPIC_SLIDES.vi_tri.keywords)) {
      staticSlide = topicSlide('vi_tri');
    } else if (has(...TOPIC_SLIDES.tien_ich.keywords)) {
      staticSlide = topicSlide('tien_ich');
    } else if (has(...ROOM_SLIDES.bep.keywords)) {
      staticSlide = roomSlide('bep', model);
    } else if (has(...ROOM_SLIDES.gara.keywords)) {
      staticSlide = roomSlide('gara', model);
    } else if (has(...ROOM_SLIDES.phong_khach.keywords)) {
      staticSlide = roomSlide('phong_khach', model);
    } else if (has(...ROOM_SLIDES.phong_ngu.keywords)) {
      staticSlide = roomSlide('phong_ngu', model);
    } else if (has(...TOPIC_SLIDES.phap_ly.keywords)) {
      staticSlide = topicSlide('phap_ly');
    } else if (has(...TOPIC_SLIDES.thanh_toan.keywords)) {
      staticSlide = topicSlide('thanh_toan');
    } else if (has(...TOPIC_SLIDES.gia.keywords)) {
      staticSlide = topicSlide('gia');
    } else if (has(...MODEL_INTRO_KEYWORDS)) {
      staticSlide = modelIntroSlide(model);
    } else if (has(...TOPIC_SLIDES.phoi_canh.keywords)) {
      staticSlide = topicSlide('phoi_canh');
    } else if (has(...TOPIC_SLIDES.chu_dau_tu.keywords)) {
      staticSlide = topicSlide('chu_dau_tu');
    } else if (has('tầng', 'lầu', 'tính năng tầng', 'công năng tầng')) {
      // Câu hỏi về "tầng" rất dễ bị LLM bịa số liệu → ép text tĩnh + ảnh tính năng tầng theo model.
      // Chọn số tầng (1-6) nếu có, mặc định ảnh tổng quan tính năng tầng 1.
      const floorMatch = noD.match(/tang\s*([1-6])|lau\s*([1-5])/);
      let floor = 1;
      if (floorMatch) {
        const n = parseInt(floorMatch[1] || floorMatch[2] || '1', 10);
        floor = (floorMatch[2] !== undefined && floorMatch[1] === undefined) ? n + 1 : n; // "lầu 1" = tầng 2
      }
      const m = (model || 'cosmo_gen_2') as 'cosmo_gen_2' | 'fusion_gen_5' | 'opus';
      // Ảnh tính năng tầng theo model (file có sẵn: *_tinh-nang-tang-{1..4})
      const featImg = m === 'opus'
        ? `/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-${Math.min(floor, 4)}.jpg`
        : m === 'fusion_gen_5'
          ? `/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tinh-nang-tang-${Math.min(floor, 4)}.jpg`
          : `/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tinh-nang-tang-${Math.min(floor, 4)}.jpg`;
      const modelLabel = m === 'opus' ? 'Opus' : m === 'fusion_gen_5' ? 'Fusion Gen 5' : 'Cosmo Gen 2';
      if (hasExplicitModel) {
        // Khách nói rõ model → trả công năng tầng của model đó.
        const floorsOfModel = FLOOR_FUNCTIONS[m];
        const info: FloorInfo = floorsOfModel[floor] || floorsOfModel[Math.max(...Object.keys(floorsOfModel).map(Number))];
        staticSlide = {
          forceStatic: true,
          layout_type: 'split_image_right',
          title: `Tầng ${floor} · ${info.name}`,
          points: info.points,
          speech_text: info.speech,
          image_urls: [info.img || featImg],
        };
      } else {
        // Khách chỉ nói "tầng X" KHÔNG kèm model → trả lời CHUNG, phân biệt nhà ở vs thương mại.
        const g = FLOOR_GENERAL[floor] || FLOOR_GENERAL[Math.max(...Object.keys(FLOOR_GENERAL).map(Number))];
        staticSlide = {
          forceStatic: true,
          layout_type: 'split_image_right',
          title: `Tầng ${floor} · Ny'ah Phú Định`,
          points: g.points,
          speech_text: g.speech,
          image_urls: [g.img || `/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tinh-nang-tang-${Math.min(floor, 4)}.jpg`],
        };
      }
    } else if (hasExplicitModel && model) {
      // Khách nhắc TÊN MẪU NHÀ mà không hỏi phòng/chủ đề cụ thể -> slide giới thiệu mẫu + ảnh gốc.
      const i = MODEL_INTRO[model];
      const FALLBACK_IMGS: Record<string, string[]> = {
        cosmo_gen_2: [
          '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
          '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png',
          '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png',
        ],
        fusion_gen_5: [
          '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tong-quan.jpg',
          '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_khach/fusion-gen-5_phong-khach.png',
          '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/gara/fusion-gen-5_gara.png',
        ],
        opus: [
          '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg',
          '/images/01_NyAh-PhuDinh/noi_that/opus/opus_mat-tien.jpg',
          '/images/01_NyAh-PhuDinh/noi_that/opus/bep/opus_bep.jpg',
        ],
      };
      let imgs = getRootImagesForModel(model);
      const prio = (u: string) => (u.includes('tong-quan') ? 0 : u.includes('mat-tien') ? 1 : 2);
      imgs.sort((a, b) => prio(a) - prio(b));
      // Fallback nếu readdirSync trả rỗng trên Vercel serverless
      if (imgs.length === 0) imgs = FALLBACK_IMGS[model] || [];
      staticSlide = {
        layout_type: 'split_image_right',
        title: i.title,
        points: i.points,
        speech_text: i.speech_text,
        image_urls: imgs.slice(0, 3),
      };
    }

    // (1) Catalog GENERAL (~80 slide tĩnh theo chủ đề: tiến độ, giá, pháp lý, tiện ích,
    // signature, thang xoắn, phong thủy...) — lấp các chủ đề chưa có nhánh riêng ở trên.
    if (!staticSlide) staticSlide = matchStaticSlide(cleanMsg, 'general');

    // (2) Fallback cuối: nhắc chung đến DỰ ÁN ("tổng quan của em phú định", "giới thiệu
    // dự án"...) -> slide GIỚI THIỆU TỔNG QUAN + ảnh gốc dự án. Trước đây câu kiểu này
    // rớt xuống cổng RAG minScore 0.71, câu ngắn dễ dưới ngưỡng -> skip oan.
    if (!staticSlide && has('tổng quan', 'giới thiệu', 'dự án', 'phú định', "ny'ah", 'nyah', 'nhã đạt')) {
      staticSlide = {
        layout_type: 'full_background',
        title: "Ny'ah Phú Định",
        points: [
          'Khu nhà phố compound mặt tiền Trương Đình Hội, Quận 8',
          'Sống đẹp hơn chung cư — sinh lời hơn thổ cư',
          'Chỉ 18 phút đến Quận 1 qua đại lộ Võ Văn Kiệt',
        ],
        speech_text: "Ny'ah Phú Định là khu nhà phố compound tại mặt tiền Trương Đình Hội, Quận 8, chỉ 18 phút đến Quận 1 qua đại lộ Võ Văn Kiệt.",
        image_urls: getRootImagesForProject(),
      };
    }

    // NGHE NGẦM + đã khớp slide tĩnh -> TRẢ NGAY (~0ms), KHÔNG chờ LLM viết lại text
    // (LLM mất 3-5s — khách đang nói chuyện mà slide lên chậm 5s là hỏng nhịp sale).
    // Chat trực tiếp (ambient=false) vẫn giữ LLM viết text bám ngữ cảnh câu hỏi.
    if (ambient && staticSlide) {
      const imgs: string[] = staticSlide.image_urls || [];
      const isDiagram = imgs.some((u: string) => /vi_tri|18_phut|tinh-nang|mat-bang|mat_bang|cau-truc|ban-do|datasheet/.test(u));
      if (!staticSlide.layout_type) staticSlide.layout_type = isDiagram ? 'split_image_right' : 'full_background';
      console.log(`[Slide] Ambient FAST static: "${message.slice(0, 50)}" -> "${staticSlide.title}"`);
      return NextResponse.json(staticSlide);
    }

    // KHÔNG return sớm nữa: giữ staticSlide làm ẢNH cố định + TEXT DỰ PHÒNG, nhưng cho LLM
    // viết lại text theo ngữ cảnh câu hỏi. (Ảnh luôn cố định theo từ khóa, text bám câu nói.)

    const { prompt: systemText, hasChunks } = await buildPrompt(message, ambient);

    // Ambient + RAG rỗng + KHÔNG có slide tĩnh khớp → mơ hồ, bỏ qua.
    // (reason trả về để DEBUG HUD trên /slide?debug=1 hiện được vì sao skip)
    if (ambient && !hasChunks && !staticSlide) {
      console.log(`[Slide] Ambient skip (no RAG match): "${message.slice(0, 60)}"`);
      return NextResponse.json({ skip: true, reason: 'RAG không khớp dữ liệu + không trúng từ khóa slide tĩnh' });
    }

    const systemWithAmbient = ambient ? systemText + AMBIENT_RULE : systemText;
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
    let rawText: string | null = null;

    // 1) Ưu tiên Groq (free + nhanh) — JSON mode
    if (GROQ_API_KEY) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: ambient ? 'llama-3.1-8b-instant' : 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemWithAmbient },
              { role: 'user', content: message },
            ],
            temperature: ambient ? 0.4 : 0.7,   // ambient: thấp hơn -> ít sampling, nhanh + ổn định hơn
            max_tokens: ambient ? 700 : 2048,    // slide JSON ngắn -> cắt sớm, trả nhanh hơn
            response_format: { type: 'json_object' },
          }),
        });
        if (groqRes.ok) {
          const d = await groqRes.json();
          const candidate = d.choices?.[0]?.message?.content || null;
          // Validate: phải có title + points + speech_text mới dùng; nếu thiếu thì fallback Gemini
          if (candidate) {
            try {
              const parsed = JSON.parse(candidate);
              if (parsed.skip === true || (parsed.title && parsed.speech_text && parsed.points)) {
                rawText = candidate;
              } else {
                console.warn('[Slide] Groq JSON thiếu field bắt buộc, fallback Gemini...');
              }
            } catch {
              console.warn('[Slide] Groq JSON parse lỗi, fallback Gemini...');
            }
          }
        } else {
          console.warn(`Slide Groq lỗi ${groqRes.status}, chuyển sang Gemini...`);
        }
      } catch (e) {
        console.warn('Slide Groq network error, chuyển sang Gemini...', e);
      }
    }

    // 2) Fallback Gemini (responseSchema ép đúng cấu trúc)
    // Groq + Gemini đều có the rate-limit/loi mang. Neu ca 2 deu hong MA da co
    // staticSlide (tu khoa khop san, anh + text du phong deterministic) -> DUNG
    // staticSlide thay vi 500 trang tay. Client gap loi se hien "xin loi co loi
    // xay ra" roi nghe lai -> tuong nhu mic khong nhan, that ra la backend chet.
    if (!rawText) {
      if (!GEMINI_API_KEY) {
        if (staticSlide) { rawText = '{}'; } else {
          return NextResponse.json({ error: 'GEMINI_API_KEY is missing' }, { status: 500 });
        }
      } else {
      const reqBody = {
        contents: [{ role: 'user', parts: [{ text: message }] }],
        system_instruction: { parts: [{ text: systemWithAmbient }] },
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              skip: { type: "BOOLEAN", description: "true nếu câu hỏi hoặc cuộc hội thoại không có dữ liệu liên quan để trả lời." },
              layout_type: { type: "STRING" },
              title: { type: "STRING", description: "BẮT BUỘC viết bằng Tiếng Việt." },
              points: { type: "ARRAY", items: { type: "STRING", description: "BẮT BUỘC viết bằng Tiếng Việt." } },
              highlight_number: { type: "STRING", description: "Con số nổi bật (nếu có)" },
              speech_text: { type: "STRING", description: "BẮT BUỘC viết bằng Tiếng Việt. Kịch bản đọc." },
              image_urls: { type: "ARRAY", items: { type: "STRING" }, description: "Danh sách URL hình ảnh. CHỈ được chọn các đường dẫn bắt đầu bằng '/images/'. BẮT BUỘC bỏ qua các đường dẫn bắt đầu bằng '2 - trình chiếu' hoặc không bắt đầu bằng '/images/'. Tối đa 3 ảnh. Nếu không có, trả về mảng rỗng []." }
            },
            required: ["layout_type", "title", "points", "speech_text", "image_urls"]
          }
        },
      };
      const geminiResponse = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });
      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error(`Slide Gemini lỗi ${geminiResponse.status}: ${errText}`);
        if (staticSlide) {
          console.warn('[Slide] Gemini loi nhung co staticSlide khop tu khoa -> dung fallback tinh thay vi 500');
          rawText = '{}';
        } else {
          return NextResponse.json({ error: 'Có lỗi xảy ra, vui lòng thử lại.' }, { status: geminiResponse.status });
        }
      } else {
        const data = await geminiResponse.json();
        rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      }
      }
    }

    const parsed: any = parseSlide(rawText);

    // HYBRID: nếu có slide tĩnh khớp từ khóa -> ÉP DÙNG ẢNH cố định của nó (deterministic),
    // còn TEXT thì lấy của LLM (bám ngữ cảnh). LLM skip/lỗi -> rớt về text tĩnh có sẵn.
    if (staticSlide) {
      const llmOk = !parsed.skip && parsed.title && parsed.speech_text && Array.isArray(parsed.points) && parsed.points.length;
      // forceStatic: câu mơ hồ (vd "tầng 2") dễ bị LLM bịa số liệu → ép DÙNG LUÔN text tĩnh
      const base = (staticSlide.forceStatic || !llmOk) ? staticSlide : parsed;
      const imgs: string[] = staticSlide.image_urls || [];
      base.image_urls = imgs;                              // ẢNH CỐ ĐỊNH theo từ khóa
      if (staticSlide.maps_url) base.maps_url = staticSlide.maps_url;
      // Ảnh dạng infographic/sơ đồ (bản đồ, tính năng tầng, mặt bằng, cấu trúc) → split để KHÔNG bị cắt.
      // Ảnh chụp thực tế (phòng, phối cảnh) → full_background cho hoành tráng.
      const isDiagram = imgs.some((u: string) => /vi_tri|18_phut|tinh-nang|mat-bang|mat_bang|cau-truc|datasheet/.test(u));
      base.layout_type = isDiagram ? 'split_image_right' : 'full_background';
      return NextResponse.json(base);
    }

    // Lọc đường dẫn ảnh: phải bắt đầu /images/ VA file phải TON TAI THUC.
    // LLM hay nhat path "ma" tu du lieu RAG cu (vd /images/2023/05/Cover-Fusion-3.webp
    // tu noi dung website 2023) — dung dinh dang /images/ nen loc cu cho qua, nhung file
    // khong co trong repo -> trinh duyet 404 -> slide TRANG ANH. existsSync loai het path
    // ma (chay duoc tren Vercel vi da bundle public/images qua outputFileTracingIncludes).
    // Loc rong -> khoi if ben duoi tu dap anh tinh dung theo tu khoa.
    if (parsed.image_urls && Array.isArray(parsed.image_urls)) {
      parsed.image_urls = parsed.image_urls.filter((url: string) => {
        if (typeof url !== 'string' || !url.startsWith('/images/')) return false;
        try { return existsSync(path.join(process.cwd(), 'public', url)); } catch { return false; }
      });
    } else {
      parsed.image_urls = [];
    }

    const queryText = message.toLowerCase();
    const contentText = ((parsed.title || '') + ' ' + (parsed.points || []).join(' ') + ' ' + (parsed.speech_text || '')).toLowerCase();

    // Điểm kích hoạt ảnh cố định (Fixed Trigger Points) cho Sale Gallery
    if (parsed.image_urls.length === 0) {
      // 1. Phân loại Model nhà
      let model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' | null = null; // null = không rõ model
      const modelSearch = queryText + ' ' + contentText;
      if (modelSearch.includes('fusion') || modelSearch.includes('gen 5') || modelSearch.includes('gen5') || modelSearch.includes('phiêu dân') || modelSearch.includes('phiêu-dân')) {
        model = 'fusion_gen_5';
      } else if (modelSearch.includes('opus') || modelSearch.includes('ô-pút') || modelSearch.includes('ô pút') || modelSearch.includes('o pút')) {
        model = 'opus';
      } else if (modelSearch.includes('cosmo') || modelSearch.includes('cót mô') || modelSearch.includes('cót-mô') || modelSearch.includes('cốt mô')) {
        model = 'cosmo_gen_2';
      } else {
        // Suy ra mẫu nhà theo SỐ CĂN khách hỏi
        const unitNo = detectUnit(message);
        if (unitNo) model = imageModelForUnit(unitNo);
      }

      // 2. Tìm danh mục hình ảnh (ưu tiên theo câu hỏi của khách trước để tránh bị lẫn lộn do text cũ)
      const getCategoryMatch = (text: string) => {
        if (text.includes('vị trí') || text.includes('bản đồ') || text.includes('maps') || text.includes('địa chỉ') || text.includes('đường đi') || text.includes('ở đâu') || text.includes('bao xa') || text.includes('bao lâu') || text.includes('di chuyển') || text.includes('đi từ') || text.includes('cách bao') || text.includes('cách trung tâm') || text.includes('cách dự án') || text.includes('cách quận')) {
          return 'vi_tri';
        }
        if (text.includes('tiện ích') || text.includes('công viên') || text.includes(' landmark coffee') || text.includes('sân chơi') || text.includes('sân cầu lông') || text.includes('bóng rổ') || text.includes('tiện nghi')) {
          return 'tien_ich';
        }
        if (text.includes('bếp') || text.includes('nhà ăn') || text.includes('nấu ăn') || text.includes('phòng ăn') || text.includes('bàn ăn')) {
          return 'bep';
        }
        if (text.includes('gara') || text.includes('xe hơi') || text.includes('đỗ xe') || text.includes('ô tô') || text.includes('đậu xe') || text.includes('xe ô tô')) {
          return 'gara';
        }
        if (text.includes('phòng học') || text.includes('phòng làm việc') || text.includes('home office') || text.includes('góc học') || text.includes('bàn làm việc') || text.includes('workspace') || text.includes('workzone')) {
          return 'phong_hoc';
        }
        if (text.includes('phòng khách') || text.includes('sofa') || text.includes('tiếp khách') || text.includes('sinh hoạt chung') || text.includes('phòng tiếp')) {
          return 'phong_khach';
        }
        if (text.includes('phòng ngủ ông bà') || text.includes('phòng ông bà') || text.includes('ong ba') || text.includes('ông bà')) {
          return 'phong_ngu_ong_ba';
        }
        if (text.includes('phòng ngủ master') || text.includes('ngủ master') || text.includes('master bedroom') || text.includes('phòng ngủ chính') || text.includes('phòng ngủ ba')) {
          return 'phong_ngu_master';
        }
        if (text.includes('phòng ngủ trẻ em') || text.includes('ngủ trẻ em') || text.includes('trẻ em') || text.includes('ngủ con') || text.includes('phòng ngủ con') || text.includes('phòng ngủ 2') || text.includes('phòng ngủ phụ') || text.includes('phòng ngủ 3')) {
          return 'phong_ngu_con';
        }
        if (text.includes('phòng ngủ') || text.includes('giường') || text.includes('nơi ngủ') || text.includes('ngủ nhỏ')) {
          return 'phong_ngu';
        }
        if (text.includes('wc') || text.includes('vệ sinh') || text.includes('toilet') || text.includes('tắm') || text.includes('phòng tắm') || text.includes('lavabo')) {
          return 'wc';
        }
        if (text.includes('thang máy') || text.includes('elevator') || text.includes('thang kính')) {
          return 'thang_may';
        }
        if (text.includes('sân thượng') || text.includes('san thuong')) {
          return 'san_thuong';
        }
        if (text.includes('ban công') || text.includes('logia') || text.includes('ngoài trời') || text.includes('vườn')) {
          return 'ban_cong';
        }
        if (text.includes('sảnh') || text.includes('lounge') || text.includes('phòng chờ') || text.includes('reception')) {
          return 'sanh';
        }
        if (text.includes('tầng 1') || text.includes('tầng một') || text.includes('tầng trệt') || text.includes('trệt') || text.includes('lầu trệt')) {
          return 'tang_1';
        }
        if (text.includes('tầng 2') || text.includes('tầng hai') || text.includes('lầu 1') || text.includes('lầu một')) {
          return 'tang_2';
        }
        if (text.includes('tầng 3') || text.includes('tầng ba') || text.includes('lầu 2') || text.includes('lầu hai')) {
          return 'tang_3';
        }
        if (text.includes('mặt bằng') || text.includes('tầng') || text.includes('thiết kế') || text.includes('bố cục') || text.includes('phân lô') || text.includes('lầu')) {
          return 'mat_bang';
        }
        if (text.includes('pháp lý') || text.includes('sổ hồng') || text.includes('hợp đồng') || text.includes('cam kết')) {
          return 'phap_ly';
        }
        return null;
      };

      // Uu tien category tu CAU HOI. Chi suy tu NOI DUNG LLM khi khach KHONG neu
      // ro mau nha — neu khong, points nhac "cong vien noi khu" se keo ca slide
      // "cho xem Fusion" ve anh cong vien. Co model + cau hoi khong neu phong ->
      // category=null -> roi ve anh TONG QUAN cua dung model do.
      const category = getCategoryMatch(queryText) || (model ? null : getCategoryMatch(contentText));

      if (category === 'vi_tri') {
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg'
        ];
        parsed.layout_type = 'split_image_right';
        const mapsMatch = (parsed.speech_text || '').match(/https:\/\/maps\.(?:app\.goo\.gl|google\.com)\/\S+/);
        parsed.maps_url = mapsMatch ? mapsMatch[0] : 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';
      } else if (category === 'tien_ich') {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png'];
        parsed.layout_type = 'split_image_right';
      } else if (category === 'bep') {
        parsed.image_urls = model ? getImagesForSpace(model, 'bep') : getGeneralImagesForSpace('bep');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/tang-2/fusion-gen-5_tang-2.png'];
          } else if (model === 'opus') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/bep/opus_bep.jpg'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'gara') {
        parsed.image_urls = model ? getImagesForSpace(model, 'gara') : getGeneralImagesForSpace('gara');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/gara/cosmo-gen-2_gara.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/gara/fusion-gen-5_gara.png'];
          } else if (model === 'opus') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_hoc') {
        parsed.image_urls = getImagesForSpace(model, 'khac');
        if (parsed.image_urls.length === 0) {
          if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-hoc.png'];
          } else if (model === 'opus') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-1.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-1-2.jpg'
            ];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_khach') {
        parsed.image_urls = model ? getImagesForSpace(model, 'phong_khach') : getGeneralImagesForSpace('phong_khach');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_khach/fusion-gen-5_phong-khach.png'];
          } else if (model === 'opus') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu_ong_ba') {
        let imgs = getImagesForSpace(model, 'phong_ngu', 'ong-ba');
        if (imgs.length === 0) imgs = getImagesForSpace(model, 'phong_ngu', 'tang-2');
        parsed.image_urls = imgs;
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_tang-2-phong-ngu-ong-ba-1.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu_master') {
        parsed.image_urls = getImagesForSpace(model, 'phong_ngu', 'master');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_noi-that-ngu-master.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_master-bedroom.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-master.jpg'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu_con') {
        let imgs = getImagesForSpace(model, 'phong_ngu', 'con');
        if (imgs.length === 0) imgs = getImagesForSpace(model, 'phong_ngu', 'ngu-2');
        if (imgs.length === 0) imgs = getImagesForSpace(model, 'phong_ngu', 'ngu-3');
        parsed.image_urls = imgs;
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-2.png',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-3.png'
            ];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-ngu-con.png'];
          } else {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-1.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-2.jpg'
            ];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu') {
        parsed.image_urls = model ? getImagesForSpace(model, 'phong_ngu') : getGeneralImagesForSpace('phong_ngu');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_noi-that-ngu-master.png',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-2.png',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_phong-ngu-con-3.png'
            ];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_master-bedroom.png',
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_ngu/fusion-gen-5_phong-ngu-con.png'
            ];
          } else if (model === 'opus') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-master.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-1.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/phong_ngu/opus_phong-ngu-2.jpg'
            ];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'wc') {
        parsed.image_urls = model ? getImagesForSpace(model, 'wc') : getGeneralImagesForSpace('wc');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/wc/cosmo-gen-2_wc.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tong-quan.jpg'];
          } else if (model === 'opus') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/wc/opus_wc.jpg'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'thang_may') {
        if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/gara/fusion-gen-5_gara.png'];
        } else {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/gara/cosmo-gen-2_gara.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png'
          ];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'san_thuong') {
        let imgs = getImagesForSpace(model, 'khac', 'thuong');
        if (imgs.length === 0) imgs = getImagesForSpace(model, 'khac', 'san-thuong');
        parsed.image_urls = imgs;
        if (parsed.image_urls.length === 0) {
          if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/bep/fusion-gen-5_tang-3.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'ban_cong') {
        if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/bep/fusion-gen-5_tang-3.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/cong_vien/nyah-phu-dinh_cong-vien.png'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'sanh') {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-1.jpg'];
        parsed.layout_type = 'split_image_right';
      } else if (category === 'tang_1') {
        if (model === 'opus') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-1.jpg'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_cau-truc-1-2-3.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'tang_2') {
        if (model === 'opus') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-1-2.jpg'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/tang-2/fusion-gen-5_tang-2.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tinh-nang-tang-2.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'tang_3') {
        if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/bep/fusion-gen-5_tang-3.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_cau-truc-1-2-3.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'mat_bang') {
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_cau-truc-1-2-3.jpg',
          '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_cau-truc-4-5-6.jpg',
          '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_cau-truc-1-2-3.jpg'
        ];
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phap_ly') {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg'];
        parsed.layout_type = 'split_image_right';
      } else {
        // Hỏi chung hoặc không khớp danh mục -> ưu tiên ảnh ROOT (tổng quan, mặt tiền, tính năng tầng...)
        // KHÔNG lấy ảnh từ thư mục con (bep, gara, phong_khach...) để tránh hiện phòng ngẫu nhiên.
        if (model) {
          const rootImgs = getRootImagesForModel(model);
          if (rootImgs.length > 0) {
            parsed.image_urls = rootImgs;
          }
        } else {
          // Nếu không chỉ định model cụ thể (hỏi về toàn dự án)
          const rootImgs = getRootImagesForProject();
          if (rootImgs.length > 0) {
            parsed.image_urls = rootImgs;
          }
        }
        
        // Fallback tĩnh nếu dynamic scan không tìm thấy gì
        if (!parsed.image_urls || parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_mat-cat.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tinh-nang-tang-1.jpg'
            ];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tong-quan.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_mat-tien.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tinh-nang-tang-1.jpg'
            ];
          } else if (model === 'opus') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_mat-tien.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-1.jpg'
            ];
          } else {
            // Không rõ model → tổng quan cả 3 mẫu
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tong-quan.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tong-quan.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg'
            ];
          }
        }
        parsed.layout_type = 'split_image_right';
      }
    }

    // LAYOUT: ẢNH FULL MÀN HÌNH, chữ đè 1 góc (full_background) cho mọi slide có ảnh.
    // Riêng bản đồ vị trí giữ split để còn chỗ cho mã QR.
    {
      const imgs: string[] = Array.isArray(parsed.image_urls) ? parsed.image_urls : [];
      const isMapImg = imgs.some((u: string) => u.includes('vi_tri') || u.includes('18_phut'));
      if (imgs.length === 0) {
        parsed.layout_type = 'text_only';
      } else if (isMapImg) {
        parsed.layout_type = 'split_image_right'; // bản đồ + QR
      } else {
        parsed.layout_type = 'full_background';   // ảnh full + chữ ở góc
      }
    }

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
