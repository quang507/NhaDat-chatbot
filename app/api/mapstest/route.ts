import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ENDPOINT CHAN DOAN TAM — kiem tra key nao THUC SU chay tren production. XOA sau khi test.
// Khong lo key (chi tra do dai + trang thai + body loi).
export async function GET() {
  const out: any = {};

  const mask = (k?: string) => (k ? { present: true, len: k.length, tail: k.slice(-4) } : { present: false });
  const GEMINI = process.env.GEMINI_API_KEY || '';
  const GROQ = process.env.GROQ_API_KEY || '';
  const MAPS = process.env.GOOGLE_MAPS_API_KEY || '';
  const DG = process.env.DEEPGRAM_API_KEY || '';
  const GH = process.env.GITHUB_TOKEN || '';
  out.keys = { GEMINI: mask(GEMINI), GROQ: mask(GROQ), GOOGLE_MAPS: mask(MAPS), DEEPGRAM: mask(DG), GITHUB: mask(GH) };

  // 1) GOOGLE ROUTES API
  if (MAPS) {
    try {
      const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': MAPS, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
        body: JSON.stringify({ origin: { address: 'bệnh viện chợ rẫy, TP.HCM, Việt Nam' }, destination: { address: "58A Trương Đình Hội, Phường 16, Quận 8, TP.HCM" }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'vi-VN', units: 'METRIC' }),
      });
      out.routesApi = { status: r.status, body: (await r.text()).slice(0, 500) };
    } catch (e) { out.routesApi = { error: String(e) }; }
  } else out.routesApi = 'NO KEY';

  // 2) GROQ
  if (GROQ) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      });
      out.groqApi = { status: r.status, body: (await r.text()).slice(0, 300) };
    } catch (e) { out.groqApi = { error: String(e) }; }
  } else out.groqApi = 'NO KEY';

  // 3) GEMINI (embed nho)
  if (GEMINI) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 5 } }),
      });
      out.geminiApi = { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e) { out.geminiApi = { error: String(e) }; }
  } else out.geminiApi = 'NO KEY';

  return NextResponse.json(out);
}
