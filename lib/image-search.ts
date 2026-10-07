// CHỌN ẢNH THEO NGỮ NGHĨA (thay cho so khớp từ khóa khi đính ảnh vào câu trả lời).
//
// image_index.json do scripts/build-image-index.mjs sinh ra: MỖI ẢNH một vector
// (thư mục + tên file đã đặt chuẩn + mô tả vision). Khác với generated_images_metadata.md
// trong index.json chính - file đó bị chia chunk 1800 ký tự nên ~8 ảnh dồn chung
// một vector, không dùng để chọn từng ảnh được.
//
// Câu hỏi khách + câu trả lời bot -> embed (cùng model, cùng số chiều với index)
// -> cosine với từng ảnh -> lấy top-k đủ ngưỡng, bỏ ảnh "giữ chỗ".
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { embedQuery } from '@/lib/rag';

export interface ImageEntry {
  url: string;          // /images/... (đã encode)
  rel: string;          // đường dẫn trong public/images
  desc: string;
  placeholder: boolean; // ảnh minh họa giữ chỗ -> không bao giờ đính
  vec: number[];        // đã chuẩn hóa
}
interface ImageIndex { model: string; dim: number; builtAt: string; images: ImageEntry[] }

export interface ImageHit { url: string; score: number; desc: string }

// 0.68: thử trên 6 câu thật - câu đúng chủ đề có ảnh đầu >= 0.71, câu lạc đề
// (pháp lý - chưa có ảnh giấy tờ) chỉ ~0.65. Chỉnh qua env khi cần.
const MIN_SCORE = Number(process.env.IMAGE_MIN_SCORE) || 0.68;
// Ảnh thứ 2, 3 phải sát điểm ảnh đầu - tránh đính kèm ảnh "đủ ngưỡng" nhưng lạc đề.
const MAX_GAP = Number(process.env.IMAGE_MAX_GAP) || 0.05;

let cached: ImageIndex | null = null;
let loading: Promise<ImageIndex | null> | null = null;

async function loadImageIndex(): Promise<ImageIndex | null> {
  if (cached) return cached;
  if (!loading) {
    loading = (async () => {
      const p = path.join(process.cwd(), 'image_index.json');
      if (!existsSync(p)) return null;
      try {
        const idx = JSON.parse(await readFile(p, 'utf-8')) as ImageIndex;
        if (!idx?.images?.length || !idx.dim) return null;
        cached = idx;
        return idx;
      } catch (e) {
        console.warn('[ImageSearch] Đọc image_index.json lỗi:', e);
        return null;
      } finally {
        loading = null;
      }
    })();
  }
  return loading;
}

// Bỏ markdown + câu xin số điện thoại/CTA chung chung - chỉ làm nhiễu vector.
function cleanText(s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/[*_#>`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function queryVec(idx: ImageIndex, question: string, answer: string): Promise<number[] | null> {
  const query = cleanText(`${question}\n${answer.slice(0, 800)}`);
  if (!query) return null;
  const q = await embedQuery(query, idx.dim);
  return q.length === idx.dim ? q : null;
}

// Ảnh `url` (vd ảnh chọn tay của slide tĩnh) có đúng chủ đề câu hỏi không:
// true/false theo cùng ngưỡng MIN_SCORE (ảnh giữ chỗ luôn false); null khi
// không đánh giá được (chưa có index, ảnh chưa được index) -> giữ nguyên ảnh.
export async function isImageOnTopic(question: string, answer: string, url: string): Promise<boolean | null> {
  const idx = await loadImageIndex();
  if (!idx) return null;
  const want = decodeURIComponent(url);
  const im = idx.images.find(e => decodeURIComponent(e.url) === want);
  if (!im) return null;
  if (im.placeholder) return false;
  const q = await queryVec(idx, question, answer);
  if (!q || im.vec.length !== q.length) return null;
  let s = 0;
  for (let i = 0; i < q.length; i++) s += q[i] * im.vec[i];
  return s >= MIN_SCORE;
}

export async function searchImages(question: string, answer = '', k = 3): Promise<ImageHit[]> {
  const idx = await loadImageIndex();
  if (!idx) return [];
  const q = await queryVec(idx, question, answer);
  if (!q) return [];

  const scored: ImageHit[] = [];
  for (const im of idx.images) {
    if (im.placeholder || im.vec.length !== q.length) continue;
    let s = 0;
    for (let i = 0; i < q.length; i++) s += q[i] * im.vec[i];
    if (s >= MIN_SCORE) scored.push({ url: im.url, score: s, desc: im.desc });
  }
  scored.sort((a, b) => b.score - a.score);
  if (!scored.length) return [];
  const top = scored[0].score;
  return scored.filter(h => top - h.score <= MAX_GAP).slice(0, k);
}
