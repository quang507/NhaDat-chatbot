import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 30;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Trích xuất tất cả links cùng domain từ một trang
function extractLinks(html: string, base: URL): string[] {
  const links = new Set<string>();
  const re = /href\s*=\s*["']([^"'#?]+)[^"']*["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname === base.hostname && (u.protocol === 'http:' || u.protocol === 'https:')) {
        u.hash = '';
        u.search = '';
        if (!/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js|ico|mp4|mp3|woff|woff2|ttf|eot)$/i.test(u.pathname)) {
          links.add(u.toString());
        }
      }
    } catch { /* link không hợp lệ */ }
  }
  return Array.from(links);
}

// API: Nhận 1 URL → trả về danh sách tất cả links tìm được + nội dung trang gốc
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Thiếu URL' }, { status: 400 });
    }

    const base = new URL(url);
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) return NextResponse.json({ error: `Không tải được: ${res.status}` }, { status: 400 });

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return NextResponse.json({ error: 'Trang không phải HTML' }, { status: 400 });

    const html = await res.text();
    const links = extractLinks(html, base);

    // Cũng trả về nội dung trang gốc ngay
    const { convert } = await import('html-to-text');
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

    return NextResponse.json({
      links,
      homeText: text.length > 200 ? text : null,
      totalFound: links.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
