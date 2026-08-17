'use client';

// Đo hướng thật (landscape/portrait) + đánh dấu ảnh hỏng cho slide.
// Dùng chung cho /slide và /thu-slide - trước đây mỗi trang copy một bản
// collectImages + effect probe y hệt nhau.
import { useCallback, useEffect, useState } from 'react';

// Chỉ cần 2 field ảnh - /thu-slide có bản SlideData cục bộ riêng nên không
// ràng vào @/lib/slide-types.
type HasImages = { image_url?: string; image_urls?: string[] };

export function useSlideImageProbe(slide: HasImages | null, max: number) {
  const [imgOrient, setImgOrient] = useState<Record<string, 'landscape' | 'portrait'>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const collectImages = useCallback((s: HasImages | null): string[] => {
    if (!s) return [];
    const out: string[] = [];
    if (s.image_urls && Array.isArray(s.image_urls)) out.push(...s.image_urls.filter(Boolean));
    else if (s.image_url) out.push(s.image_url);
    return out.filter(u => !brokenImages[u]).slice(0, max);
  }, [brokenImages, max]);

  useEffect(() => {
    collectImages(slide).forEach(src => {
      if (imgOrient[src]) return;
      const im = new window.Image();
      im.onload = () => setImgOrient(prev => (prev[src] ? prev : { ...prev, [src]: im.naturalWidth >= im.naturalHeight ? 'landscape' : 'portrait' }));
      im.onerror = () => setBrokenImages(prev => ({ ...prev, [src]: true }));
      im.src = src;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, brokenImages]);

  return { imgOrient, brokenImages, setBrokenImages, collectImages };
}
