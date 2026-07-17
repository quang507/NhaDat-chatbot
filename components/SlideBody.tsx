'use client';

// ============================================================================
// SlideBody — THÂN SLIDE ("Gallery Cinema"). Làm lại theo bản Figma của sếp:
//
//  • CÓ ẢNH  → ảnh TRÀN FULL khung (mọi tỉ lệ dọc↔ngang: cover; sơ đồ/bản đồ:
//    contain để không cắt). Nhãn nguồn nhỏ góc trên-phải. Dưới cùng: THANH XANH
//    + TIÊU ĐỀ CHỮ LỚN tối đa 2 dòng, đè trên lớp gradient tối để luôn đọc rõ
//    từ xa (TV 3–5m). Kèm 1 dòng phụ ngắn nếu có.
//
//  • KHÔNG ẢNH / DYNAMIC / text_only → nền tối cinematic, tiêu đề lớn + NHIỀU
//    DÒNG nội dung (ý chính + câu dẫn) vì lúc này chữ là nhân vật chính.
//
//  Ảnh bản đồ vẫn kèm QR "Quét bản đồ". Chữ trượt lên trong mặt nạ (line-mask/
//  line-in), ảnh fade (img-card) — dùng lại hệ animation có sẵn ở page + globals.
//  Co giãn theo bề ngang thẻ bằng container query (cqw).
// ============================================================================

import React from 'react';

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
  /** Nhãn nguồn hiển thị góc trên-phải ("Mẫu nhà Opus"). Không truyền -> tự suy từ ảnh. */
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

// Ảnh dạng SƠ ĐỒ/BẢN ĐỒ (đồ họa, chữ nhỏ) — phải contain để không bị crop mất số liệu.
const isDiagram = (src: string) =>
  /vi_tri|18_phut|mat[_-]bang|cau-truc|tinh-nang|datasheet|ban-do|phan-lo|so-do|dien-tich/.test(src.toLowerCase());
const isMapImg = (src: string) => src.includes('vi_tri') || src.includes('18_phut');

