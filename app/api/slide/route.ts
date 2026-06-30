import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { loadIndex, retrieve } from '@/lib/rag';
import { detectUnit, unitContext, imageFamily } from '@/lib/units';
import { hasProjectKeyword, isCompetitor, COMPETITORS } from '@/lib/intent';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Chọn thư mục ảnh theo họ mẫu nhà của 1 căn (1 nguồn: lib/units). Chỉ có 3 bộ ảnh.
// office->opus, cashmere/signature->cosmo (tạm) — xử lý trong imageFamily().
function imageModelForUnit(n: number): 'opus' | 'fusion_gen_5' | 'cosmo_gen_2' {
  return imageFamily(n);
}

function getImagesForSpace(model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' | null, spaceName: string, fileKeyword?: string): string[] {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  
  if (model) {
    try {
      const specificPath = path.join(process.cwd(), 'public', 'images', '01_NyAh-PhuDinh', 'noi_that', model, spaceName);
      if (existsSync(specificPath)) {
        const files = readdirSync(specificPath);
        let matchedFiles = files.filter(f => imageExts.includes(path.extname(f).toLowerCase()));
        
        if (fileKeyword) {
          matchedFiles = matchedFiles.filter(f => f.toLowerCase().includes(fileKeyword));
        }
        
        const imgs = matchedFiles.map(f => `/images/01_NyAh-PhuDinh/noi_that/${model}/${spaceName}/${f}`);
        if (imgs.length > 0) return imgs;
      }
    } catch (e) {
      console.error(`Error reading specific space folder for ${model}/${spaceName}:`, e);
    }
  }

  try {
    const sharedPath = path.join(process.cwd(), 'public', 'images', '01_NyAh-PhuDinh', 'noi_that', spaceName);
    if (existsSync(sharedPath)) {
      const files = readdirSync(sharedPath);
      let matchedFiles = files.filter(f => imageExts.includes(path.extname(f).toLowerCase()));
      
      if (fileKeyword) {
        matchedFiles = matchedFiles.filter(f => f.toLowerCase().includes(fileKeyword));
      }
      
      const imgs = matchedFiles.map(f => `/images/01_NyAh-PhuDinh/noi_that/${spaceName}/${f}`);
      if (imgs.length > 0) return imgs;
    }
  } catch (e) {
    console.error(`Error reading shared space folder ${spaceName}:`, e);
  }

  return [];
}

function getGeneralImagesForSpace(spaceName: string, fileKeyword?: string): string[] {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  const allImgs: string[] = [];
  const models: Array<'cosmo_gen_2' | 'fusion_gen_5' | 'opus'> = ['cosmo_gen_2', 'fusion_gen_5', 'opus'];

  for (const m of models) {
    try {
      const p = path.join(process.cwd(), 'public', 'images', '01_NyAh-PhuDinh', 'noi_that', m, spaceName);
      if (existsSync(p)) {
        const files = readdirSync(p);
        let matchedFiles = files.filter(f => imageExts.includes(path.extname(f).toLowerCase()));
        
        if (fileKeyword) {
          matchedFiles = matchedFiles.filter(f => f.toLowerCase().includes(fileKeyword));
        }
        
        const imgs = matchedFiles.map(f => `/images/01_NyAh-PhuDinh/noi_that/${m}/${spaceName}/${f}`);
        allImgs.push(...imgs);
      }
    } catch {}
  }

  try {
    const p = path.join(process.cwd(), 'public', 'images', '01_NyAh-PhuDinh', 'noi_that', spaceName);
    if (existsSync(p)) {
      const files = readdirSync(p);
      let matchedFiles = files.filter(f => imageExts.includes(path.extname(f).toLowerCase()));
      
      if (fileKeyword) {
        matchedFiles = matchedFiles.filter(f => f.toLowerCase().includes(fileKeyword));
      }
      
      const imgs = matchedFiles.map(f => `/images/01_NyAh-PhuDinh/noi_that/${spaceName}/${f}`);
      allImgs.push(...imgs);
    }
  } catch {}

  return allImgs;
}

