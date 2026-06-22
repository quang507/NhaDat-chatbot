import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { writeLog, extractPhone } from '@/lib/logs';

export const runtime = 'nodejs';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const DATA_NOTE = `\n\nLƯU Ý VỀ DỮ LIỆU:
- Dữ liệu chia theo danh mục, mỗi mục bắt đầu bằng dòng "## 🔖 [Danh mục] · ngày".
- Các mục sắp xếp MỚI NHẤT Ở TRÊN, CŨ NHẤT Ở DƯỚI. Khi thông tin mâu thuẫn, ƯU TIÊN mục ở trên (mới hơn).`;

let cachedPrompt: string | null = null;

async function readRepoFile(name: string): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), name), 'utf-8');
  } catch {
    return '';
  }
}

async function getSystemPrompt(): Promise<string> {
  if (cachedPrompt) return cachedPrompt;
  const [persona, data] = await Promise.all([readRepoFile('persona.md'), readRepoFile('data.md')]);
  const personaText = persona.trim() || DEFAULT_PERSONA;
  cachedPrompt = `${personaText}${DATA_NOTE}${data ? `\n\n=== DỮ LIỆU ===\n${data}` : ''}`;
  return cachedPrompt;
}

// ---- Context caching: cache cục system prompt lớn để mỗi câu hỏi không phải nạp lại ----
let cacheName: string | null = null;
let cacheHash = '';
let cacheExpiry = 0;

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return `${h}:${s.length}`;
}

// Trả về tên cache nếu tạo được, ngược lại null (sẽ fallback gửi system_instruction trực tiếp)
async function getCache(systemText: string): Promise<string | null> {
  const h = hash(systemText);
  if (cacheName && cacheHash === h && Date.now() < cacheExpiry) return cacheName;
  try {
    const res = await fetch(`${BASE}/cachedContents?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: `models/${MODEL}`,
        system_instruction: { parts: [{ text: systemText }] },
        ttl: '3600s',
      }),
    });
    if (!res.ok) return null; // vd: dữ liệu quá nhỏ (<1024 token) -> không cache được
    const data = await res.json();
    cacheName = data.name;
    cacheHash = h;
    cacheExpiry = Date.now() + 50 * 60 * 1000; // dùng lại trong ~50 phút (TTL 60p)
    return cacheName;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, history } = await req.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });
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

    const systemText = await getSystemPrompt();
    const cache = await getCache(systemText);

    const reqBody: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
    };
    if (cache) reqBody.cachedContent = cache;
    else reqBody.system_instruction = { parts: [{ text: systemText }] };

    const response = await fetch(`${BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    const data = await response.json();
    if (!response.ok) {
      // Nếu cache hỏng (vd hết hạn) thì xóa để lần sau tạo lại
      cacheName = null;
      return NextResponse.json({ error: JSON.stringify(data) }, { status: response.status });
    }

    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Không có phản hồi';

    // Ghi log (await để chắc chắn hoàn tất trên serverless; lỗi không làm hỏng phản hồi)
    const time = new Date().toISOString();
    await writeLog('chats', { time, question: message, answer });
    const phone = extractPhone(message);
    if (phone) await writeLog('leads', { time, phone, message });

    return NextResponse.json({ answer });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
