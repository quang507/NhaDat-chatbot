'use client';

// ============================================================================
// SlideStage (P1.5): chuyển cảnh slide kiểu 2 LỚP CROSS-FADE - không remount.
//
// Trước: key={replayKey} remount cả cây slide -> DOM cũ bị huỷ ngay (màn chớp),
// ảnh decode lại. Giờ: slide mới là MỘT LỚP MỚI chồng lên, lớp cũ giữ nguyên
// DOM và fade-out bằng opacity (compositor-only) rồi mới unmount. Patch cùng
// slide (refine/same-slide) cập nhật tại chỗ trên lớp hiện tại - không lớp mới.
// slideId do presentation machine cấp: đổi slide thật mới tăng.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { SlideBody, Orient } from '@/components/SlideBody';
import type { SlideData } from '@/lib/slide-types';

const FADE_OUT_MS = 700;

interface Layer { id: number; data: SlideData }

interface SlideStageProps {
  slideId: number;
  slide: SlideData;         // đã lọc ảnh hỏng + giới hạn 6 (page lo)
  orientOf: (src: string) => Orient;
  onImageClick?: (src: string) => void;
  onImageError?: (src: string) => void;
}

export function SlideStage({ slideId, slide, orientOf, onImageClick, onImageError }: SlideStageProps) {
  const [layers, setLayers] = useState<Layer[]>([{ id: slideId, data: slide }]);

  useEffect(() => {
    setLayers(prev => {
      const top = prev[prev.length - 1];
      if (top && top.id === slideId) {
        // Cùng slide - patch tại chỗ (refine chèn answer_text...), không lớp mới.
        return prev.map(l => (l.id === slideId ? { ...l, data: slide } : l));
      }
      // Slide mới: giữ lớp trên cùng hiện tại làm lớp fade-out, thêm lớp mới.
      return [...(top ? [top] : []), { id: slideId, data: slide }];
    });
  }, [slide, slideId]);

  // Gỡ lớp cũ sau khi fade xong.
  const topId = layers[layers.length - 1]?.id;
  useEffect(() => {
    if (layers.length <= 1) return;
    const t = setTimeout(() => setLayers(ls => ls.slice(-1)), FADE_OUT_MS + 100);
    return () => clearTimeout(t);
  }, [topId, layers.length]);

  return (
    <div className="relative flex-1 min-h-0">
      <style dangerouslySetInnerHTML={{ __html: `
        .slide-layer { position: absolute; inset: 0; display: flex; flex-direction: column; }
        .slide-layer-out { opacity: 0; transition: opacity ${FADE_OUT_MS}ms ease; pointer-events: none; }
      ` }} />
      {layers.map((l, i) => (
        <div key={l.id} className={`slide-layer ${i < layers.length - 1 ? 'slide-layer-out' : ''}`}>
          <SlideBody
            data={l.data}
            orientOf={orientOf}
            onImageClick={i === layers.length - 1 ? onImageClick : undefined}
            onImageError={onImageError}
            replayKey={l.id}
          />
        </div>
      ))}
    </div>
  );
}
