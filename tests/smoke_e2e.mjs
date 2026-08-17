#!/usr/bin/env node
// ============================================================================
// SMOKE TEST E2E bản web (production hoặc preview)
//
// Cách dùng:
//   node tests/smoke_e2e.mjs                                    # mặc định prod
//   node tests/smoke_e2e.mjs --url https://xxx.vercel.app       # preview
//
// Kiểm tra: trang chính trả 200, /api/config đúng schema, /api/chat chặn
// request thiếu token + trả stream khi có token, /api/slide tĩnh trả nhanh,
// /api/log-session chặn thiếu token, kèm đo thời gian từng bước.
// Exit code != 0 khi có bước FAIL -> dùng được trong CI.
// ============================================================================

const BASE = (() => {
  const i = process.argv.indexOf('--url');
  return (i >= 0 && process.argv[i + 1]) || 'https://nha-dat-chatbot.vercel.app';
})();
const HANDSHAKE = process.env.CHAT_HANDSHAKE_TOKEN || 'npd-mktg-handshake';

let fail = 0;
const ok = (name, ms, extra = '') => console.log(`✅ ${name} (${ms}ms)${extra ? ' - ' + extra : ''}`);
const bad = (name, ms, why) => { console.log(`❌ ${name} (${ms}ms) - ${why}`); fail = 1; };

async function step(name, fn) {
  const t0 = Date.now();
  try {
    const extra = await fn();
    ok(name, Date.now() - t0, extra || '');
  } catch (e) {
    bad(name, Date.now() - t0, e.message || String(e));
  }
}

// ── Trang tĩnh ──────────────────────────────────────────────────────────────
for (const path of ['/', '/embed', '/slide', '/voice', '/companion']) {
  await step(`GET ${path}`, async () => {
    const r = await fetch(BASE + path);
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  });
}

// ── /api/config: đúng schema ────────────────────────────────────────────────
await step('GET /api/config', async () => {
  const r = await fetch(`${BASE}/api/config`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j.suggestions)) throw new Error('thiếu suggestions[]');
  return `${j.suggestions.length} gợi ý`;
});

// ── /api/chat: BẢO MẬT - thiếu token phải bị chặn 403 ───────────────────────
await step('POST /api/chat KHÔNG token -> 403', async () => {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'hello' }),
  });
  if (r.status !== 403) throw new Error(`kỳ vọng 403, nhận ${r.status}`);
});

// ── /api/chat: có token -> stream chữ về ────────────────────────────────────
await step('POST /api/chat có token -> stream', async () => {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-chat-handshake': HANDSHAKE },
    body: JSON.stringify({ message: "Dự án Ny'ah Phú Định ở đâu?", history: [] }),
  });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const text = await r.text();
  if (!text || text.length < 30) throw new Error(`trả lời quá ngắn: "${text.slice(0, 60)}"`);
  if (/phú định|q\.?8|quận 8|trương đình hội/i.test(text) === false)
    throw new Error(`trả lời không nhắc tới dự án: "${text.slice(0, 100)}"`);
  return `${text.length} ký tự`;
});

// ── /api/slide: nhánh tĩnh phải NHANH và đúng chủ đề ────────────────────────
await step('POST /api/slide "vị trí dự án" (static)', async () => {
  const r = await fetch(`${BASE}/api/slide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'cho khách xem vị trí dự án', ambient: true }),
  });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.skip) throw new Error(`bị skip: ${j.reason || ''}`);
  if (!j.title) throw new Error('không có title');
  return `"${j.title}" · ${j._source || '?'}`;
});

// ── /api/slide: câu tám chuyện phải bị SKIP (không đốt LLM) ─────────────────
await step('POST /api/slide câu xã giao -> skip', async () => {
  const r = await fetch(`${BASE}/api/slide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'dạ vâng em cảm ơn anh nhiều', ambient: true }),
  });
  const j = await r.json();
  if (!j.skip) throw new Error(`kỳ vọng skip, nhận title="${j.title || ''}"`);
});

// ── /api/log-session: thiếu token phải bị chặn ──────────────────────────────
await step('POST /api/log-session KHÔNG token -> 403', async () => {
  const r = await fetch(`${BASE}/api/log-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript: [{ q: 'spam' }] }),
  });
  if (r.status !== 403) throw new Error(`kỳ vọng 403, nhận ${r.status}`);
});

// ── /api/tts: trả audio ─────────────────────────────────────────────────────
await step('GET /api/tts', async () => {
  const r = await fetch(`${BASE}/api/tts?text=${encodeURIComponent('Xin chào anh chị')}`);
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength < 3000) throw new Error(`audio quá nhỏ: ${buf.byteLength} bytes`);
  return `${(buf.byteLength / 1024).toFixed(0)}KB audio`;
});

console.log(fail ? '\n❌ CÓ BƯỚC FAIL' : '\n✅ TẤT CẢ PASS');
process.exit(fail);
