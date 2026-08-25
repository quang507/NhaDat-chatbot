import { NextRequest, NextResponse } from 'next/server';
import { rateLimited } from '@/lib/ratelimit';
import { readFile } from 'fs/promises';
import path from 'path';
import { getPersona } from '@/lib/admin';
import { writeLog, extractPhone } from '@/lib/logs';
import { loadIndex, retrieve } from '@/lib/rag';
import { detectRouteIntent, getDrivingRoute, routeSummaryToPrompt } from '@/lib/maps';
import { detectUnit, unitContext, getGeneralUnsoldContext, isGeneralUnsoldQuery } from '@/lib/units';

export const runtime = 'nodejs';
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// SOURCE_RULE: chỉ giữ các quy tắc KỸ THUẬT ĐẶC THÙ không có trong persona.md
// (bỏ: quy tắc giọng điệu, không bịa, không chào lặp - đã có trong persona)
const SOURCE_RULE = `

QUY TẮC KỸ THUẬT BỔ SUNG:
- "Căn", "Lô", "Ô", "Unit", "#" là TƯƠNG ĐƯƠNG. Khách hỏi "căn 3" → lấy thông tin "#03"/"Lô 03".
- Q&A CHUẨN HUMAN (03_Human-QA): Nếu câu hỏi khớp/tương tự → BẮT BUỘC sao chép NGUYÊN VĂN 99-100% câu trả lời đó, KHÔNG tự viết lại.
- Khi nhiều nguồn mâu thuẫn, ưu tiên thông tin mới hơn.
- ĐƯỜNG ĐI: Nếu có "DỮ LIỆU TUYẾN ĐƯỜNG THỰC TẾ" → dùng ĐÚNG số km/phút đó. Nếu không có → KHÔNG bịa con số, chỉ mô tả hướng đi chung và mời mở Google Maps.
- LINK/URL: KHÔNG đưa link Google Photos/Drive vào câu trả lời. Thay bằng: "Anh/chị liên hệ tư vấn viên để nhận chi tiết ạ." Ngoại lệ: link Maps trong DỮ LIỆU TUYẾN ĐƯỜNG được phép.`;

