// ============================================================================
// SERVER SHOWROOM (B1 - docs/PORTRAIT_75_TECHSPEC.md §5)
//
// Bun + ElysiaJS chạy trên mini-PC đặt tại showroom, phục vụ TV 75" dọc:
//   • /api/slide, /api/transcribe, /api/tts, /api/log-session — TÁI DÙNG
//     nguyên khối các route handler của Next (app/api/*/route.ts). Handler là
//     hàm Web-standard (Request) => Response nên gọi thẳng được dưới Bun,
//     KHÔNG copy logic — sửa một nơi chạy cả Vercel lẫn LAN.
//   • /images/*, /images_bg/* — ảnh tĩnh cache immutable (ảnh đổi là đổi tên
//     file, không đổi nội dung cùng tên).
//   • / — bản Next static export trong out/ nếu đã build (B3); chưa có thì
//     trang hướng dẫn.
//
// Chạy:  bun server/index.ts          (từ repo root - npm run server)
//   hay: cd server && bun run start   (index.ts tự chdir về repo root)
// Env:   PORT (mặc định 3080) + các key trong .env ở repo root (Bun tự nạp
//        .env theo cwd - vì vậy phải chdir về root TRƯỚC khi import route).
// ============================================================================

import path from 'node:path';
import { existsSync } from 'node:fs';

// Route handler đọc dữ liệu (index.json, data/, config.json) theo process.cwd()
// giống hệt trên Vercel -> chốt cwd = repo root trước mọi import động.
const ROOT = path.resolve(import.meta.dir, '..');
process.chdir(ROOT);

const { Elysia } = await import('elysia');
const { POST: slidePost } = await import('../app/api/slide/route');
const { POST: transcribePost } = await import('../app/api/transcribe/route');
const { GET: ttsGet } = await import('../app/api/tts/route');
const { POST: logSessionPost } = await import('../app/api/log-session/route');
const { runSlidePipeline } = await import('./slide-pipeline');
const { parseMsg, RESUME_SEQ } = await import('../lib/ws-protocol');
type TvToServer = import('../lib/ws-protocol').TvToServer;
type CompanionToServer = import('../lib/ws-protocol').CompanionToServer;
type ServerToTv = import('../lib/ws-protocol').ServerToTv;
type ServerToCompanion = import('../lib/ws-protocol').ServerToCompanion;
type SlideData = import('../lib/slide-types').SlideData;

const PORT = Number(process.env.PORT || 3080);
const PUBLIC_DIR = path.join(ROOT, 'public');
const OUT_DIR = path.join(ROOT, 'out'); // next build với output:'export' (B3)

// ── CORS ──────────────────────────────────────────────────────────────────
// Giai đoạn chuyển tiếp B1: app TV có thể vẫn chạy từ origin Vercel nhưng gọi
// API qua LAN -> mở CORS cho /api/*. Sang B3 (server tự serve app) thì cùng
// origin, CORS thành vô hại.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;
const withCors = (res: Response) => {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
};

// Handler của Next nhận NextRequest nhưng chỉ dùng API Web-standard
// (json/formData/headers/url) -> Request thường của Bun chạy được; cast cho TS.
type NextHandler = (req: Request) => Promise<Response> | Response;
const callNext = async (h: NextHandler, request: Request) => {
  try {
    return withCors(await h(request));
  } catch (e: any) {
    console.error('[server] handler lỗi:', e);
    return withCors(Response.json({ error: String(e?.message || e) }, { status: 500 }));
  }
};

// ── File tĩnh (chặn path traversal, cache dài) ────────────────────────────
async function serveFile(baseDir: string, rel: string, cache: string): Promise<Response | null> {
  const p = path.normalize(path.join(baseDir, decodeURIComponent(rel)));
  if (!p.startsWith(baseDir + path.sep) && p !== baseDir) return null; // thoát khỏi baseDir -> chặn
  const file = Bun.file(p);
  if (!(await file.exists())) return null;
  return new Response(file, { headers: { 'Cache-Control': cache } });
}
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=300';

