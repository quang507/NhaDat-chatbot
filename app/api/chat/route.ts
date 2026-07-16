import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { DEFAULT_PERSONA } from '@/lib/admin';
import { writeLog, extractPhone } from '@/lib/logs';
import { loadIndex, retrieve } from '@/lib/rag';
import { detectRouteIntent, getDrivingRoute, routeSummaryToPrompt } from '@/lib/maps';
import { detectUnit, unitContext, getGeneralUnsoldContext } from '@/lib/units';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const SOURCE_RULE = `\n\nNGUYÊN TẮC DỮ LIỆU (bắt buộc tuân thủ):
- Đối với các câu hỏi về dự án, rổ hàng, giá cả, pháp lý, chính sách, hoặc bất kỳ thông tin bất động sản nào, bạn CHỈ được trả lời dựa trên phần "DỮ LIỆU LIÊN QUAN" hoặc "DỮ LIỆU" bên dưới. Tuyệt đối không bịa đặt hoặc suy diễn thông tin.
- Đối với các câu hỏi xã giao thông thường, chào hỏi, giới thiệu bản thân hoặc hỏi về ngày giờ/thời gian hiện tại, bạn được phép trả lời tự nhiên theo hiểu biết thông thường và sử dụng thông tin thời gian hiện tại được cung cấp.
- TUYỆT ĐỐI KHÔNG tự động chào hỏi lặp đi lặp lại ở mỗi câu thoại (ví dụ: "Dạ chào anh/chị, em là...", "Chào anh/chị..."). Nếu đây là lượt thoại tiếp theo trong cuộc trò chuyện (đã có lịch sử hội thoại), hãy đi thẳng vào câu trả lời, tuyệt đối không chào hỏi lại.
- TUYỆT ĐỐI KHÔNG sử dụng các cụm từ như "theo nguồn", "theo nguồn X", "dữ liệu cung cấp", "hệ thống", v.v. Hãy trả lời tự nhiên, trực tiếp như một tư vấn viên bất động sản am hiểu sâu sắc.
- Nếu khách hỏi về một căn/lô cụ thể hoặc thông tin dự án mà dữ liệu KHÔNG có hoặc không đủ để trả lời trực tiếp ("ko viết được"), hãy phản hồi lịch sự rằng bạn chưa có thông tin chi tiết về căn/lô này, tuyệt đối KHÔNG đoán mò hay tự chế thông tin, sau đó hãy lịch sự mời khách hàng để lại số điện thoại hoặc liên hệ trực tiếp để bộ phận kinh doanh hỗ trợ chính xác.
- LƯU Ý QUAN TRỌNG: Các từ "Căn", "Lô", "Ô", "Unit" và ký hiệu "#" (ví dụ "#03") là TƯƠNG ĐƯƠNG nhau. Nếu khách hỏi "căn số 3", bạn phải lấy thông tin của "Lô số #03" hoặc "Lô 03" để trả lời.
- ĐẶC BIỆT ƯU TIÊN VĂN PHONG Q&A CHUẨN HUMAN (03_Human-QA): Nếu câu hỏi của khách hàng trùng hoặc tương tự với các câu hỏi trong bộ Q&A Chuẩn Human (trong thư mục '03_Human-QA'), bạn BẮT BUỘC PHẢI sao chép nguyên văn 99%-100% câu trả lời 'Response' đó, giữ nguyên từng dấu xuống dòng, ngắt nghỉ, cách dùng emoji, độ dài ngắn, tuyệt đối không tự ý viết lại, sửa đổi từ ngữ hay rút gọn.
- Khi nhiều nguồn mâu thuẫn, ưu tiên thông tin mới hơn.
- VỀ ĐƯỜNG ĐI / THỜI GIAN DI CHUYỂN: Nếu CÓ phần "DỮ LIỆU TUYẾN ĐƯỜNG THỰC TẾ", hãy dùng ĐÚNG số quãng đường và thời gian trong đó. Nếu KHÔNG có phần đó, TUYỆT ĐỐI KHÔNG được bịa số phút/km cụ thể — chỉ mô tả hướng đi chung chung (vd: đi theo Võ Văn Kiệt, An Dương Vương...) và mời khách mở Google Maps để xem thời gian chính xác theo thời điểm thực tế.
- VỀ LINK/URL/MÃ KEY: TUYỆT ĐỐI KHÔNG đưa bất kỳ đường link, URL, mã key hay chuỗi kỹ thuật nào trong dữ liệu vào câu trả lời (đặc biệt link album Google Photos/Drive dạng "photos.google.com/share/..." kèm "key=..."). Khi dữ liệu có link album ảnh/tài liệu, thay bằng câu: "Anh/chị liên hệ tư vấn viên để nhận chi tiết ạ." NGOẠI LỆ DUY NHẤT: link Google Maps trong phần "DỮ LIỆU TUYẾN ĐƯỜNG THỰC TẾ" được phép đưa vào.`;

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
async function buildPrompt(message: string, profile?: string): Promise<{ text: string; usedRag: boolean; routeAnswer?: string }> {
  const persona = await getPersona();
  const profileNote = profile?.trim()
    ? `\n\nTHÔNG TIN ĐÃ BIẾT VỀ KHÁCH (dùng để cá nhân hóa, đừng hỏi lại thứ đã biết):\n${profile.trim()}`
    : '';

  // Inject thông tin thời gian thực tế ở Việt Nam (GMT+7)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnTime = new Date(utc + (3600000 * 7));
  const timeStr = vnTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = vnTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeContext = `\n\nTHỜI GIAN HIỆN TẠI (GMT+7): ${timeStr}, ngày ${dateStr}. Bạn có thể dùng thông tin này để trả lời nếu khách hỏi giờ/ngày hiện tại.`;

  // Nếu khách hỏi đường / khoảng cách / thời gian -> gọi Google Maps lấy số liệu THẬT.
  // llama KHÔNG đáng tin để nhắc lại đúng con số (hay bịa 10-15 phút thay vì số thật) ->
  // khi có route hợp lệ, dựng luôn câu trả lời CỐ ĐỊNH server-side, bỏ qua LLM (routeAnswer).
  let routeContext = '';
  let routeAnswer: string | undefined;
  try {
    const { isRoute, origin } = detectRouteIntent(message);
    if (isRoute && origin) {
      const route = await getDrivingRoute(origin);
      if (route) {
        routeContext = routeSummaryToPrompt(route);
        routeAnswer = `Dạ, từ ${route.origin} đến dự án Ny'ah Phú Định (58A Trương Đình Hội, P.16, Q.8) khoảng ${route.distanceText}, đi ô tô mất tầm ${route.durationText} tùy tình hình giao thông ạ.\n\nAnh/chị có thể mở Google Maps để xem lộ trình chi tiết theo thời gian thực: ${route.mapsUrl} 📍`;
      }
    }
  } catch (e) {
    console.warn('Route lookup failed:', e);
  }

  // Nếu khách hỏi về 1 căn cụ thể -> nhét THÔNG TIN CHÍNH XÁC của căn đó (mẫu nhà, diện tích,
  // mặt tiền, tầng, tính năng) thẳng từ bảng tra cứu, không phụ thuộc may rủi của RAG.
  let unitContextStr = '';
  let ragQuery = message;
  try {
    const unit = detectUnit(message);
    if (unit) {
      const { facts, modelKeywords } = unitContext(unit);
      unitContextStr = `\n\n=== ${facts} ===`;
      ragQuery = `${message} ${modelKeywords}`; // kéo thêm datasheet/tính năng đúng mẫu nhà
    } else {
      const qLower = message.toLowerCase();
      const isGeneralUnsold = /(chưa\s*bán|còn\s*trống|rổ\s*hàng|bảng\s*giá|giá\s*bán|giá\s*cả|còn\s*căn|còn\s*lô|còn\s*hàng)/i.test(qLower) || 
                              (/(căn|lô)\s*nào/i.test(qLower) && /giá/i.test(qLower)) ||
                              /giá\s*(bao\s*nhiêu|thế\s*nào|mấy)/i.test(qLower);
      if (isGeneralUnsold) {
        unitContextStr = `\n\n${getGeneralUnsoldContext()}`;
      }
    }
  } catch (e) {
    console.warn('Unit lookup failed:', e);
  }

  try {
    const index = await loadIndex();
    if (index && index.chunks.length) {
      // Gemini là LLM chính (context window lớn) → lấy 12 chunks.
      // Groq chỉ là backup nên dùng chung 12 chunks (nếu fallback sang Groq thì TPM vẫn đủ vì chunk đã nhỏ).
      const chunkCount = 12;
      const chunks = await retrieve(ragQuery, index, chunkCount);
      const data = chunks.join('\n\n');
      return {
        // routeContext ĐẶT TRƯỚC persona: llama hay bỏ qua số khi bị vùi dưới data RAG.
        text: `${routeContext}${persona}${profileNote}${timeContext}${unitContextStr}${SOURCE_RULE}\n\n=== DỮ LIỆU LIÊN QUAN ===\n${data}`,
        usedRag: true,
        routeAnswer,
      };
    }
  } catch (e) {
    console.warn("RAG retrieval failed (possibly Cohere API limit/overload), falling back to data.md slice:", e);
  }

  // Fallback: Gemini là LLM chính, context window lớn → cho 40k ký tự
  const limit = 40000;
  const data = await readRepoFile('data.md');
  const truncated = data.length > limit ? data.slice(0, limit) + '\n\n[... dữ liệu đã được rút ngắn để tránh quá tải API ...]' : data;
  return {
    text: `${routeContext}${persona}${profileNote}${timeContext}${unitContextStr}${SOURCE_RULE}\n\n=== DỮ LIỆU ===\n${truncated}`,
    usedRag: false,
    routeAnswer,
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1) Bảo mật CORS & Handshake Token để chống spam API từ cURL/scripts bên ngoài
    const origin = req.headers.get('origin') || req.headers.get('referer') || '';
    const handshake = req.headers.get('x-chat-handshake') || '';
    const isProd = process.env.NODE_ENV === 'production';
    const allowedOrigin = process.env.ALLOWED_ORIGIN || '';

    // Cần có token bắt buộc để giao tiếp
    const expectedToken = process.env.CHAT_HANDSHAKE_TOKEN || 'npd-mktg-handshake';
    if (handshake !== expectedToken) {
      return NextResponse.json({ error: 'Forbidden: Invalid security token.' }, { status: 403 });
    }

    // Nếu chạy trên production, kiểm tra xem request có xuất phát từ tên miền được phép không
    if (isProd && allowedOrigin && origin) {
      try {
        const allowedDomains = allowedOrigin.split(',').map(d => d.trim().toLowerCase());
        const requestDomain = new URL(origin).hostname.toLowerCase();
        const isAllowed = allowedDomains.some(d => requestDomain.includes(d) || d.includes(requestDomain));
        if (!isAllowed) {
          return NextResponse.json({ error: 'Forbidden: Requester not allowed.' }, { status: 403 });
        }
      } catch (err) {
        return NextResponse.json({ error: 'Forbidden: Invalid request origin format.' }, { status: 403 });
      }
    }

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

    const { text: systemText, routeAnswer } = await buildPrompt(message, profile);

    // Cau hoi chi duong co so lieu Maps that -> tra loi CO DINH, khong cho LLM che so sai.
    if (routeAnswer) {
      const enc = new TextEncoder();
      const time = new Date().toISOString();
      writeLog('chats', { time, question: message, answer: routeAnswer }).catch(console.error);
      const phone = extractPhone(message);
      if (phone) writeLog('leads', { time, phone, message }).catch(console.error);
      const stream = new ReadableStream({
        start(controller) { controller.enqueue(enc.encode(routeAnswer)); controller.close(); },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } });
    }

    // 1) Gemini trước (free tier: 500 lượt/ngày, 10 lượt/phút)
    if (GEMINI_API_KEY) {
      try {
        const generationConfig: any = {
          temperature: 0.7,
          maxOutputTokens: 4096,
        };
        // thinkingConfig chỉ hợp lệ với model 2.5+ (model 2.0/1.5 sẽ trả lỗi 400 nếu gửi kèm)
        if (MODEL.startsWith('gemini-2.5') || MODEL.startsWith('gemini-3')) {
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

        if (geminiResponse.ok && geminiResponse.body) {
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
                writeLog('chats', { time, question: message, answer: full }).catch(console.error);
                const phone = extractPhone(message);
                if (phone) writeLog('leads', { time, phone, message }).catch(console.error);
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
        } else {
          const errText = await geminiResponse.text();
          console.warn(`Gemini API error (status ${geminiResponse.status}): ${errText}. Falling back to Groq...`);
        }
      } catch (err) {
        console.warn('Gemini API network error. Falling back to Groq...', err);
      }
    }

    // 2) Fallback: Groq (miễn phí, dùng khi Gemini hết quota)
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

    if (GROQ_API_KEY) {
      // Groq TPM limit rất thấp (12000 token/phút free tier). systemText hiện build cho Gemini
      // (12 chunks RAG, có thể ~9000+ token) -> gửi nguyên cho Groq sẽ luôn 429 dù retry bao nhiêu
      // lần (không phải lỗi timing mà là VƯỢT NGƯỠNG mỗi request). Phải cắt bớt riêng cho Groq.
      const GROQ_SYSTEM_CHAR_LIMIT = 12000;
      const groqSystemText = systemText.length > GROQ_SYSTEM_CHAR_LIMIT
        ? systemText.slice(0, GROQ_SYSTEM_CHAR_LIMIT) + '\n\n[... dữ liệu đã rút ngắn để tránh vượt giới hạn Groq TPM ...]'
        : systemText;
      const messages = [
        { role: 'system', content: groqSystemText },
        ...contents.map(c => ({
          role: c.role === 'model' ? 'assistant' : 'user',
          content: c.parts[0].text,
        })),
      ];

      const GROQ_RETRY_DELAYS = [2000, 5000];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, GROQ_RETRY_DELAYS[attempt - 1]));

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
                  writeLog('chats', { time, question: message, answer: full }).catch(console.error);
                  const phone = extractPhone(message);
                  if (phone) writeLog('leads', { time, phone, message }).catch(console.error);
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
            const is429 = groqResponse.status === 429;
            console.warn(`Groq API error attempt ${attempt + 1} (status ${groqResponse.status}): ${errText}`);
            if (!is429 || attempt === 2) break;
          }
        } catch (err) {
          console.warn(`Groq API network error attempt ${attempt + 1}:`, err);
          if (attempt === 2) break;
        }
      }
    }

    // Cả Gemini và Groq đều lỗi
    return NextResponse.json({
      friendly: '⚠️ Hệ thống đang bận, anh/chị vui lòng thử lại sau ít phút giúp em nhé 🙏'
    }, { status: 429 });
  } catch (error) {
    return NextResponse.json({ error: String(error), friendly: 'Có lỗi xảy ra, vui lòng thử lại.' }, { status: 500 });
  }
}
