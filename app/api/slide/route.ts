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
- BẮT BUỘC TOÀN BỘ CÂU TRẢ LỜI (Title, Points, Speech_text) PHẢI BẰNG TIẾNG VIỆT (VIETNAMESE).
- Đóng vai trò là Giám đốc Nghệ thuật (Art Director), bạn phải tự quyết định layout nào phù hợp nhất với nội dung.
- Bạn PHẢI trả về ĐÚNG chuẩn JSON với cấu trúc sau, KHÔNG thêm markdown \`\`\`json:
{
  "layout_type": "Loại bố cục (chỉ chọn 1 trong 5: 'split_image_right', 'split_image_left', 'full_background', 'dark_minimal', 'text_only')",
  "title": "Tiêu đề ngắn gọn, ấn tượng (Tối đa 10 chữ)",
  "points": ["Ý chính 1 (Ngắn gọn để chiếu slide)", "Ý chính 2", "Ý chính 3"],
  "highlight_number": "Một con số nổi bật nhất trong đoạn văn (ví dụ '18 phút', '9,5 triệu lít', '5,19 tỷ'). Nếu không có số liệu nào ấn tượng, để trống ''. Chỉ dùng cho layout dark_minimal hoặc split.",
  "speech_text": "Kịch bản chi tiết để MC đọc. BẮT BUỘC KHÔNG DÙNG emoji, KHÔNG DÙNG ký tự đặc biệt (*, _, #), KHÔNG DÙNG ngoặc kép, viết tự nhiên như văn nói để máy đọc mượt mà.",
  "image_urls": ["Đường dẫn URL ảnh 1", "Đường dẫn URL ảnh 2", ...] (Mảng chứa tất cả các đường dẫn URL ảnh tìm thấy trong phần dữ liệu liên quan. Tối đa 3 ảnh. Nếu không có ảnh nào liên quan trong dữ liệu, trả về mảng rỗng []).
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
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              skip: { type: "BOOLEAN", description: "true nếu chế độ nghe ngầm và đoạn nói không có chủ đề/dữ liệu liên quan." },
              layout_type: { type: "STRING" },
              title: { type: "STRING", description: "BẮT BUỘC viết bằng Tiếng Việt." },
              points: { type: "ARRAY", items: { type: "STRING", description: "BẮT BUỘC viết bằng Tiếng Việt." } },
              highlight_number: { type: "STRING", description: "Con số nổi bật (nếu có)" },
              speech_text: { type: "STRING", description: "BẮT BUỘC viết bằng Tiếng Việt. Kịch bản đọc." },
              image_urls: { type: "ARRAY", items: { type: "STRING" }, description: "Danh sách URL ảnh tìm thấy trong dữ liệu liên quan. Tối đa 3 ảnh. Nếu không có ảnh nào, trả về mảng rỗng []." }
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

    return NextResponse.json(parseSlide(rawText));
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