// Trang giữ chỗ khi chưa có bản static export (chưa chạy B3).
const PLACEHOLDER = `<!doctype html><html lang="vi"><meta charset="utf-8">
<title>Nhã Đạt — Server Showroom</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0c12;color:#fff;font-family:system-ui">
<div style="text-align:center;max-width:36rem;padding:2rem">
<p style="color:#e8b84b;letter-spacing:.3em;text-transform:uppercase;font-size:.8rem">Nhã Đạt · Showroom Server</p>
<h1 style="font-weight:800">Server đang chạy ✔</h1>
<p style="color:#94a3b8;line-height:1.7">API slide/transcribe/tts đã sẵn sàng tại <code>/api/*</code>, ảnh tại <code>/images/*</code>.<br>
Chưa có bản build giao diện TV (<code>out/</code>). Build bằng <code>next build</code> với <code>output: 'export'</code> (bước B3) rồi khởi động lại server.</p>
</div></body></html>`;

const startedAt = Date.now();

// ── WEBSOCKET EVENT BUS (B2 - tech-spec §5.3) ──────────────────────────────
// Một showroom = một "phòng": mọi TV nhận cùng luồng slide, mọi Companion
// (điện thoại Sale) điều khiển cùng các TV. WS chỉ chở event JSON - ảnh vẫn
// đi đường HTTP tĩnh có cache.
const tvs = new Set<any>();
const companions = new Set<any>();
// Slide hiện hành - TV (re)connect là nhận lại ngay (resume, seq = RESUME_SEQ).
let lastSlide: SlideData | null = null;
let lastSlideSeq = 0;

const sendTo = (ws: any, msg: unknown) => { try { ws.send(JSON.stringify(msg)); } catch {} };
const broadcastTvs = (msg: ServerToTv) => { for (const ws of tvs) sendTo(ws, msg); };
const broadcastCompanions = (msg: ServerToCompanion) => { for (const ws of companions) sendTo(ws, msg); };
// Elysia có thể đã parse JSON sẵn hoặc đưa chuỗi thô - nhận cả hai.
const asMsg = <T,>(m: unknown): T | null =>
  (m && typeof m === 'object' && 't' in (m as any)) ? (m as T) : parseMsg<T>(m as any);

const emitPipeline = (msg: ServerToTv) => {
  // Ghi sổ slide hiện hành để resume; refine chèn vào bản đã lưu.
  if (msg.t === 'SLIDE_READY' && !msg.interim) { lastSlide = msg.data; lastSlideSeq = msg.seq; }
  if (msg.t === 'REFINE_READY' && lastSlide && msg.seq === lastSlideSeq) lastSlide = { ...lastSlide, ...msg.patch };
  broadcastTvs(msg);
};

