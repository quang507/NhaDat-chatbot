import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `Bạn là trợ lý tư vấn bất động sản chuyên nghiệp của NhaDat.com.vn.
Nhiệm vụ của bạn là giúp người dùng tìm kiếm, tư vấn thông tin về mua bán, cho thuê nhà đất tại Việt Nam.
Hãy trả lời thân thiện, ngắn gọn và hữu ích bằng tiếng Việt.
Nếu không có thông tin cụ thể, hãy hướng dẫn người dùng liên hệ trực tiếp hoặc tìm kiếm trên website NhaDat.com.vn.`;

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
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
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
