import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const BASE_PROMPT = `Bạn là trợ lý tư vấn bất động sản chuyên nghiệp của NhaDat.com.vn.
Nhiệm vụ của bạn là giúp người dùng tìm kiếm, tư vấn thông tin về mua bán, cho thuê nhà đất tại Việt Nam.
Hãy trả lời thân thiện, ngắn gọn và hữu ích bằng tiếng Việt, dựa trên dữ liệu được cung cấp bên dưới.

LƯU Ý VỀ DỮ LIỆU:
- Dữ liệu được chia theo danh mục, mỗi mục bắt đầu bằng dòng "## 🔖 [Danh mục] · ngày".
- Các mục được sắp xếp MỚI NHẤT Ở TRÊN, CŨ NHẤT Ở DƯỚI. Khi có thông tin mâu thuẫn, hãy ƯU TIÊN mục ở phía trên (mới hơn).
- Nếu không có thông tin cụ thể, hãy hướng dẫn người dùng liên hệ trực tiếp hoặc tìm kiếm trên website NhaDat.com.vn.`;

let cachedPrompt: string | null = null;

async function getSystemPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;
  let data = '';
  try {
    data = await readFile(path.join(process.cwd(), 'data.md'), 'utf-8');
  } catch {
    // data.md không tồn tại thì chỉ dùng base prompt
  }
  cachedPrompt = data ? `${BASE_PROMPT}\n\n=== DỮ LIỆU ===\n${data}` : BASE_PROMPT;
  return cachedPrompt;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history } = body;

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY chưa được set trong Vercel Environment Variables' }, { status: 500 });
    }

    const contents = [
      ...(history || []).map((m: { role: string; content: string }) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: await getSystemPrompt() }] },
        contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: JSON.stringify(data) }, { status: response.status });
    }

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không có phản hồi';
    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
