// Nhận TỔNG HỢP PHIÊN từ client (chat widget / màn slide / voice) và bắn
// MỘT tin Telegram duy nhất cho cả phiên hỏi-đáp của một khách.
//
// Client gọi lúc: (1) khách im lặng quá hạn phiên, (2) khách rời trang
// (navigator.sendBeacon - vì beacon không đặt được header tùy chỉnh nên token
// xác thực nằm trong BODY, không phải header như /api/chat).
import { NextRequest, NextResponse } from 'next/server';
import { rateLimited } from '@/lib/ratelimit';
import { sendSessionDigest, type SessionPair } from '@/lib/logs';

export const runtime = 'nodejs';

// khớp x-chat-handshake của /api/chat (token nằm trong bundle client nên chỉ
// chặn được bot ngu ngơ - lớp chặn thật là rate limit bên dưới)
const TOKEN = process.env.CHAT_HANDSHAKE_TOKEN || 'npd-mktg-handshake';

export async function POST(req: NextRequest) {
  // Mỗi request hợp lệ = 1 tin Telegram + 1 commit GitHub -> phải rate-limit
  // chặt (1 khách thật chỉ chốt sổ vài lần/phiên).
  if (rateLimited(req, 'log-session', 6)) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu' }, { status: 429 });
  }
  try {
    const body = await req.json();
    if (body?.token !== TOKEN) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const source = typeof body.source === 'string' ? body.source.slice(0, 20) : 'chat';
    const raw = Array.isArray(body.transcript) ? body.transcript : [];
    const transcript: SessionPair[] = raw
      .filter((p: unknown): p is { q: unknown; a?: unknown } => !!p && typeof p === 'object')
      .map((p: { q?: unknown; a?: unknown }) => ({
        q: String(p.q ?? '').slice(0, 500),
        a: p.a ? String(p.a).slice(0, 600) : undefined,
      }))
      .filter((p: SessionPair) => p.q.trim());

    if (!transcript.length) return NextResponse.json({ ok: true, skipped: true });

    await sendSessionDigest({
      source,
      transcript,
      startedAt: typeof body.startedAt === 'string' ? body.startedAt.slice(0, 40) : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[log-session]', e);
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
