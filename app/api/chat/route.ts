import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { writeLog, extractPhone } from '@/lib/logs';
import { loadIndex, retrieve } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SOURCE_RULE = `\n\nNGUYÊN TẮC DỮ LIỆU:
- Chỉ trả lời dựa trên phần "DỮ LIỆU LIÊN QUAN" bên dưới. Nếu không có thông tin, nói thật là chưa có và mời khách để lại số điện thoại để được tư vấn chính xác.
- Khi nhiều nguồn mâu thuẫn, ưu tiên thông tin mới hơn.`;

let personaCache: { text: string; at: number } | null = null;

async function readRepoFile(name: string): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), name), 'utf-8');
  } catch {
    return '';
  }
}

async function getPersona(): Promise<string> {
  if (personaCache && Date.now() - personaCache.at < 5 * 60 * 1000) return personaCache.text;
  const persona = (await readRepoFile('persona.md')).trim() || DEFAULT_PERSONA;
  personaCache = { text: persona, at: Date.now() };
  return persona;
}

// Build system prompt nhỏ gọn: persona + chỉ các đoạn liên quan tới câu hỏi
async function buildPrompt(message: string, profile?: string): Promise<{ text: string; usedRag: boolean }> {
  const persona = await getPersona();
  const profileNote = profile?.trim()
    ? `\n\nTHÔNG TIN ĐÃ BIẾT VỀ KHÁCH (dùng để cá nhân hóa, đừng hỏi lại thứ đã biết):\n${profile.trim()}`
    : '';

  const index = await loadIndex();
  if (index && index.chunks.length) {
    const chunks = await retrieve(message, index, 12);
    const data = chunks.map((c, i) => `[Nguồn ${i + 1}]\n${c}`).join('\n\n');
    return {
      text: `${persona}${profileNote}${SOURCE_RULE}\n\n=== DỮ LIỆU LIÊN QUAN ===\n${data}`,
      usedRag: true,
    };
  }

  // Fallback: chưa có chỉ mục -> dùng toàn bộ data.md (chậm hơn, có thể gặp 429)
  const data = await readRepoFile('data.md');
  return {
    text: `${persona}${profileNote}${SOURCE_RULE}\n\n=== DỮ LIỆU ===\n${data}`,
    usedRag: false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const { message, history, profile } = await req.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY chưa được set trong Vercel Environment Variables' }, { status: 500 });
    }

    const contents = [
      ...(Array.isArray(history) ? history : [])
        .filter((m): m is { role: string; content: string } =>
          m && typeof m.role === 'string' && typeof m.content === 'string' && m.content.trim() !== ''
        )
        .slice(-10)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const { text: systemText } = await buildPrompt(message, profile);

    const reqBody = {
      contents,
      system_instruction: { parts: [{ text: systemText }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
    };

    const response = await fetch(`${BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text();
      const status = response.status;
      const friendly = status === 429
        ? 'Hệ thống đang bận (quá nhiều yêu cầu cùng lúc). Anh/chị thử lại sau giây lát giúp em nhé 🙏'
        : 'Có lỗi xảy ra, vui lòng thử lại.';
      return NextResponse.json({ error: errText, friendly }, { status });
    }

    // Đọc SSE từ Gemini, đẩy text dần ra client; log lại sau khi xong
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let full = '';
    let buffer = '';

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          const time = new Date().toISOString();
          await writeLog('chats', { time, question: message, answer: full });
          const phone = extractPhone(message);
          if (phone) await writeLog('leads', { time, phone, message });
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const piece = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
            if (piece) {
              full += piece;
              controller.enqueue(encoder.encode(piece));
            }
          } catch {
            // mảnh JSON chưa trọn -> bỏ qua, sẽ ghép ở vòng sau
          }
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error), friendly: 'Có lỗi xảy ra, vui lòng thử lại.' }, { status: 500 });
  }
}