async function readRepoFile(name: string): Promise<string> {
  try {
    return await readFile(path.join(process.cwd(), name), 'utf-8');
  } catch {
    return '';
  }
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
    } else if (isGeneralUnsoldQuery(message)) {
      unitContextStr = `\n\n${getGeneralUnsoldContext()}`;
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
  // MỘT bộ rate-limit duy nhất (lib/ratelimit, 20 req/phút/IP - đủ cho power
  // user, chặn spam bot). Trước đây route này có thêm một bộ đếm cục bộ thứ
  // hai chồng lên với ngưỡng khác -> khó hiểu, khó chỉnh.
  if (rateLimited(req, 'chat', 20)) {
    return NextResponse.json(
      { error: 'Too Many Requests', friendly: '⚠️ Bạn gửi quá nhiều tin nhắn, vui lòng đợi 1 phút rồi thử lại nhé 🙏' },
      { status: 429 }
    );
  }
  // Ngân sách thời gian tổng: maxDuration=60s, Vercel giết function ở giây 60 là
  // khách nhận 504 trắng ("Không thể kết nối"). Mọi nhánh bên dưới phải canh
  // theo mốc này để LUÔN kịp trả về một response (dù chỉ là câu xin lỗi).
  const reqT0 = Date.now();
  const elapsed = () => Date.now() - reqT0;
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

    // Nếu chạy trên production, kiểm tra xem request có xuất phát từ tên miền được phép không.
    // So khớp CHÍNH XÁC hoặc subdomain (endsWith '.domain') - KHÔNG dùng includes
    // hai chiều: "nhadat.company.attacker.com" chứa domain cho phép vẫn lọt.
    if (isProd && allowedOrigin && origin) {
      try {
        const allowedDomains = allowedOrigin.split(',').map(d => d.trim().toLowerCase());
        const requestDomain = new URL(origin).hostname.toLowerCase();
        const isAllowed = allowedDomains.some(d => requestDomain === d || requestDomain.endsWith('.' + d));
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
        .slice(-6) // Giới hạn 6 tin nhắn gần nhất (3 lượt hỏi-đáp) để tiết kiệm token
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          // Truncate content dài trong history để tránh tốn token vô ích
          parts: [{ text: m.content.length > 500 ? m.content.slice(0, 500) + '…' : m.content }],
        })),
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

    // 1) Gemini trước. Kể cả tier trả phí, Gemini vẫn thỉnh thoảng trả 429/503
    // ("model overloaded") THOÁNG QUA - gọi lại sau vài giây là qua. Trước đây chỉ
    // gọi đúng 1 lần rồi rơi xuống Groq, Groq cũng hỏng là khách thấy "hệ thống
    // đang bận" -> phải retry Gemini trước khi bỏ cuộc.
    if (GEMINI_API_KEY) {
      // Đo đạc production 25/08: model chính (gemini-flash-latest) trả 503
      // "high demand" ở GẦN NHƯ MỌI lượt, và GROQ_API_KEY trống trong env ->
      // 3 lần 503 liên tiếp là khách ăn "hệ thống đang bận" dù tài khoản
      // Gemini còn tiền. Lưới đỡ thật sự: thử model Gemini DỰ PHÒNG (flash-lite
      // ít nghẽn hơn) trước khi bỏ cuộc - cùng key, không cần dịch vụ khác.
      // gemini-2.5-flash-lite đã bị Google đóng với user mới (404 "no longer
      // available to new users") -> mặc định phải là 3.5-flash-lite.
      const FALLBACK_MODEL = process.env.GEMINI_MODEL_FALLBACK || 'gemini-3.5-flash-lite';
      const attemptPlan = FALLBACK_MODEL && FALLBACK_MODEL !== MODEL
        ? [
            { model: MODEL, delay: 0 },
            { model: MODEL, delay: 2000 },
            { model: FALLBACK_MODEL, delay: 1000 },
            { model: FALLBACK_MODEL, delay: 3000 },
          ]
        : [
            { model: MODEL, delay: 0 },
            { model: MODEL, delay: 2000 },
            { model: MODEL, delay: 4000 },
          ];
      // Model dính lỗi KHÔNG đáng retry (400/403: sai tên model, sai key) thì
      // bỏ qua các lượt còn lại của đúng model đó, vẫn thử model kia.
      let skipModel: string | null = null;

      for (let attempt = 0; attempt < attemptPlan.length; attempt++) {
      const { model, delay } = attemptPlan[attempt];
      if (model === skipModel) continue;
      // Quá 30s mà Gemini vẫn chưa xong -> ngừng retry, nhường thời gian còn lại
      // cho Groq + response lỗi thân thiện, tránh bị giết trắng ở giây 60.
      if (elapsed() > 30000) { console.warn(`[chat] Bỏ Gemini attempt ${attempt + 1}: đã dùng ${elapsed()}ms`); break; }
      if (delay) await new Promise(r => setTimeout(r, delay));

      const generationConfig: any = {
        temperature: 0.7,
        maxOutputTokens: 4096,
      };
      // thinkingConfig chỉ hợp lệ với model 2.5+ (model 2.0/1.5 sẽ trả lỗi 400 nếu gửi kèm)
      if (model.startsWith('gemini-2.5') || model.startsWith('gemini-3')) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      }
      const reqBody = {
        contents,
        system_instruction: { parts: [{ text: systemText }] },
        generationConfig,
      };

      // Timeout CHỜ HEADER: fetch không signal mà Gemini treo trước byte đầu là
      // đứng luôn tới maxDuration. Timer được hủy ngay khi có response để không
      // cắt nhầm stream body đang chạy (body đã có idle-timeout riêng bên dưới).
      const headerAbort = new AbortController();
      const headerTimer = setTimeout(() => headerAbort.abort(), 15000);
      try {
        const geminiResponse = await fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
          signal: headerAbort.signal,
        });
        clearTimeout(headerTimer);

        if (geminiResponse.ok && geminiResponse.body) {
          const reader = geminiResponse.body.getReader();
          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          let full = '';
          let buffer = '';
          let closed = false;

          // Gemini đôi lúc gửi xong chunk cuối mà KHÔNG đóng kết nối SSE -> chờ
          // reader.read() done là function treo tới maxDuration (log "Task timed
          // out after 60 seconds" dù khách đã nhận đủ chữ). Chunk cuối luôn mang
          // finishReason -> chủ động đóng ngay khi thấy nó, không chờ transport.
          const finalize = (controller: ReadableStreamDefaultController) => {
            if (closed) return;
            closed = true;
            try { controller.close(); } catch {}
            const time = new Date().toISOString();
            writeLog('chats', { time, question: message, answer: full }).catch(console.error);
            const phone = extractPhone(message);
            if (phone) writeLog('leads', { time, phone, message }).catch(console.error);
          };

          const handlePayload = (payload: string, controller: ReadableStreamDefaultController): boolean => {
            if (payload === '[DONE]') return true;
            try {
              const json = JSON.parse(payload);
              const piece = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (piece) {
                full += piece;
                controller.enqueue(encoder.encode(piece));
              }
              return Boolean(json.candidates?.[0]?.finishReason);
            } catch {
              return false; // Mảnh JSON chưa trọn vẹn
            }
          };

          // Vòng đọc CHỦ ĐỘNG trong start() thay vì pull(): trên Vercel, consumer
          // có thể ngừng gọi pull() khi đã có dữ liệu đệm -> mọi logic đóng stream
          // đặt trong pull (kể cả idle-timer) không bao giờ chạy nữa và function
          // treo tới maxDuration. start() do chính mình điều khiển từ đầu tới cuối.
          const t0 = Date.now();
          const stream = new ReadableStream({
            async start(controller) {
              let endReason = 'transport_done';
              try {
                while (true) {
                  // Chốt an toàn: đã có chữ mà Gemini im lặng quá 8s -> coi như xong
                  let idleTimer: ReturnType<typeof setTimeout> | undefined;
                  const idle = new Promise<null>(res => { idleTimer = setTimeout(() => res(null), full ? 8000 : 25000); });
                  const result = await Promise.race([reader.read(), idle]);
                  clearTimeout(idleTimer);
                  if (!result) { endReason = 'idle_timeout'; break; }
                  if (result.done) break;
                  buffer += decoder.decode(result.value, { stream: true });
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';
                  let generationEnded = false;
                  for (const line of lines) {
                    const t = line.trim();
                    if (!t.startsWith('data:')) continue;
                    const payload = t.slice(5).trim();
                    if (!payload) continue;
                    if (handlePayload(payload, controller)) generationEnded = true;
                  }
                  // Sự kiện cuối có thể tới KHÔNG kèm newline -> kẹt trong buffer:
                  // parse phần đuôi nếu đã là JSON trọn vẹn, chưa trọn thì chờ thêm.
                  const tail = buffer.trim();
                  if (tail.startsWith('data:')) {
                    const payload = tail.slice(5).trim();
                    if (payload === '[DONE]') { generationEnded = true; buffer = ''; }
                    else if (payload) {
                      try {
                        JSON.parse(payload);
                        if (handlePayload(payload, controller)) generationEnded = true;
                        buffer = '';
                      } catch { /* chưa trọn vẹn */ }
                    }
                  }
                  if (generationEnded) { endReason = 'finish_reason'; break; }
                }
              } catch (e) {
                endReason = `read_error:${e}`;
              }
              console.log(`[chat-stream] ${model} end=${endReason} elapsed=${Date.now() - t0}ms len=${full.length}`);
              finalize(controller);
              reader.cancel().catch(() => {});
            },
            cancel() {
              reader.cancel();
            },
          });

          return new Response(stream, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Cache-Control': 'no-cache',
              'X-Accel-Buffering': 'no',
            },
          });
        } else {
          const errText = await geminiResponse.text();
          // 429/5xx = lỗi tạm thời (quota phút / overloaded) -> đáng retry.
          // 400/403 = sai key/model/request -> retry model này vô ích, nhưng
          // model dự phòng vẫn đáng thử (vd sai tên model chính).
          const retryable = geminiResponse.status === 429 || geminiResponse.status >= 500;
          console.warn(`Gemini API error attempt ${attempt + 1} [${model}] (status ${geminiResponse.status}): ${errText}`);
          if (!retryable) skipModel = model;
        }
      } catch (err) {
        clearTimeout(headerTimer);
        console.warn(`Gemini API network error attempt ${attempt + 1} [${model}]:`, err);
      }
      }
    }

    // 2) Fallback: Groq (miễn phí, dùng khi Gemini hết quota)
    const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
    if (!GROQ_API_KEY) console.warn('[chat] GROQ_API_KEY trống trong env - Gemini lỗi là khách nhận "hệ thống đang bận" ngay, không có lưới đỡ');

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
        // Chừa lại ~8s cuối cho response lỗi thân thiện - đừng để Vercel giết trắng.
        if (elapsed() > 45000) { console.warn(`[chat] Bỏ Groq attempt ${attempt + 1}: đã dùng ${elapsed()}ms`); break; }
        if (attempt > 0) await new Promise(r => setTimeout(r, GROQ_RETRY_DELAYS[attempt - 1]));
        // Timeout chờ header - cùng lý do với nhánh Gemini ở trên.
        const headerAbort = new AbortController();
        const headerTimer = setTimeout(() => headerAbort.abort(), 10000);
        try {
          const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            signal: headerAbort.signal,
            body: JSON.stringify({
              // Groq đã khai tử các model Llama chat (llama-3.3-70b trả 404 model_not_found)
              // -> mặc định dùng gpt-oss-120b (production tier hiện tại), đổi được qua env.
              model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
              messages,
              temperature: 0.7,
              max_tokens: 4096,
              stream: true,
            }),
          });
          clearTimeout(headerTimer);

          if (groqResponse.ok && groqResponse.body) {
            const reader = groqResponse.body.getReader();
            const decoder = new TextDecoder();
            const encoder = new TextEncoder();
            let full = '';
            let buffer = '';
            let closed = false;

            // Cùng lý do với Gemini ở trên: đóng chủ động khi thấy tín hiệu hết
            // sinh chữ ([DONE]/finish_reason), không chờ transport đóng kết nối.
            const finalize = (controller: ReadableStreamDefaultController) => {
              if (closed) return;
              closed = true;
              try { controller.close(); } catch {}
              const time = new Date().toISOString();
              writeLog('chats', { time, question: message, answer: full }).catch(console.error);
              const phone = extractPhone(message);
              if (phone) writeLog('leads', { time, phone, message }).catch(console.error);
            };

            const handlePayload = (payload: string, controller: ReadableStreamDefaultController): boolean => {
              if (payload === '[DONE]') return true;
              try {
                const json = JSON.parse(payload);
                const piece = json.choices?.[0]?.delta?.content || '';
                if (piece) {
                  full += piece;
                  controller.enqueue(encoder.encode(piece));
                }
                return Boolean(json.choices?.[0]?.finish_reason);
              } catch {
                return false; // Mảnh JSON chưa trọn vẹn
              }
            };

            // Vòng đọc chủ động trong start() - cùng lý do với nhánh Gemini ở trên
            const t0 = Date.now();
            const stream = new ReadableStream({
              async start(controller) {
                let endReason = 'transport_done';
                try {
                  while (true) {
                    let idleTimer: ReturnType<typeof setTimeout> | undefined;
                    const idle = new Promise<null>(res => { idleTimer = setTimeout(() => res(null), full ? 8000 : 25000); });
                    const result = await Promise.race([reader.read(), idle]);
                    clearTimeout(idleTimer);
                    if (!result) { endReason = 'idle_timeout'; break; }
                    if (result.done) break;
                    buffer += decoder.decode(result.value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    let generationEnded = false;
                    for (const line of lines) {
                      const t = line.trim();
                      if (!t.startsWith('data:')) continue;
                      const payload = t.slice(5).trim();
                      if (!payload) continue;
                      if (handlePayload(payload, controller)) generationEnded = true;
                    }
                    const tail = buffer.trim();
                    if (tail.startsWith('data:')) {
                      const payload = tail.slice(5).trim();
                      if (payload === '[DONE]') { generationEnded = true; buffer = ''; }
                      else if (payload) {
                        try {
                          JSON.parse(payload);
                          if (handlePayload(payload, controller)) generationEnded = true;
                          buffer = '';
                        } catch { /* chưa trọn vẹn */ }
                      }
                    }
                    if (generationEnded) { endReason = 'finish_reason'; break; }
                  }
                } catch (e) {
                  endReason = `read_error:${e}`;
                }
                console.log(`[chat-stream] groq end=${endReason} elapsed=${Date.now() - t0}ms len=${full.length}`);
                finalize(controller);
                reader.cancel().catch(() => {});
              },
              cancel() {
                reader.cancel();
              },
            });

            return new Response(stream, {
              headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
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
          clearTimeout(headerTimer);
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
