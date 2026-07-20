'use client';

// ============================================================================
// SlideBody — THÂN SLIDE cho MÀN TRÌNH CHIẾU ĐỨNG 9:16 (portrait).
//
//  Chốt theo Figma của sếp:
//   • Ảnh: luôn FIT (object-contain) — KHÔNG crop — tràn full chiều ngang, canh
//     giữa; phần thừa trên/dưới là nền tối (letterbox).
//   • Nhãn nguồn nhỏ ("mẫu nhà opus") ở TRÊN, canh phải.
//   • Chữ NHỎ ở DƯỚI: thanh xanh + tiêu đề (KHÔNG cắt "...", dài thì xuống dòng).
//   • Không ảnh / dynamic: nền tối, tiêu đề + nhiều dòng ý chính (chữ vừa phải).
//
//  Chữ trượt lên trong mặt nạ (line-mask/line-in). Co giãn theo bề NGANG thẻ bằng
//  container query (cqw) — hợp màn đứng vì cqw bám chiều ngang (cạnh ngắn).
// ============================================================================

import React, { useEffect, useState } from 'react';

// Thời gian hiển thị mỗi ảnh trước khi chuyển sang ảnh kế (ms)
const IMAGE_ROTATE_MS = 4000;

export interface SlideBodyData {
  layout_type?: string;
  title: string;
  points?: string[];
  speech_text?: string;
  image_urls?: string[];
  highlight_number?: string;
  maps_url?: string;
}

export type Orient = 'landscape' | 'portrait';

interface SlideBodyProps {
  data: SlideBodyData;
  orientOf: (src: string) => Orient;
  onImageClick?: (src: string) => void;
  onImageError?: (src: string) => void;
  replayKey?: number | string;
  /** Nhãn nguồn góc trên ("mẫu nhà opus"). Không truyền -> tự suy từ ảnh. */
  sourceLabel?: string;
}

// 1 dòng chữ trượt từ dưới lên trong mặt nạ, lóe sáng rồi mờ dần.
const Line = ({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) => (
  <span className="line-mask block">
    <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>{children}</span>
  </span>
);

const splitSentences = (t: string): string[] =>
  (t || '').replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]?/g)?.map(s => s.trim()).filter(Boolean) || [];

const isMapImg = (src: string) => src.includes('vi_tri') || src.includes('18_phut');

// Suy nhãn nguồn ("mẫu nhà opus"...) từ đường dẫn ảnh.
function deriveSource(src: string): string {
  const p = (src || '').toLowerCase();
  if (p.includes('signature')) return 'Signature by Codinachs';
  if (p.includes('opus')) return 'Mẫu nhà Opus';
  if (p.includes('fusion')) return 'Mẫu nhà Fusion Gen 5';
  if (p.includes('cosmo')) return 'Mẫu nhà Cosmo Gen 2';
  if (p.includes('cashmere')) return 'Dòng Cashmere';
  return "Ny'ah Phú Định";
}

const GREEN = '#2E9E5B';

