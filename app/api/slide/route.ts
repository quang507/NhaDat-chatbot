import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { loadIndex, retrieve } from '@/lib/rag';
import { detectUnit, unitContext, unitModel } from '@/lib/units';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Chọn thư mục ảnh theo mẫu nhà của 1 căn. Dùng CHUNG nguồn unitModel() ở lib/units (1 nguồn duy nhất).
// Signature (43,44) chưa có bộ ảnh riêng -> tạm fallback ảnh Cosmo Gen 2.
function imageModelForUnit(n: number): 'opus' | 'fusion_gen_5' | 'cosmo_gen_2' {
  const mk = unitModel(n);
  return mk === 'signature' ? 'cosmo_gen_2' : mk;
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

// Danh sách từ khóa dự án — nếu ambient nhưng KHÔNG có bất kỳ từ nào này → SKIP ngay
// (Thực tế: câu mơ hồ "ừ", "ok", "à ừ" không chứa keyword nào dưới đây)
const PROJECT_KEYWORDS = [
  'phú định', "ny'ah", 'nyah', 'niah',
  'cosmo', 'cót mô', 'cót-mô', 'cốt mô',
  'fusion', 'phiêu dân', 'phiêu-dân',
  'opus', 'ô-pút', 'ô pút', 'o pút',
  'office', 'cashmere',
  'giá', 'căn', 'lô', 'diện tích', 'tầng', 'mặt bằng', 'gara', 'thang máy', 'sân thượng',
  'tiện ích', 'công viên', 'hồ bơi', 'cầu lông', 'bóng rổ',
  'vị trí', 'địa chỉ', 'bản đồ', 'quận', 'đường',
  'pháp lý', 'sổ hồng', 'hợp đồng', 'cam kết', 'qsdđ',
  'thanh toán', 'đặt cọc', 'chiết khấu', 'vay', 'ngân hàng',
  'nhà đạt', 'nha dat', 'công ty', 'chủ đầu tư', 'founder',
  'phòng ngủ', 'phòng khách', 'phòng tắm', 'bếp', 'phòng học',
  'nhà phố', 'mẫu nhà', 'thiết kế', 'nội thất', 'phối cảnh',
  'sinh thái', 'xanh', 'landmark', 'trung tâm thương mại',
  'metro', 'quận 1', 'quận 8', 'bình chánh', 'an dương vương',
];

function hasProjectKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return PROJECT_KEYWORDS.some(kw => lower.includes(kw));
}

async function readRepoFile(name: string): Promise<string> {
  try { return await readFile(path.join(process.cwd(), name), 'utf-8'); } catch { return ''; }
}

async function getPersona(): Promise<string> {
  return (await readRepoFile('persona.md')).trim() || DEFAULT_PERSONA;
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
      const chunks = await retrieve(ragQuery, index, 12, minScore);
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

    const { prompt: systemText, hasChunks } = await buildPrompt(message, ambient);

    // Ambient + RAG rỗng (query mơ hồ) → trả skip ngay, không tốn API call
    if (ambient && !hasChunks) {
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
            temperature: 0.7,
            max_tokens: 2048,
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
      let model = 'cosmo_gen_2'; // Mặc định là Cosmo Gen 2
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
        if (text.includes('phòng ngủ master') || text.includes('ngủ master') || text.includes('master bedroom') || text.includes('phòng ngủ chính') || text.includes('phòng ngủ ba')) {
          return 'phong_ngu_master';
        }
        if (text.includes('phòng ngủ') || text.includes('giường') || text.includes('ngủ con') || text.includes('nơi ngủ') || text.includes('ngủ nhỏ') || text.includes('phòng ngủ 2') || text.includes('phòng ngủ phụ')) {
          return 'phong_ngu';
        }
        if (text.includes('wc') || text.includes('vệ sinh') || text.includes('toilet') || text.includes('tắm') || text.includes('phòng tắm') || text.includes('lavabo')) {
          return 'wc';
        }
        if (text.includes('thang máy') || text.includes('elevator') || text.includes('thang kính')) {
          return 'thang_may';
        }
        if (text.includes('ban công') || text.includes('sân thượng') || text.includes('logia') || text.includes('ngoài trời') || text.includes('vườn')) {
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
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_bep.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-2.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'gara') {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_gara.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_hoc') {
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
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_khach') {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu_master') {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-3.png'
          ];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (category === 'phong_ngu') {
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
        parsed.layout_type = 'split_image_right';
      } else if (category === 'wc') {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_wc.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-wc.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_wc.jpg'];
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
        // Hỏi chung hoặc không khớp danh mục -> hiện slideshow các góc đẹp của model
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_bep.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png'
          ];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png',
            '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png',
            '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-hoc.png'
          ];
        } else {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/opus/opus_tang-1.jpg',
            '/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg',
            '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg'
          ];
        }
        parsed.layout_type = 'split_image_right';
      }
    }

    // LAYOUT BIẾN ĐỔI: tránh lúc nào cũng split_image_right cho đỡ nhàm.
    // Quy tắc: vị trí/cảnh quan -> full_background; có số nổi bật -> dark_minimal;
    // còn lại xen kẽ trái/phải theo độ dài câu hỏi.
    {
      const imgs: string[] = Array.isArray(parsed.image_urls) ? parsed.image_urls : [];
      const t = queryText + ' ' + contentText;
      const isMapImg = imgs.some((u: string) => u.includes('vi_tri') || u.includes('18_phut'));
      if (imgs.length === 0) {
        parsed.layout_type = 'text_only';
      } else if (isMapImg) {
        parsed.layout_type = 'split_image_right'; // giữ bản đồ + QR bên phải
      } else if ((/(tổng quan|toàn cảnh|cảnh quan|phối cảnh|không gian|dự án)/).test(t) && imgs.length >= 1) {
        parsed.layout_type = 'full_background';
      } else if (parsed.highlight_number && String(parsed.highlight_number).trim() && imgs.length >= 1) {
        parsed.layout_type = 'dark_minimal';
      } else {
        parsed.layout_type = (message.length % 2 === 0) ? 'split_image_right' : 'split_image_left';
      }
    }

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
