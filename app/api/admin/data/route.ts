import { NextRequest, NextResponse } from 'next/server';
import { checkAuth, getFile, DEFAULT_PERSONA } from '@/lib/admin';
import { getConfig } from '@/lib/config';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: TreeNode[];
}

async function getTree(dir: string, baseDir: string): Promise<TreeNode[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nodes: TreeNode[] = [];
    for (const entry of entries) {
      if (
        entry.name.startsWith('.') || 
        entry.name.startsWith('~') || 
        entry.name === 'Thumbs.db' ||
        entry.name === 'drive-extracted' ||
        entry.name === '03_Human-QA' ||
        entry.name === 'qa-generated.md' ||
        entry.name.includes('BÁO CÁO CƠ SỞ DỮ LIỆU TỔNG LỰC')
      ) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      
      if (entry.isDirectory()) {
        const children = await getTree(fullPath, baseDir);
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'directory',
          children: children.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name, 'vi');
          })
        });
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (!['.md', '.txt', '.docx', '.xlsx', '.xls', '.csv'].includes(ext)) {
          continue;
        }
        const stat = await fs.stat(fullPath);
        nodes.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: stat.size
        });
      }
    }
    return nodes;
  } catch (e) {
    console.error('Lỗi khi quét thư mục data:', e);
    return [];
  }
}

// Đăng nhập + lấy nội dung thư mục data/ (dạng sơ đồ cây), persona.md và config hiện tại
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  try {
    const dataDir = path.join(process.cwd(), 'data');
    
    // Đảm bảo thư mục data/ tồn tại
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch {}

    const [tree, persona, config] = await Promise.all([
      getTree(dataDir, dataDir),
      getFile('persona.md'),
      getConfig()
    ]);

    // Sắp xếp các thư mục/file ở cấp ngoài cùng
    const sortedTree = tree.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name, 'vi');
    });

    return NextResponse.json({
      tree: sortedTree,
      persona: persona.content || DEFAULT_PERSONA,
      config,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