// Lấy ẢNH GỐC (root) của 1 model — KHÔNG lấy trong các thư mục con (bep, gara, phong_khach...).
// Dùng khi hỏi chung chung "cosmo gen 2" mà không chỉ rõ phòng nào.
function getRootImagesForModel(model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus'): string[] {
  const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  try {
    const modelDir = path.join(process.cwd(), 'public', 'images', '01_NyAh-PhuDinh', 'noi_that', model);
    if (!existsSync(modelDir)) return [];
    const entries = readdirSync(modelDir, { withFileTypes: true });
    // Chỉ lấy FILE trực tiếp ở root, bỏ qua thư mục con
    const rootFiles = entries
      .filter(e => !e.isDirectory() && imageExts.includes(path.extname(e.name).toLowerCase()))
      .map(e => `/images/01_NyAh-PhuDinh/noi_that/${model}/${e.name}`);
    return rootFiles;
  } catch {
    return [];
  }
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
  "points": ["Ý chính 1 (ngắn gọn súc tích, ~8-12 chữ)", "Ý chính 2", "Ý chính 3"],
  "highlight_number": "Một con số nổi bật nhất trong đoạn văn (ví dụ '18 phút', '9,5 triệu lít', '5,19 tỷ'). Nếu không có số liệu nào ấn tượng, để trống ''. Chỉ dùng cho layout dark_minimal hoặc split.",
  "speech_text": "Kịch bản chi tiết để MC đọc. BẮT BUỘC KHÔNG DÙNG emoji, KHÔNG DÙNG ký tự đặc biệt (*, _, #), KHÔNG DÙNG ngoặc kép, viết tự nhiên như văn nói để máy đọc mượt mà.",
  "image_urls": ["Đường dẫn ảnh 1", "Đường dẫn ảnh 2", ...] (Mảng chứa các đường dẫn hình ảnh tìm thấy trong phần dữ liệu liên quan. CHỈ được chọn các đường dẫn bắt đầu bằng "/images/" như "/images/01_NyAh-PhuDinh/...", TUYỆT ĐỐI KHÔNG lấy các đường dẫn bắt đầu bằng "2 - trình chiếu" hoặc các file PowerPoint local. Nếu không có ảnh nào bắt đầu bằng "/images/", trả về mảng rỗng []).
}