const app = new Elysia()
  // ── WS event bus: MỘT endpoint /ws duy nhất, phân vai qua *_HELLO ─────
  // (2 route .ws riêng /ws/tv + /ws/companion từng bị router nuốt vào
  // catch-all GET chập chờn -> upgrade trả HTTP thường. Một route + vai
  // trong message đầu tiên thì không còn chỗ cho nhầm route.)
  .ws('/ws', {
    // Heartbeat client 10s giữ kết nối sống; client chết không FIN (rút điện,
    // treo) bị dọn sau idleTimeout -> không tích tụ socket ma trong tvs/companions.
    idleTimeout: 60,
    open(ws) {
      console.log('[ws] Kết nối mới - chờ HELLO phân vai');
    },
    close(ws) {
      const wasTv = tvs.delete(ws);
      companions.delete(ws);
      if (wasTv) broadcastCompanions({ t: 'TV_COUNT', count: tvs.size });
    },
    message(ws, raw) {
      const msg = asMsg<TvToServer | CompanionToServer>(raw);
      if (!msg) return;
      switch (msg.t) {
        case 'PING': sendTo(ws, { t: 'PONG' }); break;

        case 'TV_HELLO':
          tvs.add(ws);
          console.log(`[ws] TV nối (${tvs.size} TV)`);
          if (lastSlide) sendTo(ws, { t: 'SLIDE_READY', seq: RESUME_SEQ, data: lastSlide } satisfies ServerToTv);
          broadcastCompanions({ t: 'TV_COUNT', count: tvs.size });
          break;
        case 'SPEECH':
          console.log(`[ws] SPEECH #${msg.seq}: "${msg.text.slice(0, 60)}"`);
          void runSlidePipeline(msg.seq, msg.text, msg.recent || [], emitPipeline);
          break;
        case 'TV_STATE':
          broadcastCompanions({ t: 'TV_STATE', state: msg.state, slideId: msg.slideId, title: msg.title });
          break;

        case 'COMPANION_HELLO':
          companions.add(ws);
          console.log(`[ws] Companion nối (${companions.size})`);
          sendTo(ws, { t: 'TV_COUNT', count: tvs.size } satisfies ServerToCompanion);
          break;
        case 'SALE_CMD':
          if (msg.cmd === 'CLEAR') { lastSlide = null; } // TV reconnect không resume slide đã xoá
          broadcastTvs({ t: 'SALE_CMD', cmd: msg.cmd, arg: msg.arg });
          break;
        case 'OVERRIDE_QUERY':
          broadcastTvs({ t: 'OVERRIDE_QUERY', text: msg.text });
          break;
      }
    },
  })
  // API — tái dùng handler của Next
  .post('/api/slide', ({ request }) => callNext(slidePost as unknown as NextHandler, request))
  .post('/api/transcribe', ({ request }) => callNext(transcribePost as unknown as NextHandler, request))
  .get('/api/tts', ({ request }) => callNext(ttsGet as unknown as NextHandler, request))
  .post('/api/log-session', ({ request }) => callNext(logSessionPost as unknown as NextHandler, request))
  .options('/api/*', () => new Response(null, { status: 204, headers: CORS_HEADERS }))

  // Sức khỏe hệ thống - cho script giám sát/kiosk kiểm tra
  .get('/healthz', () => Response.json({
    ok: true,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    indexLoaded: existsSync(path.join(ROOT, 'index.json')),
    staticExport: existsSync(path.join(OUT_DIR, 'index.html')),
  }))

  // Ảnh: cache 1 năm immutable (đổi ảnh = đổi tên file)
  .get('/images/*', async ({ params }) =>
    (await serveFile(path.join(PUBLIC_DIR, 'images'), params['*'], IMMUTABLE))
      ?? new Response('Not found', { status: 404 }))
  .get('/images_bg/*', async ({ params }) =>
    (await serveFile(path.join(PUBLIC_DIR, 'images_bg'), params['*'], IMMUTABLE))
      ?? new Response('Not found', { status: 404 }))

  // Còn lại: bản static export (out/) trước, rồi public/ (logo.svg, favicon...),
  // cuối cùng là trang giữ chỗ.
  .get('/*', async ({ params }) => {
    const rel = params['*'] || '';
    if (existsSync(OUT_DIR)) {
      const tries = rel === '' ? ['index.html'] : [rel, `${rel}.html`, path.join(rel, 'index.html')];
      for (const t of tries) {
        const r = await serveFile(OUT_DIR, t, rel.startsWith('_next/') ? IMMUTABLE : SHORT);
        if (r) return r;
      }
    }
    const pub = await serveFile(PUBLIC_DIR, rel, SHORT);
    if (pub) return pub;
    if (rel === '') return new Response(PLACEHOLDER, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    return new Response('Not found', { status: 404 });
  })

  .listen({ port: PORT, hostname: '0.0.0.0' });

console.log(`[server] Nhã Đạt showroom server chạy tại http://0.0.0.0:${PORT}`);
console.log(`[server] cwd=${process.cwd()} · index.json=${existsSync(path.join(ROOT, 'index.json')) ? 'OK' : 'THIẾU'} · static export=${existsSync(path.join(OUT_DIR, 'index.html')) ? 'OK' : 'chưa build (B3)'}`);

export type App = typeof app;
