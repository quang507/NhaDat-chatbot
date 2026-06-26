import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { writeLog, extractPhone } from '@/lib/logs';
import { loadIndex, retrieve } from '@/lib/rag';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SOURCE_RULE = `\n\nNGUYÊN TẮC DỮ LIỆU (bắt buộc tuân thủ):
- CHỈ trả lời dựa trên phần "DỮ LIỆU LIÊN QUAN" bên dưới. Không suy diễn hay bịa thêm thông tin.
- TUYỆT ĐỐI KHÔNG sử dụng các cụm từ như "theo nguồn", "theo nguồn X", "dữ liệu cung cấp", "hệ thống", v.v. Hãy trả lời tự nhiên, trực tiếp như một tư vấn viên bất động sản am hiểu sâu sắc.
- Nếu khách hỏi về một căn/lô cụ thể hoặc thông tin bất kỳ mà dữ liệu KHÔNG có hoặc không đủ để trả lời trực tiếp ("ko viết được"), hãy phản hồi lịch sự rằng bạn chưa có thông tin chi tiết về căn/lô này, tuyệt đối KHÔNG đoán mò hay tự chế thông tin, sau đó hãy lịch sự mời khách hàng để lại số điện thoại hoặc liên hệ trực tiếp để bộ phận kinh doanh hỗ trợ chính xác.
- LƯU Ý QUAN TRỌNG: Các từ "Căn", "Lô", "Ô", "Unit" và ký hiệu "#" (ví dụ "#03") là TƯƠNG ĐƯƠNG nhau. Nếu khách hỏi "căn số 3", bạn phải lấy thông tin của "Lô số #03" hoặc "Lô 03" để trả lời.
- ĐẶC BIỆT ƯU TIÊN VĂN PHONG Q&A CHUẨN HUMAN (03_Human-QA): Nếu câu hỏi của khách hàng trùng hoặc tương tự với các câu hỏi trong bộ Q&A Chuẩn Human (trong thư mục '03_Human-QA'), bạn BẮT BUỘC PHẢI sao chép nguyên văn 99%-100% câu trả lời 'Response' đó, giữ nguyên từng dấu xuống dòng, ngắt nghỉ, cách dùng emoji, độ dài ngắn, tuyệt đối không tự ý viết lại, sửa đổi từ ngữ hay rút gọn.
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

  try {
    const index = await loadIndex();
    if (index && index.chunks.length) {
      // Khôi phục về 12 chunks theo yêu cầu của bạn
      const chunks = await retrieve(message, index, 12);
      const data = chunks.join('\n\n');
      return {
        text: `${persona}${profileNote}${SOURCE_RULE}\n\n=== DỮ LIỆU LIÊN QUAN ===\n${data}`,
        usedRag: true,
      };
    }
  } catch (e) {
    console.warn("RAG retrieval failed (possibly Cohere API limit/overload), falling back to data.md slice:", e);
  }

  // Fallback: khôi phục về dung lượng an toàn (Groq giới hạn TPM thấp hơn Gemini)
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  const limit = GROQ_API_KEY ? 15000 : 40000;
  const data = await readRepoFile('data.md');
  const truncated = data.length > limit ? data.slice(0, limit) + '\n\n[... dữ liệu đã được rút ngắn để tránh quá tải API ...]' : data;
  return {
    text: `${persona}${profileNote}${SOURCE_RULE}\n\n=== DỮ LIỆU ===\n${truncated}`,
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

    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

    if (GROQ_API_KEY) {
      try {
        // 1) Sử dụng Groq (Llama-3.3-70b-versatile) nếu có key
        const messages = [
          { role: 'system', content: systemText },
          ...contents.map(c => ({
            role: c.role === 'model' ? 'assistant' : 'user',
            content: c.parts[0].text,
          })),
        ];

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages,
            temperature: 0.7,
            max_tokens: 4096,
            stream: true,
          }),
        });

        if (groqResponse.ok && groqResponse.body) {
          const reader = groqResponse.body.getReader();
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
                  const piece = json.choices?.[0]?.delta?.content || '';
                  if (piece) {
                    full += piece;
                    controller.enqueue(encoder.encode(piece));
                  }
                } catch {
                  // Mảnh JSON chưa trọn vẹn
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
        } else {
          const errText = await groqResponse.text();
          console.warn(`Groq API error (status ${groqResponse.status}): ${errText}. Falling back to Gemini...`);
        }
      } catch (err) {
        console.warn('Failed to call Groq API (network error). Falling back to Gemini...', err);
      }
    }

    // 2) Fallback: dùng Gemini nếu không cấu hình Groq hoặc Groq lỗi
    const generationConfig: any = {
      temperature: 0.7,
      maxOutputTokens: 4096,
    };
    if (!MODEL.startsWith('gemini-1.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    const reqBody = {
      contents,
      system_instruction: { parts: [{ text: systemText }] },
      generationConfig,
    };

    const geminiResponse = await fetch(`${BASE}/models/${MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!geminiResponse.ok || !geminiResponse.body) {
      const errText = await geminiResponse.text();
      const status = geminiResponse.status;
      const friendly = status === 429
        ? 'Hệ thống đang bận (quá nhiều yêu cầu cùng lúc). Anh/chị thử lại sau giây lát giúp em nhé 🙏'
        : 'Có lỗi xảy ra, vui lòng thử lại.';
      return NextResponse.json({ error: errText, friendly }, { status });
    }

    const reader = geminiResponse.body.getReader();
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
            // Mảnh JSON chưa trọn vẹn
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