// Suy nhãn nguồn ("Mẫu nhà Opus"...) từ đường dẫn ảnh.
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
  const bg = imgs[0];
  const hasImg = !!bg;
  const qrUrl = data.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';

  // Nhãn nguồn góc trên-phải.
  const SourceTag = ({ label }: { label: string }) => (
    <div className="absolute top-[3.5cqw] right-[4cqw] z-20 flex items-center gap-[1.1cqw]">
      <span className="w-[0.8cqw] h-[0.8cqw] min-w-[6px] min-h-[6px] rounded-full" style={{ background: GREEN }} />
      <span className="font-medium tracking-[0.04em] text-white/85 text-[clamp(11px,1.7cqw,22px)] drop-shadow-[0_1px_6px_rgba(0,0,0,0.6)]">
        {label}
      </span>
    </div>
  );

  // Nhãn QR bản đồ.
  const QrChip = () => (
    <a
      href={qrUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="absolute top-[3.5cqw] left-[4cqw] z-20 bg-white/95 rounded-[1.6cqw] p-[1.2cqw] shadow-xl border border-black/5 flex flex-col items-center"
      onClick={e => e.stopPropagation()}
    >
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`}
        alt="QR bản đồ"
        className="w-[8cqw] h-[8cqw] max-w-[92px] max-h-[92px] min-w-[52px] min-h-[52px]"
      />
      <span className="text-[clamp(9px,1.3cqw,14px)] font-bold text-neutral-600 mt-[0.4cqw]">Quét bản đồ</span>
    </a>
  );

  // Cắt dòng bằng inline-style (thắng class .block của .line-in — nếu để Tailwind
  // line-clamp-* thì bị .block ghi đè display -> KHÔNG cắt, tiêu đề tràn nhiều dòng).
  const clampStyle = (n: number): React.CSSProperties => ({
    display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  });

  // Khối tiêu đề (thanh xanh + tiêu đề lớn), dùng chung 2 chế độ.
  const TitleBlock = ({
    onDark, titleClamp, clampLines, sub,
  }: { onDark: boolean; titleClamp: string; clampLines: 2 | 3; sub?: string }) => (
    <div className="flex items-stretch gap-[2cqw]">
      <span className="flex-none w-[clamp(4px,0.75cqw,12px)] rounded-full self-stretch" style={{ background: GREEN }} />
      <div className="min-w-0">
        <h1
          className={`font-black tracking-[-0.02em] text-balance ${onDark ? 'text-white drop-shadow-[0_3px_20px_rgba(0,0,0,0.55)]' : 'text-[#12201a]'}`}
          style={{ fontSize: titleClamp, lineHeight: 1.04 }}
        >
          <Line delay={170}><span style={clampStyle(clampLines)}>{data.title}</span></Line>
        </h1>
        {sub && (
          <h2 className={`mt-[1.4cqw] font-normal leading-snug ${onDark ? 'text-white/85 drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]' : 'text-neutral-600'} text-[clamp(13px,2.5cqw,32px)]`}>
            <Line delay={560}><span style={clampStyle(1)}>{sub}</span></Line>
          </h2>
        )}
      </div>
    </div>
  );

  // ══════════════ CHẾ ĐỘ A — CÓ ẢNH: tràn full + tiêu đề đè dưới ══════════════
  if (hasImg) {
    const diagram = isDiagram(bg);
    const label = sourceLabel || deriveSource(bg);
    const sub = points[0] || speechLines[0];
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full overflow-hidden bg-[#0b0c12]">
          {/* Ảnh: photo -> cover tràn khung; sơ đồ/bản đồ -> contain (không cắt số liệu) */}
          <div className="img-card absolute inset-0" style={{ animationDelay: '0ms', borderRadius: 0 }}>
            <img
              src={bg}
              alt=""
              className={`w-full h-full ${diagram ? 'object-contain p-[3cqw]' : 'object-cover animate-ken-burns'}`}
              onError={onImageError ? () => onImageError(bg) : undefined}
              onClick={onImageClick ? () => onImageClick(bg) : undefined}
            />
          </div>

          {/* Gradient trên (cho nhãn nguồn) + dưới (cho tiêu đề) */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-[26%] bg-gradient-to-b from-black/55 to-transparent" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

          {isMapImg(bg) ? <QrChip /> : null}
          <SourceTag label={label} />

          {/* Tiêu đề dưới cùng — 2 dòng, chữ lớn */}
          <div className="absolute left-[4.5cqw] right-[4.5cqw] bottom-[5cqw] max-w-[86cqw]">
            <TitleBlock onDark titleClamp="clamp(26px, 7cqw, 132px)" clampLines={2} sub={sub} />
          </div>
        </div>
      </div>
    );
  }

  // ══════════════ CHẾ ĐỘ B — KHÔNG ẢNH / DYNAMIC: nền tối, NHIỀU DÒNG ══════════════
  const label = sourceLabel || "Ny'ah Phú Định";
  return (
    <div style={{ containerType: 'inline-size' }} className="w-full h-full">
      <div
        key={replayKey}
        className="relative w-full h-full overflow-hidden flex flex-col justify-center bg-[#0b0c12]"
      >
        {/* Ánh sáng nền tinh tế (radial xanh mờ) — vẫn giữ tối, tương phản cao */}
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 12% 0%, rgba(46,158,91,0.16), transparent 55%)' }} />
        <div aria-hidden className="absolute inset-0" style={{ background: 'radial-gradient(90% 60% at 100% 100%, rgba(46,158,91,0.10), transparent 60%)' }} />

        <SourceTag label={label} />

        <div className="relative z-10 px-[6cqw] pb-[6cqw] max-w-[90cqw]">
          {data.highlight_number && (
            <Line delay={90} className="font-black leading-none text-transparent text-[clamp(40px,13cqw,180px)] mb-[1.5cqw]">
              <span style={{ WebkitTextStroke: `0.5cqw ${GREEN}`, color: 'transparent' }}>{data.highlight_number}</span>
            </Line>
          )}

          <TitleBlock onDark titleClamp="clamp(24px, 6.2cqw, 116px)" clampLines={2} />

          {/* NHIỀU DÒNG: ý chính */}
          {points.length > 0 && (
            <div className="mt-[2.6cqw] pl-[3.1cqw] space-y-[1.3cqw]">
              {points.slice(0, 4).map((p, i) => (
                <Line key={i} delay={640 + i * 140} className="flex gap-[1.4cqw] text-white/90 font-normal leading-snug text-[clamp(14px,2.7cqw,36px)]">
                  <span className="flex-none mt-[1.1cqw] w-[1cqw] h-[1cqw] min-w-[7px] min-h-[7px] rounded-full" style={{ background: GREEN }} />
                  <span className="min-w-0">{p}</span>
                </Line>
              ))}
            </div>
          )}

          {/* Câu dẫn */}
          {speechLines.length > 0 && (
            <div className="mt-[3cqw] pl-[3.1cqw] max-w-[74cqw]">
              {speechLines.slice(0, 2).map((ln, i) => (
                <Line key={i} delay={1080 + i * 150} className="text-white/55 font-light leading-[1.6] text-[clamp(12px,2cqw,26px)]">
                  {ln}
                </Line>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
