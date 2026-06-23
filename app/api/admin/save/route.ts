import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, saveFile } from '@/lib/admin';
import { saveConfig, BotConfig } from '@/lib/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Lưu data.md, persona.md và/hoặc config.json lên GitHub
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { content, persona, config } = await req.json();
    const tasks: Promise<void>[] = [];
    if (typeof content === 'string') tasks.push(saveFile('data.md', content, 'Cập nhật data.md từ trang admin'));
    if (typeof persona === 'string') tasks.push(saveFile('persona.md', persona, 'Cập nhật văn phong bot từ trang admin'));
    if (config && typeof config === 'object') tasks.push(saveConfig(config as BotConfig));
    const results = await Promise.allSettled(tasks);
    const errors = results.flatMap((r, i) =>
      r.status === 'rejected' ? [`task ${i}: ${String(r.reason)}`] : []
    );
    if (errors.length) return NextResponse.json({ error: errors.join('; ') }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
