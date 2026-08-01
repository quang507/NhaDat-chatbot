// Nhận TỔNG HỢP PHIÊN từ client (chat widget / màn slide / voice) và bắn
// MỘT tin Telegram duy nhất cho cả phiên hỏi-đáp của một khách.
//
// Client gọi lúc: (1) khách im lặng quá hạn phiên, (2) khách rời trang
// (navigator.sendBeacon - vì beacon không đặt được header tùy chỉnh nên token
// xác thực nằm trong BODY, không phải header như /api/chat).
import { NextRequest, NextResponse } from 'next/server';
import { sendSessionDigest, type SessionPair } from '@/lib/logs';

export const runtime = 'nodejs';

const TOKEN = 'npd-mktg-handshake'; // khớp x-chat-handshake của /api/chat

export async function POST(req: NextRequest) {
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
