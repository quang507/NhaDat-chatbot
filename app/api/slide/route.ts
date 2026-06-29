import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { loadIndex, retrieve } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

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
  "points": ["Ý chính 1 (Ngắn gọn để chiếu slide)", "Ý chính 2", "Ý chính 3"],
  "highlight_number": "Một con số nổi bật nhất trong đoạn văn (ví dụ '18 phút', '9,5 triệu lít', '5,19 tỷ'). Nếu không có số liệu nào ấn tượng, để trống ''. Chỉ dùng cho layout dark_minimal hoặc split.",
  "speech_text": "Kịch bản chi tiết để MC đọc. BẮT BUỘC KHÔNG DÙNG emoji, KHÔNG DÙNG ký tự đặc biệt (*, _, #), KHÔNG DÙNG ngoặc kép, viết tự nhiên như văn nói để máy đọc mượt mà.",
  "image_urls": ["Đường dẫn ảnh 1", "Đường dẫn ảnh 2", ...] (Mảng chứa các đường dẫn hình ảnh tìm thấy trong phần dữ liệu liên quan. CHỈ được chọn các đường dẫn bắt đầu bằng "/images/" như "/images/01_NyAh-PhuDinh/...", TUYỆT ĐỐI KHÔNG lấy các đường dẫn bắt đầu bằng "2 - trình chiếu" hoặc các file PowerPoint local. Nếu không có ảnh nào bắt đầu bằng "/images/", trả về mảng rỗng []).
}

CÁCH CHỌN LAYOUT_TYPE:
- 'text_only': Nếu KHÔNG tìm thấy bất kỳ hình ảnh minh họa hoặc đường dẫn hình ảnh nào liên quan đến câu hỏi trong dữ liệu, hoặc nếu câu trả lời chỉ cần văn bản và số liệu.
- 'dark_minimal': Nếu nội dung thiên về 1 con số cụ thể cực kỳ ấn tượng (vd: 18 phút đến Q1, 9.5 triệu lít không khí) và có ít nhất 1 hình ảnh đi kèm. Yêu cầu bắt buộc phải có "highlight_number".
- 'full_background': Nếu đang miêu tả toàn cảnh, cảnh quan, không gian sống bao quát, sang trọng và có 1 hình ảnh chất lượng cao làm nền.
- 'split_image_right' / 'split_image_left': Nếu đang liệt kê nhiều ý chính, có từ 1 đến 3 hình ảnh minh hoạ cụ thể (Mặt bằng, thiết kế, danh sách tiện ích). Hãy xen kẽ trái phải để linh hoạt.`;

async function readRepoFile(name: string): Promise<string> {
  try { return await readFile(path.join(process.cwd(), name), 'utf-8'); } catch { return ''; }
}

async function getPersona(): Promise<string> {
  return (await readRepoFile('persona.md')).trim() || DEFAULT_PERSONA;
}

async function buildPrompt(message: string): Promise<string> {
  const persona = await getPersona();
  try {
    const index = await loadIndex();
    if (index && index.chunks.length) {
      const chunks = await retrieve(message, index, 12);
      return `${persona}${SOURCE_RULE}\n\n=== DỮ LIỆU LIÊN QUAN ===\n${chunks.join('\n\n')}`;
    }
  } catch (e) {
    console.warn("RAG retrieval failed in slide API:", e);
  }
  const data = await readRepoFile('data.md');
  const truncated = data.length > 40000 ? data.slice(0, 40000) : data;
  return `${persona}${SOURCE_RULE}\n\n=== DỮ LIỆU ===\n${truncated}`;
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
- CHỈ tạo slide khi hội thoại chạm tới một chủ đề CỤ THỂ có dữ liệu (mặt bằng, giá, pháp lý, tiện ích, mẫu nhà, chính sách, vị trí...). Khi đó đặt "skip": false.`;