export function SlideBody({ data, orientOf, onImageClick, onImageError, replayKey, sourceLabel }: SlideBodyProps) {
  const imgs = (data.image_urls || []).filter(Boolean);
  const points = (data.points || []).filter(Boolean);
  const speechLines = splitSentences(data.speech_text || '');

  // NGUYÊN TẮC: mỗi thời điểm chỉ hiện MỘT ảnh nằm ngang, full chiều ngang.
  // Nhiều ảnh -> tự động chuyển lần lượt (crossfade), KHÔNG xếp cạnh nhau.
  const [imgIdx, setImgIdx] = useState(0);
  const imgsKey = imgs.join('|');
  useEffect(() => {
    setImgIdx(0);
    if (imgs.length <= 1) return;
    const t = setInterval(() => setImgIdx(i => (i + 1) % imgs.length), IMAGE_ROTATE_MS);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgsKey, replayKey]);

  const bg = imgs[Math.min(imgIdx, Math.max(imgs.length - 1, 0))];
  const hasImg = !!bg;
  const qrUrl = data.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';

  // Nhãn nguồn nhỏ, canh phải (chữ thường như bản Figma).
  const SourceTag = () => (
    <div className="flex justify-end px-[4.5cqw] pt-[4cqw] pb-[2cqw] shrink-0">
      <span className="lowercase text-white/60 font-normal tracking-[0.02em] text-[clamp(11px,2.6cqw,26px)]">
        {sourceLabel || deriveSource(bg || '')}
      </span>
    </div>
  );

  // Nhãn QR bản đồ (góc trên-trái vùng ảnh).
  const QrChip = () => (
    <a
      href={qrUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute top-[3cqw] left-[4cqw] z-20 bg-white/95 rounded-[1.6cqw] p-[1.2cqw] shadow-xl border border-black/5 flex flex-col items-center"
      onClick={e => e.stopPropagation()}
    >
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}`}
        alt="QR bản đồ"
        className="w-[10cqw] h-[10cqw] max-w-[130px] max-h-[130px] min-w-[64px] min-h-[64px]"
      />
      <span className="text-[clamp(9px,1.5cqw,16px)] font-bold text-neutral-600 mt-[0.4cqw]">Quét bản đồ</span>
    </a>
  );

  // Thanh xanh + tiêu đề (không cắt chữ). Chữ nhỏ ở dưới.
  const TitleBar = ({ title, titleSize, sub, subSize }: { title: string; titleSize: string; sub?: string; subSize?: string }) => (
    <div className="flex items-stretch gap-[2.2cqw]">
      <span className="flex-none w-[clamp(3px,0.8cqw,9px)] rounded-full self-stretch" style={{ background: GREEN }} />
      <div className="min-w-0">
        <h1 className="font-semibold leading-snug text-white text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]" style={{ fontSize: titleSize }}>
          <Line delay={170}>{title}</Line>
        </h1>
        {sub && (
          <h2 className="mt-[1.2cqw] font-normal leading-snug text-white/70" style={{ fontSize: subSize }}>
            <Line delay={520}>{sub}</Line>
          </h2>
        )}
      </div>
    </div>
  );

  // ══════════════ CHẾ ĐỘ A — CÓ ẢNH (fit full ngang) ══════════════
  if (hasImg) {
    const sub = points[0] || speechLines[0];
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full flex flex-col overflow-hidden bg-[#0b0c12]">
          <SourceTag />

          {/* ẢNH — MỘT ảnh mỗi lần, FIT (contain), full chiều ngang, canh giữa.
              Nhiều ảnh: tự chuyển lần lượt bằng crossfade — KHÔNG xếp cạnh nhau. */}
          <div className="img-card flex-1 min-h-0 relative" style={{ animationDelay: '0ms', borderRadius: 0 }}>
            {imgs.map((src, i) => (
              <img
                key={src}
                src={src}
                alt=""
                className={`absolute inset-0 w-full h-full object-contain transition-all duration-1000 ease-out ${
                  i === imgIdx ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03] pointer-events-none'
                } ${onImageClick ? 'cursor-zoom-in' : ''}`}
                onError={onImageError ? () => onImageError(src) : undefined}
                onClick={onImageClick && i === imgIdx ? () => onImageClick(src) : undefined}
              />
            ))}
            {isMapImg(bg) ? <QrChip /> : null}

            {/* Chấm chỉ báo khi có nhiều ảnh */}
            {imgs.length > 1 && (
              <div className="absolute bottom-[2cqw] left-1/2 -translate-x-1/2 z-20 flex gap-[1cqw] bg-black/50 backdrop-blur px-[2cqw] py-[1cqw] rounded-full">
                {imgs.map((_, i) => (
                  <span
                    key={i}
                    className={`h-[1.4cqw] min-h-[6px] rounded-full transition-all duration-300 ${
                      i === imgIdx ? 'w-[3.5cqw] min-w-[16px] bg-[#2E9E5B]' : 'w-[1.4cqw] min-w-[6px] bg-white/40'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* CHỮ NHỎ Ở DƯỚI */}
          <div className="shrink-0 px-[4.5cqw] pt-[3.5cqw] pb-[5cqw]">
            <TitleBar
              title={data.title}
              titleSize="clamp(15px, 3.7cqw, 42px)"
              sub={sub}
              subSize="clamp(12px, 2.7cqw, 30px)"
            />
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ CHẾ ĐỘ B — KHÔNG ẢNH / DYNAMIC: nền tối, nhiều dòng ══════════════
  return (
    <div style={{ containerType: 'inline-size' }} className="w-full h-full">
      <div key={replayKey} className="relative w-full h-full flex flex-col overflow-hidden bg-[#0b0c12]">
        {/* Ánh sáng nền tinh tế (radial xanh mờ) — vẫn tối, tương phản cao */}
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(120% 70% at 10% 8%, rgba(46,158,91,0.15), transparent 55%)' }} />
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(90% 55% at 100% 100%, rgba(46,158,91,0.10), transparent 60%)' }} />

        <div className="relative z-10 flex flex-col h-full">
          <SourceTag />

          {/* Nội dung dồn xuống nửa dưới, chữ vừa phải, nhiều dòng */}
          <div className="flex-1 min-h-0 flex flex-col justify-end px-[6cqw] pb-[7cqw]">
            {data.highlight_number && (
              <Line delay={90} className="font-black leading-none text-transparent text-[clamp(36px,14cqw,150px)] mb-[2cqw]">
                <span style={{ WebkitTextStroke: `0.5cqw ${GREEN}`, color: 'transparent' }}>{data.highlight_number}</span>
              </Line>
            )}

            <TitleBar title={data.title} titleSize="clamp(20px, 5.4cqw, 62px)" />

            {points.length > 0 && (
              <div className="mt-[3cqw] pl-[3cqw] space-y-[1.6cqw]">
                {points.slice(0, 5).map((p, i) => (
                  <Line key={i} delay={620 + i * 130} className="flex gap-[1.6cqw] text-white/90 font-normal leading-snug text-[clamp(13px,3cqw,34px)]">
                    <span className="flex-none mt-[1.1cqw] w-[1.1cqw] h-[1.1cqw] min-w-[7px] min-h-[7px] rounded-full" style={{ background: GREEN }} />
                    <span className="min-w-0">{p}</span>
                  </Line>
                ))}
              </div>
            )}

            {speechLines.length > 0 && (
              <div className="mt-[3cqw] pl-[3cqw]">
                {speechLines.slice(0, 2).map((ln, i) => (
                  <Line key={i} delay={1080 + i * 150} className="text-white/55 font-light leading-[1.6] text-[clamp(12px,2.3cqw,28px)]">
                    {ln}
                  </Line>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
