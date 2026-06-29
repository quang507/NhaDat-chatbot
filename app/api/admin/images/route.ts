import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

interface ImgNode {
  name: string;
  path: string;       // đường dẫn tương đối trong public/images
  type: 'file' | 'directory';
  size?: number;
  url?: string;       // URL public: /images/<...> (đã encode)
  children?: ImgNode[];
}

const IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif'];

async function getTree(dir: string, baseDir: string): Promise<ImgNode[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const nodes: ImgNode[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~') || entry.name === 'Thumbs.db') continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(baseDir, full).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      const children = await getTree(full, baseDir);
      if (children.length) nodes.push({ name: entry.name, path: rel, type: 'directory', children });
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMG_EXT.includes(ext)) continue;
      let size = 0;
      try { size = (await fs.stat(full)).size; } catch {}
      const url = '/images/' + rel.split('/').map(encodeURIComponent).join('/');
      nodes.push({ name: entry.name, path: rel, type: 'file', size, url });
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'vi');
  });
}

function countFiles(nodes: ImgNode[]): number {
  return nodes.reduce((n, node) => n + (node.type === 'file' ? 1 : countFiles(node.children || [])), 0);
}

// Lấy cây hình ảnh trong public/images (để admin xem giống cây thư mục text)
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const imagesDir = path.join(process.cwd(), 'public', 'images');
    const tree = await getTree(imagesDir, imagesDir);
    return NextResponse.json({ tree, count: countFiles(tree) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