export async function POST(req: NextRequest) {
  try {
    const { message, ambient } = await req.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    let systemText = await buildPrompt(message);
    if (ambient) systemText += AMBIENT_RULE;
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
    let rawText: string | null = null;

    // 1) Ưu tiên Groq (free + nhanh) — JSON mode
    if (GROQ_API_KEY) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemText },
              { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 2048,
            response_format: { type: 'json_object' },
          }),
        });
        if (groqRes.ok) {
          const d = await groqRes.json();
          rawText = d.choices?.[0]?.message?.content || null;
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
        system_instruction: { parts: [{ text: systemText }] },
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

    const textToSearch = (message + ' ' + (parsed.title || '') + ' ' + (parsed.points || []).join(' ') + ' ' + (parsed.speech_text || '')).toLowerCase();

    // Điểm kích hoạt ảnh cố định (Fixed Trigger Points) cho Sale Gallery
    if (parsed.image_urls.length === 0) {
      // 1. Phân loại Model nhà
      let model = 'cosmo_gen_2'; // Mặc định là Cosmo Gen 2
      if (textToSearch.includes('fusion') || textToSearch.includes('gen 5') || textToSearch.includes('gen5')) {
        model = 'fusion_gen_5';
      } else if (textToSearch.includes('opus') || textToSearch.includes('ô-pút') || textToSearch.includes('ô pút')) {
        model = 'opus';
      }

      // 2. Kiểm tra từ khóa phòng / không gian
      if (textToSearch.includes('vị trí') || textToSearch.includes('bản đồ') || textToSearch.includes('maps') || textToSearch.includes('địa chỉ') || textToSearch.includes('đường đi') || textToSearch.includes('ở đâu')) {
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/tien_ich/vi_tri.jpg',
          '/images/01_NyAh-PhuDinh/tien_ich/18_phut_den_Quan_1_Chi_tiet.jpg'
        ];
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('tiện ích') || textToSearch.includes('công viên') || textToSearch.includes(' landmark coffee') || textToSearch.includes('sân chơi') || textToSearch.includes('sân cầu lông') || textToSearch.includes('bóng rổ') || textToSearch.includes('tiện nghi')) {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/nyah-phu-dinh_cong-vien.png'];
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('bếp') || textToSearch.includes('ăn') || textToSearch.includes('nấu')) {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_bep.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_tang-2.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_bep.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('gara') || textToSearch.includes('xe hơi') || textToSearch.includes('đỗ xe') || textToSearch.includes('ô tô') || textToSearch.includes('đậu xe')) {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_gara.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('phòng khách') || textToSearch.includes('sofa') || textToSearch.includes('tiếp khách') || textToSearch.includes('sinh hoạt chung')) {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('phòng ngủ') || textToSearch.includes('giường') || textToSearch.includes('ngủ master') || textToSearch.includes('ngủ con') || textToSearch.includes('nơi ngủ')) {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_ngu-master.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-ngu-2.png'
          ];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_master-bedroom.png',
            '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-ngu-con.png'
          ];
        } else {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-master.jpg',
            '/images/01_NyAh-PhuDinh/noi_that/opus/opus_phong-ngu-1.jpg'
          ];
        }
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('wc') || textToSearch.includes('vệ sinh') || textToSearch.includes('toilet') || textToSearch.includes('tắm') || textToSearch.includes('phòng tắm')) {
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_wc.png'];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-wc.png'];
        } else {
          parsed.image_urls = ['/images/01_NyAh-PhuDinh/noi_that/opus/opus_wc.jpg'];
        }
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('thang máy') || textToSearch.includes('elevator')) {
        // Cả Cosmo Gen 2 và Opus đều thiết kế thang máy kính đi từ Gara
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png',
          '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png'
        ];
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('ban công') || textToSearch.includes('sân thượng') || textToSearch.includes('logia')) {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/nyah-phu-dinh_cong-vien.png'];
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('mặt bằng') || textToSearch.includes('tầng') || textToSearch.includes('thiết kế') || textToSearch.includes('bố cục') || textToSearch.includes('phân lô')) {
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-ding_mat-bang-tang-1.jpg',
          '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-dinh_mat-bang-tang-2.jpg',
          '/images/01_NyAh-PhuDinh/mat_bang/nyah-phu-dinh_mat-bang-tang-3.jpg'
        ];
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('pháp lý') || textToSearch.includes('sổ hồng') || textToSearch.includes('hợp đồng') || textToSearch.includes('cam kết')) {
        parsed.image_urls = ['/images/01_NyAh-PhuDinh/tien_ich/vi_tri.jpg'];
        parsed.layout_type = 'split_image_right';
      } else if (textToSearch.includes('cosmo') || textToSearch.includes('fusion') || textToSearch.includes('opus') || textToSearch.includes('mẫu nhà') || textToSearch.includes('nhà phố')) {
        // Hỏi chung chung về mẫu nhà thì hiện bộ sưu tập phòng khách và mặt tiền của mẫu đó
        if (model === 'cosmo_gen_2') {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_phong-khach.png',
            '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/cosmo-gen-2_gara.png'
          ];
        } else if (model === 'fusion_gen_5') {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_phong-khach.png',
            '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_gara.png'
          ];
        } else {
          parsed.image_urls = [
            '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png',
            '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png'
          ];
        }
        parsed.layout_type = 'split_image_right';
      } else {
        // Fallback cảnh quan/phối cảnh dự án tổng thể nếu không tìm thấy chủ đề chuyên biệt
        parsed.image_urls = [
          '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-garage.png',
          '/images/01_NyAh-PhuDinh/phoi_canh/nyah-phu-dinh_phoi-canh-phong-khach.png'
        ];
        parsed.layout_type = 'split_image_right';
      }
    }

    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
