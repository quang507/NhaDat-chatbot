// Giới hạn tần suất đơn giản theo IP (RAM từng instance serverless).
// Không thay được WAF thật nhưng chặn được spam thô vào quota Groq/Gemini.
const HITS = new Map<string, number[]>();

export function rateLimited(req: Request, name: string, maxPerMin = 120): boolean {
  const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim();
  const key = `${name}:${ip}`;
  const now = Date.now();
  const arr = (HITS.get(key) || []).filter(t => now - t < 60_000);
  arr.push(now);
  HITS.set(key, arr);
  // Chặn phình bộ nhớ: chỉ dọn entry đã NGUỘI (hết cửa sổ 60s), không clear()
  // toàn bộ - clear() sẽ "ân xá" luôn kẻ đang spam bằng cách nhồi key giả
  // (X-Forwarded-For ngẫu nhiên) cho map tràn.
  if (HITS.size > 2000) {
    HITS.forEach((v, k) => {
      if (!v.length || now - v[v.length - 1] >= 60_000) HITS.delete(k);
    });
  }
  return arr.length > maxPerMin;
}
