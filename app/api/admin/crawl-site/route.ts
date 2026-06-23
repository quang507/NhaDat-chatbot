import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

async function fetchPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// API này nhận 1 batch URLs (tối đa 5) → trả về nội dung text đã xử lý
// Client sẽ gọi nhiều lần thay vì gọi 1 lần duy nhất (tránh timeout Vercel)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { urls } = await req.json();
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'Thiếu danh sách URLs' }, { status: 400 });
    }

    // Giới hạn 5 trang mỗi batch để không timeout
    const batch = urls.slice(0, 5);
    const { convert } = await import('html-to-text');
    const results: { url: string; text: string }[] = [];

    for (const url of batch) {
      const html = await fetchPage(url);
      if (!html) continue;

      const text = convert(html, {
        wordwrap: false,
        selectors: [
          { selector: 'script', format: 'skip' },
          { selector: 'style', format: 'skip' },
          { selector: 'nav', format: 'skip' },
          { selector: 'footer', format: 'skip' },
          { selector: 'header', format: 'skip' },
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' },
        ],
      }).trim();

      if (text.length > 200) {
        results.push({ url, text });
      }
    }

    const markdown = results
      .map(r => `\n\n## Nguồn: ${r.url}\n\n${r.text}`)
      .join('\n');

    return NextResponse.json({ markdown, pages: results.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
