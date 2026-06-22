import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// Lấy các link cùng domain trong HTML
function extractLinks(html: string, base: URL): string[] {
  const links = new Set<string>();
  const re = /href\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], base);
      if (u.hostname === base.hostname && (u.protocol === 'http:' || u.protocol === 'https:')) {
        u.hash = '';
        // bỏ link file tĩnh
        if (!/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|css|js|ico|mp4|mp3)$/i.test(u.pathname)) {
          links.add(u.toString());
        }
      }
    } catch {
      /* link không hợp lệ, bỏ qua */
    }
  }
  return Array.from(links);
}

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

// Crawl đệ quy cùng domain (BFS) đến tối đa maxPages trang, trong giới hạn thời gian
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const { url, maxPages } = await req.json();
    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Thiếu URL' }, { status: 400 });
    }

    const limit = Math.min(Math.max(Number(maxPages) || 20, 1), 40);
    const base = new URL(url);
    const { convert } = await import('html-to-text');

    const visited = new Set<string>();
    const queue: string[] = [base.toString()];
    const results: { url: string; text: string }[] = [];
    const deadline = Date.now() + 100_000; // ~100s, chừa thời gian trả về

    while (queue.length > 0 && results.length < limit && Date.now() < deadline) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const html = await fetchPage(current);
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

      if (text.length > 200) results.push({ url: current, text });

      // thêm link con vào hàng đợi
      if (results.length < limit) {
        for (const link of extractLinks(html, base)) {
          if (!visited.has(link)) queue.push(link);
        }
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { error: 'Không lấy được nội dung nào (có thể web chặn bot hoặc dùng JavaScript động).' },
        { status: 400 }
      );
    }

    const markdown = results
      .map(r => `\n\n## Nguồn: ${r.url}\n\n${r.text}`)
      .join('\n');

    return NextResponse.json({ markdown, pages: results.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