SỐ LƯỢNG Ý CHÍNH: Đưa ra tối đa 3-4 ý ("points") để slide thoáng, tránh tràn màn hình. Mỗi ý 1 câu ngắn gọn, súc tích (~8-12 chữ), đủ thông tin.

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
  // thẳng từ bảng tra cứu, không phụ thuộc may rủi của RAG. Đồng thời tăng cường query.
  let unitFacts = '';
  let ragQuery = message;
  try {
    const unit = detectUnit(message);
    if (unit) {
      const { facts, modelKeywords } = unitContext(unit);
      unitFacts = `\n\n=== ${facts} ===`;
      ragQuery = `${message} ${modelKeywords}`;
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
      const hasModelKeyword = message.toLowerCase().includes('opus') || 
                              message.toLowerCase().includes('ô-pút') || 
                              message.toLowerCase().includes('ô pút') || 
                              message.toLowerCase().includes('o pút') || 
                              message.toLowerCase().includes('cosmo') || 
                              message.toLowerCase().includes('cót mô') || 
                              message.toLowerCase().includes('cót-mô') || 
                              message.toLowerCase().includes('cốt mô') || 
                              message.toLowerCase().includes('fusion') ||
                              message.toLowerCase().includes('phiêu dân') ||
                              message.toLowerCase().includes('phiêu-dân');
      const hasUnit = detectUnit(message) !== null;
      const minScore = (ambient && !hasModelKeyword && !hasUnit) ? 0.71 : 0;
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

const AMBIENT_RULE = `\n\nCHẾ ĐỘ NGHE NGẦM (AMBIENT): Đoạn dưới đây là HỘI THOẠI đang diễn ra (tư vấn viên nói chuyện với khách), KHÔNG phải câu hỏi trực tiếp cho bạn.
- Nếu đoạn vừa nghe KHÔNG nhắm tới một chủ đề RÕ RÀNG về dự án, HOẶC không có dữ liệu liên quan trong phần dưới (vd: chào hỏi, tám chuyện, nói nửa câu) → BẮT BUỘC trả về {"skip": true} và để mọi field khác rỗng. TUYỆT ĐỐI không bịa slide.
- CHỈ tạo slide khi hội thoại chạm tới một chủ đề CỤ THỂ có dữ liệu (mặt bằng, giá, pháp lý, tiện ích, mẫu nhà, chính sách, vị trí...). Khi đó đặt "skip": false.
- QUAN TRỌNG: Tại chế độ này, TỐC ĐỘ là quan trọng nhất. "speech_text" phải CỰC KỲ NGẮN GỌN (tối đa 2-3 câu, khoảng 15-20 giây đọc). Trực tiếp vào trọng tâm, không chào hỏi dài dòng.`;

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

    let model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' = 'cosmo_gen_2';
    if (has('fusion', 'gen 5', 'gen5', 'phiêu dân', 'phiêu-dân')) {
      model = 'fusion_gen_5';
    } else if (has('opus', 'ô-pút', 'ô pút', 'o pút')) {
      model = 'opus';
    } else if (has('cosmo', 'cót mô', 'cót-mô', 'cốt mô')) {
      model = 'cosmo_gen_2';
    } else {
      const unitNo = detectUnit(message);
      if (unitNo) model = imageModelForUnit(unitNo);
    }

    let staticSlide: any = null;

    if (has('vị trí', 'bản đồ', 'maps', 'địa chỉ', 'đường đi', 'ở đâu', 'chỗ nào', 'nằm ở', 'võ văn kiệt', 'quận 8', 'nguyễn văn linh', 'trương đình hội')) {
      staticSlide = {
        layout_type: 'split_image_right',
        title: "Vị trí dự án",
        points: [
          "Mặt tiền Trương Đình Hội, Quận 8",
          "Kết nối trực tiếp Đại lộ Võ Văn Kiệt",
          "Chỉ mất 18 phút di chuyển đến Quận 1"
        ],
        speech_text: "Dự án Ny'ah Phú Định tọa lạc ngay mặt tiền đường Trương Đình Hội, kết nối trực tiếp đến quận 1 chỉ trong 18 phút qua đại lộ Võ Văn Kiệt.",
        image_urls: ['/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg'],
        maps_url: 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A'
      };
    } else if (has('tiện ích', 'công viên', 'landmark coffee', 'sân chơi', 'tiện nghi', 'hồ bơi', 'bể bơi', 'sân thể thao', 'cầu lông', 'bóng rổ', 'khu vui chơi')) {
      staticSlide = {
        layout_type: 'split_image_right',
        title: "Hệ thống Tiện ích",
        points: [
          "Công viên cây xanh nội khu mát mẻ",
          "Khu vui chơi trẻ em an toàn",
          "Sân thể thao đa năng và Landmark Coffee"
        ],
        speech_text: "Dự án sở hữu khu công viên nội khu xanh mát, khu vui chơi cho trẻ em và các sân thể thao đa năng hiện đại.",
        image_urls: ['/images/01_NyAh-PhuDinh/tien_ich/nyah-phu-dinh_cong-vien.png']
      };
    } else if (has('bếp', 'nhà ăn', 'nấu ăn', 'phòng ăn')) {
      if (model === 'cosmo_gen_2') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng bếp Cosmo",
          points: [
            "Hệ tủ bếp hiện đại, tối ưu",
            "Mặt bếp đá thạch anh cao cấp",
            "Không gian bàn ăn ấm cúng"
          ],
          speech_text: "Khu vực bếp và bàn ăn của căn nhà Cosmo được thiết kế ấm cúng, trang bị hệ tủ bếp hiện đại.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_bep.png']
        };
      } else if (model === 'fusion_gen_5') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng bếp Fusion",
          points: [
            "Bố trí bếp đảo hiện đại",
            "Thiết kế mở kết nối phòng khách",
            "Trang bị thiết bị bếp cao cấp"
          ],
          speech_text: "Bếp mẫu nhà Fusion thiết kế thông tầng thoáng đãng với hệ bàn ăn lớn cho gia đình.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-2.png']
        };
      } else {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng bếp Opus",
          points: [
            "Khu vực bếp nấu biệt lập",
            "Bố trí bàn ăn sang trọng",
            "Kết nối ban công thoáng mát"
          ],
          speech_text: "Không gian bếp của mẫu nhà Opus sang trọng, thoáng đãng nhờ kết nối trực tiếp với ban công ngoài trời.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg']
        };
      }
    } else if (has('gara', 'xe hơi', 'đỗ xe', 'ô tô', 'đậu xe', 'xe ô tô')) {
      if (model === 'cosmo_gen_2') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Gara Ô tô Cosmo",
          points: [
            "Sức chứa lớn cho ô tô và xe máy",
            "Tích hợp lối đi thang máy kính",
            "Hệ thống thông gió hiện đại"
          ],
          speech_text: "Mẫu nhà Cosmo thiết kế gara rộng rãi với sức chứa ô tô lớn, kết nối trực tiếp đến thang máy kính lên các tầng.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png']
        };
      } else if (model === 'fusion_gen_5') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Gara Ô tô Fusion",
          points: [
            "Thiết kế gara đỗ xe bán tải rộng",
            "Lối vào nhà thông thoáng",
            "Bố trí hộp kỹ thuật âm tường"
          ],
          speech_text: "Gara mẫu nhà Fusion được tối ưu không gian, đỗ vừa xe bán tải lớn và có thiết kế thông thoáng.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_gara.png']
        };
      } else {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Gara Ô tô Opus",
          points: [
            "Gara đỗ xe hơi thoải mái",
            "Cửa cuốn tự động an toàn",
            "Bố trí tủ giày và tủ dụng cụ"
          ],
          speech_text: "Mẫu nhà thương mại Opus sở hữu gara ô tô riêng biệt tại tầng trệt, kết nối thuận tiện lên khu vực kinh doanh.",
          image_urls: ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png']
        };
      }
    } else if (has('phòng khách', 'sofa', 'tiếp khách', 'sinh hoạt chung')) {
      if (model === 'cosmo_gen_2') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng khách Cosmo",
          points: [
            "Thiết kế kính tràn rộng mở",
            "Trần cao thông thoáng",
            "Nội thất sofa hiện đại"
          ],
          speech_text: "Phòng khách Cosmo Gen 2 ngập tràn ánh sáng tự nhiên nhờ hệ kính lớn và trần cao thoáng đãng.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png']
        };
      } else if (model === 'fusion_gen_5') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng khách Fusion",
          points: [
            "Không gian sinh hoạt rộng lớn",
            "Thiết kế lệch tầng độc đáo",
            "Tối ưu góc nhìn ra sân vườn"
          ],
          speech_text: "Phòng khách mẫu nhà Fusion mang phong cách hiện đại với thiết kế lệch tầng tạo không gian rộng mở.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png']
        };
      } else {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng khách Opus",
          points: [
            "Sảnh đón tiếp khách sang trọng",
            "Tông màu gỗ ấm áp, lịch lãm",
            "Bố trí ánh sáng gián tiếp tinh tế"
          ],
          speech_text: "Không gian phòng khách Opus lịch lãm với gỗ tự nhiên, thiết kế lý tưởng để tiếp các đối tác kinh doanh.",
          image_urls: ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png']
        };
      }
    } else if (has('phòng ngủ', 'giường', 'ngủ con', 'ngủ master', 'phòng ngủ chính')) {
      if (model === 'cosmo_gen_2') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng ngủ Master Cosmo",
          points: [
            "Phòng ngủ master rộng lớn",
            "Bố trí giường king-size thoải mái",
            "Hệ tủ quần áo kính sang trọng"
          ],
          speech_text: "Phòng ngủ chính của mẫu Cosmo được thiết kế tinh tế với hệ cửa kính lớn và phòng tắm kính riêng.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png']
        };
      } else if (model === 'fusion_gen_5') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng ngủ Master Fusion",
          points: [
            "Thiết kế ấm cúng, sang trọng",
            "Tích hợp phòng thay đồ riêng",
            "Cửa sổ hướng công viên nội khu"
          ],
          speech_text: "Phòng ngủ chính mẫu Fusion có thiết kế ấm áp, tích hợp phòng thay đồ và nhà vệ sinh riêng.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png']
        };
      } else {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Phòng ngủ Master Opus",
          points: [
            "Không gian nghỉ ngơi đẳng cấp",
            "Ban công đón gió tự nhiên",
            "Thiết kế chuẩn khách sạn 5 sao"
          ],
          speech_text: "Phòng ngủ master của mẫu nhà Opus mang phong cách resort đẳng cấp với ban công rộng đón gió tự nhiên.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg']
        };
      }
    } else if (has('pháp lý', 'sổ hồng', 'phê duyệt', 'giấy phép', 'sở hữu')) {
      staticSlide = {
        layout_type: 'split_image_right',
        title: "Pháp lý dự án",
        points: [
          "Sổ hồng riêng từng căn sở hữu lâu dài",
          "Quyết định phê duyệt quy hoạch 1/500",
          "Giấy phép xây dựng đầy đủ, minh bạch"
        ],
        speech_text: "Dự án sở hữu pháp lý hoàn chỉnh với sổ hồng riêng từng căn, sở hữu lâu dài, sẵn sàng bàn giao cho quý khách hàng.",
        image_urls: ['/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg']
      };
    } else if (has('thanh toán', 'tiến độ thanh toán', 'lịch thanh toán', 'chiết khấu', 'chính sách')) {
      staticSlide = {
        layout_type: 'split_image_right',
        title: "Tiến độ Thanh toán",
        points: [
          "Lịch thanh toán linh hoạt theo tiến độ",
          "Hỗ trợ vay ngân hàng lãi suất ưu đãi",
          "Chiết khấu hấp dẫn khi thanh toán nhanh"
        ],
        speech_text: "Chính sách thanh toán linh hoạt kéo dài theo tiến độ xây dựng, kết hợp hỗ trợ tài chính từ ngân hàng liên kết.",
        image_urls: ['/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg']
      };
    } else if (has('giá bán', 'giá', 'bao nhiêu tiền', 'bao nhiêu tỷ', 'mấy tỷ')) {
      staticSlide = {
        layout_type: 'split_image_right',
        title: "Giá bán hấp dẫn",
        points: [
          "Giá bán cạnh tranh hàng đầu khu vực",
          "Giá trị gia tăng bền vững lâu dài",
          "Chỉ từ 5 đến 7 tỷ đồng mỗi căn"
        ],
        speech_text: "Giá bán các căn nhà phố thương mại tại dự án cực kỳ hấp dẫn, chỉ từ năm đến bảy tỷ đồng tùy theo diện tích và mẫu nhà.",
        image_urls: ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png']
      };
    } else if (has('mẫu nhà', 'thiết kế nhà', 'kiến trúc nhà')) {
      if (model === 'cosmo_gen_2') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Mẫu nhà Cosmo Gen 2",
          points: [
            "Diện tích sử dụng tối ưu hóa",
            "Thang máy kính từ gara tầng trệt",
            "Thiết kế trần cao thoáng đãng"
          ],
          speech_text: "Mẫu nhà Cosmo Gen 2 được thiết kế thông minh, tối ưu diện tích sử dụng với gara lớn và thang máy kính sang trọng.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png']
        };
      } else if (model === 'fusion_gen_5') {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Mẫu nhà Fusion Gen 5",
          points: [
            "Thiết kế lệch tầng phá cách",
            "Không gian bếp đảo rộng mở",
            "Tối ưu ánh sáng và gió tự nhiên"
          ],
          speech_text: "Mẫu nhà Fusion Gen 5 phá cách với thiết kế lệch tầng độc đáo, mang đến không gian sống thoáng đãng, ngập tràn ánh sáng.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png']
        };
      } else {
        staticSlide = {
          layout_type: 'split_image_right',
          title: "Mẫu nhà Opus",
          points: [
            "Phù hợp vừa ở vừa kinh doanh",
            "Thiết kế 6 tầng bề thế",
            "Mặt tiền thương mại đắt giá"
          ],
          speech_text: "Mẫu nhà thương mại Opus sở hữu thiết kế sáu tầng bề thế, tối ưu cho nhu cầu vừa ở vừa làm văn phòng hoặc kinh doanh.",
          image_urls: ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-1.jpg']
        };
      }
    } else if (has('phối cảnh', 'cảnh quan', 'toàn cảnh', 'tổng thể', 'ngoại thất')) {
      staticSlide = {
        layout_type: 'split_image_right',
        title: "Kiến trúc Phối cảnh",
        points: [
          "Quy hoạch đồng bộ, hiện đại",
          "Không gian xanh bao phủ rộng",
          "Mặt ngoài kiến trúc tinh tế"
        ],
        speech_text: "Dự án được quy hoạch đồng bộ với hạ tầng ngầm, đường nội khu rộng rãi và thiết kế mặt ngoài sang trọng.",
        image_urls: ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png']
      };
    } else if (has('chủ đầu tư', 'nhã đạt', 'nhà phát triển', 'nhà đạt')) {
      staticSlide = {
        layout_type: 'split_image_right',
        title: "Nhà phát triển Nhã Đạt",
        points: [
          "Thương hiệu uy tín, chất lượng",
          "Tập trung vào giá trị sống thực tế",
          "Cam kết bàn giao hoàn thiện cao"
        ],
        speech_text: "Nhã Đạt là nhà phát triển bất động sản uy tín, luôn tập trung kiến tạo các sản phẩm nhà phố chất lượng vượt trội và pháp lý vững vàng.",
        image_urls: ['/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg']
      };
    }

    // KHÔNG return sớm nữa: giữ staticSlide làm ẢNH cố định + TEXT DỰ PHÒNG, nhưng cho LLM
    // viết lại text theo ngữ cảnh câu hỏi. (Ảnh luôn cố định theo từ khóa, text bám câu nói.)

    const { prompt: systemText, hasChunks } = await buildPrompt(message, ambient);

    // Ambient + RAG rỗng + KHÔNG có slide tĩnh khớp → mơ hồ, bỏ qua.
    if (ambient && !hasChunks && !staticSlide) {
      console.log(`[Slide] Ambient skip (no RAG match): "${message.slice(0, 60)}"`);
      return NextResponse.json({ skip: true });
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
    if (!rawText) {
      if (!GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY is missing' }, { status: 500 });
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
        return NextResponse.json({ error: 'Có lỗi xảy ra, vui lòng thử lại.' }, { status: geminiResponse.status });
      }
      const data = await geminiResponse.json();
      rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    }

    const parsed: any = parseSlide(rawText);

    // HYBRID: nếu có slide tĩnh khớp từ khóa -> ÉP DÙNG ẢNH cố định của nó (deterministic),
    // còn TEXT thì lấy của LLM (bám ngữ cảnh). LLM skip/lỗi -> rớt về text tĩnh có sẵn.
    if (staticSlide) {
      const llmOk = !parsed.skip && parsed.title && parsed.speech_text && Array.isArray(parsed.points) && parsed.points.length;
      const base = llmOk ? parsed : staticSlide;
      const imgs: string[] = staticSlide.image_urls || [];
      base.image_urls = imgs;                              // ẢNH CỐ ĐỊNH theo từ khóa
      if (staticSlide.maps_url) base.maps_url = staticSlide.maps_url;
      const isMap = imgs.some((u: string) => u.includes('vi_tri') || u.includes('18_phut'));
      base.layout_type = isMap ? 'split_image_right' : 'full_background'; // bản đồ split (QR), còn lại full + chữ góc
      return NextResponse.json(base);
    }

    // Lọc bỏ mọi đường dẫn không hợp lệ không bắt đầu bằng /images/
    if (parsed.image_urls && Array.isArray(parsed.image_urls)) {
      parsed.image_urls = parsed.image_urls.filter((url: string) => url.startsWith('/images/'));
    } else {
      parsed.image_urls = [];
    }

    const queryText = message.toLowerCase();
    const contentText = ((parsed.title || '') + ' ' + (parsed.points || []).join(' ') + ' ' + (parsed.speech_text || '')).toLowerCase();

    // Điểm kích hoạt ảnh cố định (Fixed Trigger Points) cho Sale Gallery
    if (parsed.image_urls.length === 0) {
      // 1. Phân loại Model nhà
      let model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' | null = 'cosmo_gen_2'; // Mặc định là Cosmo Gen 2
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
        if (text.includes('bếp') || text.includes('nhà ăn') || text.includes('nấu ăn') || text.includes('phòng ăn')) {
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

      const category = getCategoryMatch(queryText) || getCategoryMatch(contentText);

      if (category === 'vi_tri') {
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg'
        ];
        parsed.layout_type = 'split_image_right';
        const mapsMatch = (parsed.speech_text || '').match(/https:\/\/maps\.(?:app\.goo\.gl|google\.com)\/\S+/);
        parsed.maps_url = mapsMatch ? mapsMatch[0] : 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';
      } else if (category === 'tien_ich') {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/nyah-phu-dinh_cong-vien.png'];
        parsed.layout_type = 'split_image_right';
      } else if (category === 'bep') {
        parsed.image_urls = getImagesForSpace(model, 'bep');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_bep.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-2.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'gara') {
        parsed.image_urls = getImagesForSpace(model, 'gara');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_gara.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_hoc') {
        parsed.image_urls = getImagesForSpace(model, 'khac');
        if (parsed.image_urls.length === 0) {
          if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-hoc.png'];
          } else if (model === 'opus') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-1.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-2.jpg'
            ];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_khach') {
        parsed.image_urls = getImagesForSpace(model, 'phong_khach');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu_ong_ba') {
        let imgs = getImagesForSpace(model, 'phong_ngu', 'ong-ba');
        if (imgs.length === 0) imgs = getImagesForSpace(model, 'phong_ngu', 'tang-2');
        parsed.image_urls = imgs;
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_ngu/cosmo-gen-2_tang-2.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu_master') {
        parsed.image_urls = getImagesForSpace(model, 'phong_ngu', 'master');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg'];
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
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-2.png',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-3.png'
            ];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-ngu-con.png'];
          } else {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-1.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-2.jpg'
            ];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu') {
        parsed.image_urls = getImagesForSpace(model, 'phong_ngu');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-2.png',
              '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-3.png'
            ];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png',
              '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-ngu-con.png'
            ];
          } else {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-1.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-2.jpg'
            ];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'wc') {
        parsed.image_urls = getImagesForSpace(model, 'wc');
        if (parsed.image_urls.length === 0) {
          if (model === 'cosmo_gen_2') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_wc.png'];
          } else if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-wc.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_wc.jpg'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'thang_may') {
        if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_gara.png'];
        } else {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png'
          ];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'san_thuong') {
        let imgs = getImagesForSpace(model, 'khac', 'thuong');
        if (imgs.length === 0) imgs = getImagesForSpace(model, 'khac', 'san-thuong');
        parsed.image_urls = imgs;
        if (parsed.image_urls.length === 0) {
          if (model === 'fusion_gen_5') {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-3.png'];
          } else {
            parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/nyah-phu-dinh_cong-vien.png'];
          }
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'ban_cong') {
        if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-3.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/nyah-phu-dinh_cong-vien.png'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'sanh') {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-1.jpg'];
        parsed.layout_type = 'split_image_right';
      } else if (category === 'tang_1') {
        if (model === 'opus') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-1.jpg'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-ding_mat-bang-tang-1.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'tang_2') {
        if (model === 'opus') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-2.jpg'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-2.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_tang-2.png'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'tang_3') {
        if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-3.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-dinh_mat-bang-tang-3.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'mat_bang') {
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-ding_mat-bang-tang-1.jpg',
          '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-dinh_mat-bang-tang-2.jpg',
          '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-dinh_mat-bang-tang-3.jpg'
        ];
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phap_ly') {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg'];
        parsed.layout_type = 'split_image_right';
      } else {
        // Hỏi chung hoặc không khớp danh mục -> ưu tiên ảnh ROOT (tổng quan, mặt tiền, tính năng tầng...)
        // KHÔNG lấy ảnh từ thư mục con (bep, gara, phong_khach...) để tránh hiện phòng ngẫu nhiên.
        if (model) {
          const rootImgs = getRootImagesForModel(model);
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
          } else {
            parsed.image_urls = [
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tong-quan.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_mat-tien.jpg',
              '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tinh-nang-tang-1.jpg'
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
