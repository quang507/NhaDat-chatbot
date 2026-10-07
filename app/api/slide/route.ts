import { NextRequest, NextResponse } from 'next/server';
import { rateLimited } from '@/lib/ratelimit';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { getPersona } from '@/lib/admin';
import { loadIndex, retrieve } from '@/lib/rag';
import { searchImages, isImageOnTopic } from '@/lib/image-search';
import { detectUnit, unitContext, imageFamily, getGeneralUnsoldContext, isGeneralUnsoldQuery } from '@/lib/units';
import { hasProjectKeyword, isCompetitor, COMPETITORS, detectModel, kwHit, rmDia } from '@/lib/intent';
import {
  matchStaticSlide,
  ROOM_SLIDES, TOPIC_SLIDES, MODEL_INTRO, MODEL_INTRO_NYAH, MODEL_INTRO_KEYWORDS,
} from '@/lib/static_slides';

export const runtime = 'nodejs';

// Cache câu trả lời refine (pha 2) trong RAM của lambda: câu hỏi lặp lại trong
// showroom trả ngay 0ms. Mất khi lambda nguội - chấp nhận được, đây là cache
// tăng tốc chứ không phải nguồn dữ liệu.
const ANSWER_CACHE = new Map<string, { ans: string; at: number }>();
const ANSWER_CACHE_TTL_MS = 6 * 3600e3;
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Công năng từng tầng THẬT (theo datasheet + data.md). Dùng cho slide tĩnh khi khách
// hỏi "tầng X" - tránh để LLM bịa số liệu. Cosmo/Fusion là nhà ở đa thế hệ (tầng 2 = ông bà),
// Opus là nhà phố thương mại (tầng dưới kinh doanh/văn phòng).
type FloorInfo = { name: string; points: string[]; speech: string };
const FLOOR_FUNCTIONS: Record<'cosmo_gen_2' | 'fusion_gen_5' | 'opus', Record<number, FloorInfo>> = {
  cosmo_gen_2: {
    1: { name: 'Garage & Phòng khách', points: ['Garage ô tô trong nhà, cách âm cách nhiệt', 'Phòng khách thông tầng siêu sáng', 'Sảnh đón riêng trang trọng'], speech: 'Tầng trệt Cosmo gồm garage ô tô trong nhà và phòng khách thông tầng siêu sáng.' },
    2: { name: 'Phòng ông bà', points: ['Tầng dành riêng cho ông bà', 'Phòng ngủ en-suite có sảnh riêng', 'Gần bếp và trệt, đi lại nhẹ nhàng'], speech: 'Tầng 2 mẫu Cosmo dành riêng cho ông bà, là phòng ngủ en-suite có sảnh riêng, gần bếp và tầng trệt nên đi lại rất nhẹ nhàng.' },
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
  2: { name: 'Tầng 2', points: ['Cosmo & Fusion: phòng ngủ ông bà', 'Opus: phòng kinh doanh, văn phòng', 'Bố trí theo nhu cầu từng mẫu'], speech: 'Tầng 2 thì tùy mẫu nhà: với Cosmo và Fusion là phòng dành cho ông bà; còn với nhà phố Opus thì là phòng để kinh doanh hoặc làm văn phòng.' },
  3: { name: 'Tầng 3', points: ['Cosmo & Fusion: bếp, phòng ăn', 'Opus: không gian sinh hoạt', 'Khu vực sinh hoạt chung của gia đình'], speech: 'Tầng 3 thường là khu bếp và phòng ăn với Cosmo, Fusion; còn Opus là không gian sinh hoạt gia đình.' },
  4: { name: 'Tầng 4', points: ['Phòng ngủ master đẳng cấp', 'Walk-in closet và phòng tắm riêng', 'Không gian nghỉ ngơi riêng tư'], speech: 'Tầng 4 thường là phòng ngủ master với walk-in closet và phòng tắm riêng.' },
  5: { name: 'Tầng 5', points: ['Phòng ngủ cho con cái', 'Đón sáng từ giếng trời', 'Phòng tắm riêng tiện nghi'], speech: 'Tầng 5 là các phòng ngủ cho con cái, đón sáng tự nhiên từ giếng trời.' },
  6: { name: 'Sân thượng', points: ['Sân thượng thoáng đãng', 'Thang máy lên tận nơi', 'Thư giãn, trồng cây, phơi đồ'], speech: 'Trên cùng là sân thượng thoáng đãng, có thang máy lên tận nơi để thư giãn và trồng cây.' },
};

// ẢNH CHO SLIDE KHÔNG CÓ ẢNH CHỌN TAY: chọn theo NGỮ NGHĨA (xem lib/image-search.ts).
// Thay cho cách cũ dò từ khóa + quét thư mục + đường dẫn viết cứng (hay ra sai
// phòng, vd "phòng tắm master fusion" ra ảnh bếp). Truy vấn = câu hỏi + tên mẫu
// nhà + tiêu đề slide (hint) - KHÔNG đưa cả đoạn chữ slide: chữ dài chung chung
// ("Ny'ah Phú Định... tiện lợi") kéo ảnh về phối cảnh tổng, lạc chủ đề. Thiếu tên
// mẫu thì "tầng 4 fusion" ra ảnh Fusion Gen 4. Không ảnh nào đủ ngưỡng -> [].
const MODEL_LABEL: Record<SlideModel, string> = { cosmo_gen_2: 'Mẫu Cosmo Gen 2', fusion_gen_5: 'Mẫu Fusion Gen 5', opus: 'Mẫu Opus' };

async function semanticImages(message: string, model: SlideModel | null, hint = ''): Promise<string[]> {
  try {
    const ctx = [model ? MODEL_LABEL[model] : '', hint].filter(Boolean).join('. ');
    return (await searchImages(message, ctx)).map(h => h.url);
  } catch (e) {
    console.warn('[Slide] Chọn ảnh ngữ nghĩa lỗi:', e);
    return [];
  }
}

// ── DỰNG SLIDE TĨNH TỪ CATALOG (lib/static_slides.ts) ────────────────────────
// Dữ liệu slide (title/points/speech/ảnh) nằm trong catalog; ở đây chỉ ráp lại +
// biến thể 'nyah' (không rõ mẫu nhà) không có ảnh chọn tay -> imageHint, ảnh
// được chọn theo ngữ nghĩa sau khi chốt slide.
type SlideModel = 'cosmo_gen_2' | 'fusion_gen_5' | 'opus';

function roomSlide(key: 'bep' | 'gara' | 'phong_khach' | 'phong_ngu', model: SlideModel | null): any {
  const v = ROOM_SLIDES[key].variants[model ?? 'nyah'];
  return {
    layout_type: 'split_image_right',
    title: v.title,
    points: v.points,
    speech_text: v.speech_text,
    image_urls: v.image_urls ? [...v.image_urls] : [],
    // Gợi ý ảnh = loại phòng chung ("phòng ngủ"), KHÔNG dùng tiêu đề biến thể
    // ("Phòng ngủ Master Cosmo") - để câu hỏi quyết định phòng ông bà/con/master.
    imageHint: v.image_urls ? undefined : ROOM_SLIDES[key].keywords[0],
    imageModel: model,
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
  "image_urls": [] (LUÔN để mảng rỗng - hệ thống tự chọn ảnh theo nội dung slide)
}

SỐ LƯỢNG Ý CHÍNH: 3 ý NGẮN (~10-20 chữ) để chừa chỗ cho ảnh hệ thống tự chọn. MỖI Ý PHẢI LÀ MỘT CÂU TRẢ LỜI mang thông tin giải thích (vd thay vì "Vị trí đắc địa", hãy viết "Dự án nằm ngay mặt tiền Trương Đình Hội, dễ dàng di chuyển").

VỀ ĐỊA DANH & LỘ TRÌNH: Chủ thể luôn là DỰ ÁN NY'AH PHÚ ĐỊNH tại Trương Đình Hội, P. Phú Định (Quận 8 cũ) - TUYỆT ĐỐI KHÔNG gọi thành tên khác (vd "Tòa nhà Phú Điền" là SAI). Mọi khoảng cách/lộ trình phải TÍNH TỪ DỰ ÁN và chỉ dùng số liệu CÓ TRONG DỮ LIỆU; không có số thì nói định tính ("di chuyển nhanh qua Võ Văn Kiệt") - KHÔNG tự chế km, tên đường, lộ trình. MẶC ĐỊNH mọi địa danh khách nhắc (bệnh viện, chợ, trường, quán...) là ĐỊA ĐIỂM TRONG TP.HCM (vd "bệnh viện Hùng Vương" = BV Hùng Vương Quận 5 TP.HCM, KHÔNG PHẢI BV Hùng Vương Phú Thọ); chỉ hiểu là địa điểm tỉnh khác khi khách NÓI RÕ tên tỉnh trong câu.

VỀ LINK/URL/MÃ KEY: TUYỆT ĐỐI KHÔNG đưa đường link, URL hay mã key nào vào title/points/speech_text (đặc biệt link album Google Photos/Drive kèm "key=..."). Khi dữ liệu có link album/tài liệu, thay bằng: "Liên hệ tư vấn viên để nhận chi tiết".

CÁCH CHỌN LAYOUT_TYPE (HÃY ĐA DẠNG, đừng luôn chọn 1 kiểu - biến đổi theo nội dung):
- 'text_only': Nếu KHÔNG tìm thấy bất kỳ hình ảnh minh họa hoặc đường dẫn hình ảnh nào liên quan đến câu hỏi trong dữ liệu, hoặc nếu câu trả lời chỉ cần văn bản và số liệu.
- 'dark_minimal': Nếu nội dung thiên về 1 con số cụ thể cực kỳ ấn tượng (vd: 18 phút đến Q1, 9.5 triệu lít không khí) và có ít nhất 1 hình ảnh đi kèm. Yêu cầu bắt buộc phải có "highlight_number".
- 'full_background': Nếu đang miêu tả toàn cảnh, cảnh quan, không gian sống bao quát, sang trọng và có 1 hình ảnh chất lượng cao làm nền.
- 'split_image_right' / 'split_image_left': Nếu đang liệt kê nhiều ý chính, có từ 1 đến 3 hình ảnh minh hoạ cụ thể (Mặt bằng, thiết kế, danh sách tiện ích). Hãy xen kẽ trái phải để linh hoạt.`;

// hasProjectKeyword + isCompetitor + COMPETITORS được import từ @/lib/intent (single source of truth)

async function readRepoFile(name: string): Promise<string> {
  try { return await readFile(path.join(process.cwd(), name), 'utf-8'); } catch { return ''; }
}

// getPersona dùng chung từ @/lib/admin (cache 5 phút, đồng bộ với /api/chat)

async function buildPrompt(message: string, ambient = false, recentText = ''): Promise<{ prompt: string; hasChunks: boolean }> {
  const persona = await getPersona();
  // Câu gần nhất của cùng khách - cho LLM hiểu "căn đó", "cái này" là gì.
  const convCtx = recentText ? `\n\n=== KHÁCH VỪA NÓI TRƯỚC ĐÓ (cùng một khách, dùng để hiểu đại từ "đó/này/kia"): ${recentText} ===` : '';

  // Khách hỏi 1 căn cụ thể -> nhét THÔNG TIN CHÍNH XÁC (mẫu nhà, diện tích, mặt tiền, tầng)
  let unitFacts = '';
  let ragQuery = message;
  try {
    const unit = detectUnit(message);
    if (unit) {
      const { facts, modelKeywords } = unitContext(unit);
      unitFacts = `\n\n=== ${facts} ===`;
      ragQuery = `${message} ${modelKeywords}`;
    } else if (isGeneralUnsoldQuery(message)) {
      unitFacts = `\n\n${getGeneralUnsoldContext()}`;
    }
  } catch (e) { console.warn('Slide unit lookup failed:', e); }

  try {
    const index = await loadIndex();
    if (index && index.chunks.length) {
      // Ambient: Lọc 2 tầng -
      //   Tầng 1 (nhanh, miễn phí): Kiểm tra keyword - nếu không có keyword dự án → SKIP ngay
      //   Tầng 2 (embedding): minScore=0.71 - nếu vector score thấp → SKIP
      // Lý do 2 tầng: score embedding có variance (~±0.02), keyword detection ổn định 100%
      if (ambient && !hasProjectKeyword(message)) {
        console.log(`[Slide] Ambient SKIP (no keyword): "${message.slice(0, 60)}"`);
        return { prompt: '', hasChunks: false };
      }
      // CHỈ nới cổng confidence khi khách nói RÕ số căn/lô (tín hiệu chắc chắn).
      // KHÔNG nới theo tên mẫu nhà (opus/cosmo/fusion) - STT rất hay nghe NHẦM ra các tên này
      // (xem VN_SPEECH_FIXES), làm cổng tin cậy bị tắt oan -> slide sai. Tên mẫu nhà vẫn qua ngưỡng RAG.
      const hasUnit = detectUnit(message) !== null;
      // Chat trực tiếp cũng có ngưỡng (0.5, thấp hơn ambient 0.71): trước đây
      // minScore=0 nên câu NGOÀI LỀ vẫn nhận đủ 10 chunk "liên quan" và việc
      // từ chối phụ thuộc 100% vào LLM tự giác -> dễ gượng ép trả lời lạc đề.
      const minScore = hasUnit ? 0 : (ambient ? 0.71 : 0.5);
      // Nghe ngầm: ít chunk hơn (6) -> prompt ngắn -> LLM trả NHANH hơn; chat trực tiếp giữ 10.
      const chunks = await retrieve(ragQuery, index, ambient ? 6 : 10, minScore);
      // Có facts của căn cụ thể -> luôn tạo slide kể cả khi RAG rỗng (đã có dữ liệu chính xác)
      if (chunks.length > 0 || unitFacts) {
        return {
          prompt: `${persona}${unitFacts}${convCtx}${SOURCE_RULE}\n\n=== DỮ LIỆU LIÊN QUAN ===\n${chunks.join('\n\n')}`,
          hasChunks: true,
        };
      }
      // Ambient + rỗng chunks - signal để route tự trả skip:true không cần gọi model
      return { prompt: '', hasChunks: false };
    }
  } catch (e) {
    console.warn("RAG retrieval failed in slide API:", e);
  }
  const data = await readRepoFile('data.md');
  const truncated = data.length > 40000 ? data.slice(0, 40000) : data;
  return {
    prompt: `${persona}${unitFacts}${convCtx}${SOURCE_RULE}\n\n=== DỮ LIỆU ===\n${truncated}`,
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

// CHẾ ĐỘ NGHE NGẦM: chỉ ép "speech ngắn gọn". KHÔNG còn ép LLM tự quyết {"skip":true} -
// việc lọc câu mơ hồ đã do CỔNG TIN CẬY xử lý ở tầng deterministic (intent client + minScore RAG
// + slide tĩnh). Trước đây luật ép-skip khiến LLM trả skip/không ảnh cho cả chủ đề thật -> mất slide.
const AMBIENT_RULE = `\n\nCHẾ ĐỘ NGHE NGẦM: Đây là hội thoại đang diễn ra; hãy tạo slide bám sát chủ đề vừa nghe từ phần dữ liệu bên dưới. "speech_text" phải CỰC KỲ NGẮN GỌN (1-2 câu, ~15 giây đọc), đi thẳng trọng tâm, không chào hỏi dài dòng.`;

export async function POST(req: NextRequest) {
  if (rateLimited(req, 'slide', 120)) return NextResponse.json({ error: 'Quá nhiều yêu cầu, thử lại sau ít phút.' }, { status: 429 });
  try {
    // refine=true: PHA 2 của cơ chế "hiện nhanh rồi làm mượt" - client đã có
    // slide tĩnh (pha 1, ~0ms), gọi lại để LLM viết CHỮ bám đúng câu khách hỏi
    // (ảnh giữ nguyên). forceStatic thì không refine - số liệu khóa cứng.
    const { message, ambient, context, refine } = await req.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    // NGỮ CẢNH LƯỢT KHÁCH: client gửi tối đa 3 câu gần nhất của CÙNG một khách
    // (client tự xoá khi khách im lặng quá lâu -> khách mới). Dùng để:
    //   1. Suy ra mẫu nhà/căn khi câu hiện tại không nhắc ("cho xem bếp" sau khi
    //      vừa nói chuyện Cosmo -> bếp Cosmo, không phải bếp chung chung).
    //   2. Đưa vào prompt LLM để slide động bám mạch hội thoại.
    // KHÔNG trộn recent vào chuỗi so khớp keyword - câu cũ đè câu mới sẽ ra
    // slide sai chủ đề (đã cân nhắc và tránh).
    const recentRaw = (context && Array.isArray(context.recent)) ? context.recent : [];
    const recent: string[] = recentRaw.filter((x: unknown): x is string => typeof x === 'string' && !!x.trim()).slice(-10);
    const recentText = recent.join(' … ').slice(0, 1200);

    // --- BỘ ĐỆM SLIDE TĨNH: Trả slide ngay lập tức trong 0.1ms nếu khớp từ khóa trực tiếp, bypass AI hoàn toàn ---
    const cleanMsg = message.toLowerCase();
    const noD = rmDia(cleanMsg); // bản không dấu (rmDia dùng chung từ lib/intent)
    // Hàm kiểm tra: khớp nếu có dấu HOẶC không dấu
    // So khớp CÓ BIÊN TỪ (kwHit trong lib/intent.ts) - includes() trần từng làm
    // "cho anh hỏi" nhảy slide chợ (chợ->cho) và "đánh giá cao" nhảy bảng giá.
    const has = (...keywords: string[]) => keywords.some(k => kwHit(cleanMsg, noD, k));

    // CHẶN DỰ ÁN/THƯƠNG HIỆU KHÁC (COMPETITORS imported từ @/lib/intent)
    if (has(...COMPETITORS)) {
      console.log(`[Slide] Bỏ qua: hỏi dự án/thương hiệu khác -> "${message.slice(0, 60)}"`);
      return NextResponse.json({ skip: true });
    }

    // Nhận diện mẫu nhà qua lib/intent.ts (nguồn duy nhất, kèm phiên âm STT).
    let model: 'cosmo_gen_2' | 'fusion_gen_5' | 'opus' | null = detectModel(cleanMsg) || null;
    if (!model) {
      const unitNo = detectUnit(message);
      if (unitNo) model = imageFamily(unitNo);
    }
    // hasExplicitModel = khách nhắc mẫu/căn TRONG CHÍNH CÂU NÀY. Phải chốt
    // TRƯỚC khi suy model từ ngữ cảnh - model ngữ cảnh chỉ để CHỌN BIẾN THỂ
    // (bếp Cosmo thay vì bếp chung), tuyệt đối không được kích hoạt nhánh
    // "khách nhắc tên mẫu -> slide giới thiệu mẫu", nếu không thì hỏi
    // "tiến độ" sau khi bàn về Cosmo sẽ ra nhầm slide giới thiệu Cosmo.
    const hasExplicitModel = model !== null;
    // Câu hiện tại không nhắc mẫu/căn -> suy từ các câu TRƯỚC của cùng khách.
    // "mẫu cosmo thế nào" ... "cho xem bếp" -> bếp Cosmo thay vì bếp chung.
    if (!model && recentText) {
      model = detectModel(recentText.toLowerCase()) || null;
      if (!model) {
        const prevUnit = detectUnit(recentText);
        if (prevUnit) model = imageFamily(prevUnit);
      }
    }

    // CHẶN CHỦ THỂ LẠ (log Telegram 02/08): tiếng TV/chuyện ngoài chứa đúng
    // keyword ('vị trí của minecraft', 'cổng vào của vinaphone') vẫn trúng
    // slide tĩnh. Nếu câu nhắc chủ thể lạ mà KHÔNG có neo dự án -> bỏ luôn.
    const FOREIGN_SUBJECTS = ['vinaphone', 'viettel', 'mobifone', 'minecraft', 'madrid', 'cảnh sát', 'công an', 'hiện trường', 'điều động', 'truy nã', 'bắt giữ', 'ca sĩ', 'cầu thủ', 'bóng đá', 'trận đấu', 'thời tiết', 'bão số', 'tổng thống', 'thủ tướng', 'showbiz', 'tiktok', 'facebook', 'youtube', 'trò chơi', 'điện thoại di động', 'sim số'];
    const PROJECT_ANCHORS = ["ny'ah", 'nyah', 'nhã đạt', 'phú định', 'trương đình hội', 'an dương vương', 'cosmo', 'fusion', 'opus', 'cashmere', 'signature', 'dự án', 'nhà mẫu', 'showroom', 'airtop', 'bytelife', 'căn', 'lô', 'nhà phố', 'compound'];
    if (ambient && has(...FOREIGN_SUBJECTS) && !has(...PROJECT_ANCHORS)) {
      console.log(`[Slide] Ambient skip (chủ thể lạ): "${message.slice(0, 60)}"`);
      return NextResponse.json({ skip: true, reason: 'chủ thể lạ - không phải hỏi về dự án' });
    }

    // (0) Catalog COMBO (lib/static_slides.ts, entry có allOf như "bếp + signature")
    // - chạy TRƯỚC chuỗi nhánh generic để tổ hợp cụ thể thắng nhánh chung.
    let staticSlide: any = matchStaticSlide(cleanMsg, 'combo');

    if (staticSlide) {
      // Combo đã khớp (tổ hợp cụ thể do người gán tay) -> GIỮ NGUYÊN, không cho
      // chuỗi nhánh generic bên dưới đè lên. Trước đây chỉ nhánh vi_tri kiểm tra
      // !staticSlide, nên câu như "tiến độ căn 22" khớp combo xong vẫn bị nhánh
      // cuối (hasExplicitModel - căn 22 thuộc dòng Cosmo) thay bằng slide giới
      // thiệu mẫu nhà - sai hẳn chủ đề khách hỏi.
    } else if (has(...TOPIC_SLIDES.vi_tri.keywords)) {
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
      // Câu hỏi về "tầng" rất dễ bị LLM bịa số liệu → ép text tĩnh; ảnh chọn theo ngữ nghĩa.
      // Chọn số tầng (1-6) nếu có, mặc định tầng 1.
      const floorMatch = noD.match(/tang\s*([1-6])|lau\s*([1-5])/);
      let floor = 1;
      if (floorMatch) {
        const n = parseInt(floorMatch[1] || floorMatch[2] || '1', 10);
        floor = (floorMatch[2] !== undefined && floorMatch[1] === undefined) ? n + 1 : n; // "lầu 1" = tầng 2
      }
      const m = (model || 'cosmo_gen_2') as 'cosmo_gen_2' | 'fusion_gen_5' | 'opus';
      if (model) {
        // Có model (nói rõ trong câu HOẶC suy từ ngữ cảnh lượt khách - "tầng 3"
        // sau khi vừa bàn Opus) -> trả công năng tầng của đúng model đó.
        const floorsOfModel = FLOOR_FUNCTIONS[m];
        const info: FloorInfo = floorsOfModel[floor] || floorsOfModel[Math.max(...Object.keys(floorsOfModel).map(Number))];
        staticSlide = {
          forceStatic: true,
          layout_type: 'split_image_right',
          title: `Tầng ${floor} · ${info.name}`,
          points: info.points,
          speech_text: info.speech,
          image_urls: [],
          imageModel: m,
          imageHint: `Tầng ${floor} · ${info.name}`,
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
          image_urls: [],
          imageHint: `Tầng ${floor} · ${g.name}`,
        };
      }
    } else if (hasExplicitModel && model) {
      // Khách nhắc TÊN MẪU NHÀ mà không hỏi phòng/chủ đề cụ thể -> slide giới thiệu mẫu,
      // ảnh chọn theo ngữ nghĩa (trước đây quét thư mục, thư mục bếp đứng đầu nên
      // "mẫu fusion gen 5" hay "phòng tắm master fusion" đều ra ảnh bếp).
      const i = MODEL_INTRO[model];
      staticSlide = {
        layout_type: 'split_image_right',
        title: i.title,
        points: i.points,
        speech_text: i.speech_text,
        image_urls: [],
        imageModel: model,
        imageHint: i.title,
      };
    }

    // (1) Catalog GENERAL (~80 slide tĩnh theo chủ đề: tiến độ, giá, pháp lý, tiện ích,
    // signature, thang xoắn, phong thủy...) - lấp các chủ đề chưa có nhánh riêng ở trên.
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
          'Sống đẹp hơn chung cư - sinh lời hơn thổ cư',
          'Chỉ 18 phút đến Quận 1 qua đại lộ Võ Văn Kiệt',
        ],
        speech_text: "Ny'ah Phú Định là khu nhà phố compound tại mặt tiền Trương Đình Hội, Quận 8, chỉ 18 phút đến Quận 1 qua đại lộ Võ Văn Kiệt.",
        image_urls: [],
        imageHint: 'Phối cảnh tổng quan toàn khu nhà phố compound',
      };
    }

    // Slide tĩnh không có ảnh chọn tay -> chọn ảnh theo ngữ nghĩa (một lần embed câu
    // hỏi, ~0.2-0.5s; có cache trong RAM cho câu lặp lại).
    // Ảnh chọn tay của catalog phải là file THẬT (slides.json sửa tay/đổi tên ảnh
    // từng để lại 11 đường dẫn chết -> slide vỡ ảnh). Lọc hết mà rỗng, hoặc catalog
    // để trống image_urls -> chọn theo ngữ nghĩa với tiêu đề slide.
    if (staticSlide && staticSlide.imageHint === undefined) {
      const imgs: string[] = (staticSlide.image_urls || []).filter((u: string) => {
        try { return typeof u === 'string' && u.startsWith('/images/') && existsSync(path.join(process.cwd(), 'public', decodeURIComponent(u))); } catch { return false; }
      });
      staticSlide.image_urls = imgs;
      if (!imgs.length) { staticSlide.imageModel = model; staticSlide.imageHint = staticSlide.title || ''; }
    }
    if (staticSlide && staticSlide.imageHint !== undefined) {
      staticSlide.image_urls = await semanticImages(message, staticSlide.imageModel || null, staticSlide.imageHint);
    }
    if (staticSlide) { delete staticSlide.imageHint; delete staticSlide.imageModel; }

    // NGHE NGẦM + đã khớp slide tĩnh -> TRẢ NGAY (~0ms), KHÔNG chờ LLM viết lại text
    // (LLM mất 3-5s - khách đang nói chuyện mà slide lên chậm 5s là hỏng nhịp sale).
    // Chat trực tiếp (ambient=false) vẫn giữ LLM viết text bám ngữ cảnh câu hỏi.
    if (ambient && staticSlide && !refine) {
      const imgs: string[] = staticSlide.image_urls || [];
      const isDiagram = imgs.some((u: string) => /vi_tri|18_phut|tinh-nang|mat-bang|mat_bang|cau-truc|ban-do|datasheet/.test(u));
      if (!staticSlide.layout_type) staticSlide.layout_type = isDiagram ? 'split_image_right' : 'full_background';
      console.log(`[Slide] Ambient FAST static: "${message.slice(0, 50)}" -> "${staticSlide.title}"`);
      // _source: nhánh nào tạo slide - trang /thu-slide đọc để chẩn đoán.
      // _forceStatic: chữ khóa cứng (số liệu) - giờ chỉ mang tính chẩn đoán trên /thu-slide.
      return NextResponse.json({ ...staticSlide, _source: 'static_fast', _forceStatic: !!staticSlide.forceStatic });
    }

    // KHÔNG return sớm nữa: giữ staticSlide làm ẢNH cố định + TEXT DỰ PHÒNG, nhưng cho LLM
    // viết lại text theo ngữ cảnh câu hỏi. (Ảnh luôn cố định theo từ khóa, text bám câu nói.)

    // CACHE CÂU TRẢ LỜI REFINE: showroom toàn câu lặp (giá, ngập, thang máy...)
    // -> câu giống hệt (sau khi bỏ dấu + thường hóa) đã trả lời rồi thì trả
    // NGAY 0ms, khỏi tốn cả RAG lẫn LLM. Không cache câu có đại từ ngữ cảnh
    // ("căn đó", "cái này") vì đáp án phụ thuộc câu trước của từng khách.
    // Key cache PHẢI kèm ngữ cảnh mẫu nhà/căn (model suy từ chính câu HOẶC các
    // câu trước của khách): "giá bao nhiêu" sau khi bàn Cosmo khác hẳn "giá bao
    // nhiêu" sau khi bàn Opus - thiếu ngữ cảnh thì khách B nhận đáp án của khách A.
    const ctxUnit = detectUnit(message) || (recentText ? detectUnit(recentText) : null);
    const refineCacheKey = `${model || ''}|${ctxUnit || ''}|` + noD.replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    const cacheable = refineCacheKey.length >= 12 && !/\b(do|nay|kia|no)\b/.test(refineCacheKey);
    if (refine && cacheable) {
      const hit = ANSWER_CACHE.get(refineCacheKey);
      if (hit && Date.now() - hit.at < ANSWER_CACHE_TTL_MS) {
        return NextResponse.json({ answer_text: hit.ans, _source: 'static_llm_text', _cached: true });
      }
    }

    const { prompt: systemText, hasChunks } = await buildPrompt(message, ambient, recentText);

    // ĐƯỜNG TẮT REFINE (pha 2): chỉ cần MỘT câu trả lời chèn lên slide tĩnh
    // đã hiện - bỏ hẳn khâu sinh slide JSON đầy đủ (layout/points/ảnh) cho
    // nhanh. Model 8b-instant + max 150 token -> thường dưới 1 giây.
    // Lỗi thì KHÔNG return - rơi xuống đường hybrid cũ (chậm hơn nhưng chắc).
    // Áp dụng cho CẢ câu không trúng keyword (không có staticSlide): 1 câu trả
    // lời về trước ~1s cho client hiện tạm, slide đầy đủ (pha 1 chậm hơn) về
    // sau sẽ thay thế. forceStatic vẫn miễn.
    const REFINE_GROQ_KEY = process.env.GROQ_API_KEY || '';
    // CỔNG NGOÀI LỀ (sửa hồi quy PR #100, mở rộng cho CẢ chat trực tiếp):
    // RAG không khớp dữ liệu -> không có gì để LLM bám -> IM LẶNG / giữ slide
    // tĩnh, tuyệt đối không gọi LLM với prompt RỖNG (trước đây nhánh
    // staticSlide + !hasChunks vẫn lọt xuống refine/hybrid với systemText=''
    // -> LLM tự trả lời bằng kiến thức nền, dễ bịa).
    if (!hasChunks) {
      if (refine) {
        return NextResponse.json({ skip: true, reason: 'refine_no_data' });
      }
      if (staticSlide) {
        // Có slide tĩnh khớp từ khóa -> trả nguyên bản (chữ người duyệt), không cho LLM chế thêm.
        if (!staticSlide.layout_type) staticSlide.layout_type = 'split_image_right';
        return NextResponse.json({ ...staticSlide, _source: 'static_no_rag', _forceStatic: !!staticSlide.forceStatic });
      }
      console.log(`[Slide] Skip (no RAG match, ambient=${!!ambient}): "${message.slice(0, 60)}"`);
      return NextResponse.json({ skip: true, reason: 'RAG không khớp dữ liệu + không trúng từ khóa slide tĩnh' });
    }
    // forceStatic KHÔNG còn miễn refine: số liệu trên slide vẫn khóa cứng
    // (refine chỉ trả answer_text chèn thêm, không đụng points/ảnh), nhưng câu
    // hỏi vặn kiểu "không phải ... à?" giờ có câu xác nhận đúng/sai thẳng.
    if (refine && REFINE_GROQ_KEY) {
      try {
        const sys = systemText + '\n\n=== GHI ĐÈ NHIỆM VỤ (REFINE) ===\nBỏ toàn bộ định dạng slide ở trên. Chỉ trả về JSON đúng dạng {"answer": "..."} - "answer" là MỘT câu trả lời tiếng Việt ngắn (1-2 câu, tối đa 45 chữ) bám ĐÚNG câu khách vừa hỏi, xưng "em" gọi "anh/chị", có số liệu nếu dữ liệu có. TUYỆT ĐỐI không bịa số liệu hay địa danh ngoài dữ liệu. Nếu câu hỏi KHÔNG liên quan dự án/bất động sản (chuyện phiếm, thời sự, chủ đề ngoài lề) hoặc không có thông tin: {"answer": ""} - im lặng tốt hơn trả lời lạc đề.';
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${REFINE_GROQ_KEY}` },
          body: JSON.stringify({
            // Groq đã khai tử llama-3.1-8b-instant -> gpt-oss-20b là model nhanh hiện tại
            model: process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b',
            messages: [{ role: 'system', content: sys }, { role: 'user', content: message }],
            temperature: 0.3,
            max_tokens: 150,
            response_format: { type: 'json_object' },
          }),
        });
        if (r.ok) {
          const d = await r.json();
          const j = JSON.parse(d.choices?.[0]?.message?.content || '{}');
          const ans = typeof j.answer === 'string' ? j.answer.trim() : '';
          if (ans) {
            if (cacheable) {
              if (ANSWER_CACHE.size > 500) ANSWER_CACHE.clear(); // chặn phình bộ nhớ
              ANSWER_CACHE.set(refineCacheKey, { ans: ans.slice(0, 220), at: Date.now() });
            }
            // SỬA ẢNH THEO NGỮ NGHĨA: ảnh đang hiện của slide tĩnh bị bắt nhầm chủ đề
            // (câu lắt léo trúng nhầm từ khóa) -> chấm lại bằng vector câu hỏi + câu
            // trả lời; chỉ thay khi ảnh hiện tại DƯỚI ngưỡng và có ảnh khác đủ ngưỡng.
            // Không đánh giá được (null) thì giữ nguyên - thay sai còn tệ hơn.
            let fixImg = '';
            const curImg: string = (staticSlide && staticSlide.image_urls && staticSlide.image_urls[0]) || '';
            if (curImg && (await isImageOnTopic(message, ans, curImg)) === false) {
              const [best] = await searchImages(message, ans, 1);
              if (best && decodeURIComponent(best.url) !== decodeURIComponent(curImg)) fixImg = best.url;
            }
            return NextResponse.json({ answer_text: ans.slice(0, 220), ...(fixImg ? { image_url: fixImg } : {}), _source: 'static_llm_text' });
          }
          // LLM nói không có thông tin -> đừng chèn gì, giữ nguyên slide tĩnh.
          return NextResponse.json({ skip: true, reason: 'refine_no_info' });
        }
        console.warn(`[Slide] Refine nhanh Groq lỗi ${r.status} - rơi về đường hybrid`);
      } catch (e) {
        console.warn('[Slide] Refine nhanh lỗi mạng - rơi về đường hybrid', e);
      }
    }

    const systemWithAmbient = ambient ? systemText + AMBIENT_RULE : systemText;
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
    let rawText: string | null = null;

    // 1) Ưu tiên Groq (free + nhanh) - JSON mode
    if (GROQ_API_KEY) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            // Model Llama cũ bị Groq trả 404 model_not_found -> thay bằng dòng gpt-oss
            model: ambient
              ? (process.env.GROQ_MODEL_FAST || 'openai/gpt-oss-20b')
              : (process.env.GROQ_MODEL || 'openai/gpt-oss-120b'),
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
              image_urls: { type: "ARRAY", items: { type: "STRING" }, description: "Luôn trả mảng rỗng [] - hệ thống tự chọn ảnh." }
            },
            required: ["layout_type", "title", "points", "speech_text", "image_urls"]
          }
        },
      };
      // Gemini hay trả 429/503 thoáng qua (kể cả tier trả phí) - retry 2 lần
      // trước khi chịu thua, tránh đẩy lỗi 503 thẳng về màn hình slide.
      let geminiResponse: Response | null = null;
      const SLIDE_GEMINI_DELAYS = [1500, 3000];
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, SLIDE_GEMINI_DELAYS[attempt - 1]));
        try {
          geminiResponse = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
          });
        } catch (e) {
          console.warn(`Slide Gemini network error attempt ${attempt + 1}:`, e);
          geminiResponse = null;
          continue;
        }
        if (geminiResponse.ok) break;
        const retryable = geminiResponse.status === 429 || geminiResponse.status >= 500;
        if (!retryable) break;
        if (attempt < 2) console.warn(`Slide Gemini lỗi tạm thời ${geminiResponse.status}, thử lại...`);
      }
      if (!geminiResponse) {
        if (staticSlide) { rawText = '{}'; } else {
          return NextResponse.json({ error: 'Có lỗi xảy ra, vui lòng thử lại.' }, { status: 502 });
        }
      } else if (!geminiResponse.ok) {
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
      // PHA 2 (refine): giữ NGUYÊN slide tĩnh, chỉ CHÈN câu trả lời LLM lên trên
      // (answer_text) - client sẽ thu nhỏ và đẩy text tĩnh xuống dưới.
      if (refine && llmOk && !staticSlide.forceStatic) {
        const imgs0: string[] = staticSlide.image_urls || [];
        const isDiagram0 = imgs0.some((u: string) => /vi_tri|18_phut|tinh-nang|mat-bang|mat_bang|cau-truc|datasheet/.test(u));
        return NextResponse.json({
          ...staticSlide,
          layout_type: staticSlide.layout_type || (isDiagram0 ? 'split_image_right' : 'full_background'),
          answer_text: String(parsed.speech_text).slice(0, 220),
          _source: 'static_llm_text',
        });
      }
      // forceStatic: câu mơ hồ (vd "tầng 2") dễ bị LLM bịa số liệu → ép DÙNG LUÔN text tĩnh
      const base = (staticSlide.forceStatic || !llmOk) ? staticSlide : parsed;
      const imgs: string[] = staticSlide.image_urls || [];
      base.image_urls = imgs;                              // ẢNH CỐ ĐỊNH theo từ khóa
      if (staticSlide.maps_url) base.maps_url = staticSlide.maps_url;
      // Ảnh dạng infographic/sơ đồ (bản đồ, tính năng tầng, mặt bằng, cấu trúc) → split để KHÔNG bị cắt.
      // Ảnh chụp thực tế (phòng, phối cảnh) → full_background cho hoành tráng.
      const isDiagram = imgs.some((u: string) => /vi_tri|18_phut|tinh-nang|mat-bang|mat_bang|cau-truc|datasheet/.test(u));
      base.layout_type = isDiagram ? 'split_image_right' : 'full_background';
      return NextResponse.json({ ...base, _source: 'static_llm_text' });
    }

    // ẢNH CỦA SLIDE ĐỘNG: chọn theo NGỮ NGHĨA (câu hỏi + chữ LLM vừa viết), bỏ
    // ảnh LLM tự nhặt từ dữ liệu RAG (hay ra đường dẫn "ma"/sai chủ đề) và bỏ bộ
    // dò từ khóa + đường dẫn viết cứng cũ. Không ảnh nào đủ ngưỡng -> slide chữ.
    parsed.image_urls = parsed.skip ? [] : await semanticImages(message, model, parsed.title || '');

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

    return NextResponse.json({ ...parsed, _source: 'dynamic_llm' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
