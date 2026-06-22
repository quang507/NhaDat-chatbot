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
    if (typeof content === 'string') {
      await saveFile('data.md', content, 'Cập nhật data.md từ trang admin');
    }
    if (typeof persona === 'string') {
      await saveFile('persona.md', persona, 'Cập nhật văn phong bot từ trang admin');
    }
    if (config && typeof config === 'object') {
      await saveConfig(config as BotConfig);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
