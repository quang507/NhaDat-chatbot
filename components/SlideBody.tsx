'use client';

// ============================================================================
// SlideBody - STYLE TỐI THEO FIGMA "Demo layout" (07/2026):
//
//  Nguyên tắc: ẢNH LÀ CHỦ ĐẠO, chữ chỉ điểm xuyết.
//  • Nền: chính ảnh slide phóng to + blur + tối (brightness .35) phủ toàn màn
//    → không còn khung trắng, ảnh "mờ mờ phía sau" như bản Figma.
//  • Nhãn nhỏ tracked ở TRÊN (kiểu "mẫu nhà opus") thay cho block title to.
//  • Text nằm ĐÈ LÊN vùng ảnh, ghim đáy trên gradient đen, cách title một
//    khoảng lớn (~100px trên màn trình chiếu) - title trên / points dưới.
//  • full_background: ảnh tràn màn, toàn bộ chữ đè trực tiếp lên ảnh.
//  • NHIỀU ẢNH: mỗi thời điểm chỉ hiện MỘT ảnh nằm ngang - tự động chuyển
//    lần lượt bằng crossfade, KHÔNG BAO GIỜ xếp ảnh cạnh nhau.
// ============================================================================

import React, { useEffect, useState } from 'react';

// Thời gian hiển thị mỗi ảnh trước khi chuyển sang ảnh kế (ms)
const IMAGE_ROTATE_MS = 2500;

export interface SlideBodyData {
  layout_type?: string;
  title: string;
  points?: string[];
  speech_text?: string;
  // Câu trả lời LLM bám đúng câu khách hỏi (pha 2 refine). Có nó thì hiện TO
  // ở trên, còn points tĩnh thu NHỎ và tụt xuống dưới.
  answer_text?: string;
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
}

const Line = ({ children, delay = 0, className = '' }: {
  children: React.ReactNode; delay?: number; className?: string;
}) => (
  <span className="line-mask block">
    <span className={`line-in block ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </span>
  </span>
);

export function SlideBody({ data, orientOf, onImageClick, onImageError, replayKey }: SlideBodyProps) {
  // Khử trùng URL: API đôi khi trả cùng một ảnh 2 lần. Không khử thì React báo
  // trùng key và ta render thừa một lớp ảnh chồng lên chính nó.
  // CHỈ 1 ẢNH/SLIDE (08/2026 - sếp ưu tiên CHÍNH XÁC): lấy đúng ảnh ĐẦU TIÊN
  // (ảnh khớp nhất theo thứ tự catalog/LLM xếp), bỏ hẳn xoay nhiều ảnh -
  // xoay dễ trôi sang ảnh lạc đề trong lúc khách đang đọc.
  const imgs = Array.from(new Set((data.image_urls || []).filter(Boolean))).slice(0, 1);
  const points = (data.points || []).filter(Boolean);
  const hasImg = imgs.length > 0;
  const isMapImg = (src: string) => src.includes('vi_tri') || src.includes('18_phut');
  const qrUrl = data.maps_url || 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';

  // NGUYÊN TẮC: mỗi thời điểm chỉ hiện MỘT ảnh. Nhiều ảnh -> tự chuyển lần
  // lượt (crossfade), KHÔNG xếp cạnh nhau.
  const [imgIdx, setImgIdx] = useState(0);
  // Tỉ lệ THẬT của từng ảnh (đo khi ảnh load xong) - để khung ảnh ôm đúng tỉ lệ
  // và caption luôn nằm SÁT mép dưới ảnh như bản SlideLayout.pdf sếp duyệt.
  const [ratios, setRatios] = useState<Record<string, number>>({});
  // Đo khung THẬT (không dùng matchMedia - khung thử 9:16 nằm trong cửa sổ
  // ngang sẽ đo sai): cao > rộng = MÀN ĐỨNG -> ảnh luôn FULL CHIỀU NGANG,
  // thừa chiều cao thì object-cover cắt dọc thay vì co lại chừa viền 2 bên.
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [framePortrait, setFramePortrait] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setFramePortrait(e.contentRect.height > e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const imgsKey = imgs.join('|');
  useEffect(() => {
    setImgIdx(0);
    if (imgs.length <= 1) return;
    const t = setInterval(() => setImgIdx(i => (i + 1) % imgs.length), IMAGE_ROTATE_MS);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgsKey, replayKey]);

  const cur = imgs[Math.min(imgIdx, Math.max(imgs.length - 1, 0))];

  const QrChip = () => (
    <a
      href={qrUrl} target="_blank" rel="noopener noreferrer"
      className="absolute bottom-[2.5cqw] left-[2.5cqw] z-20 bg-white/95 rounded-[1.6cqw] p-[1.2cqw] shadow-lg flex flex-col items-center"
      onClick={e => e.stopPropagation()}
    >
      <img
        src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(qrUrl)}`}
        alt="QR bản đồ"
        className="w-[8cqw] h-[8cqw] max-w-[92px] max-h-[92px] min-w-[52px] min-h-[52px]"
      />
      <span className="text-[clamp(9px,1.3cqw,14px)] font-bold text-neutral-600 mt-[0.4cqw]">
        Quét bản đồ
      </span>
    </a>
  );


  // Nhãn nhỏ tracked kiểu Figma: "mẫu nhà opus" - lowercase nhẹ nhàng, mờ.
  const TopLabel = ({ delay = 80 }: { delay?: number }) => (
    <Line delay={delay}>
      <span className="inline-block text-white/60 font-semibold tracking-[0.3em] uppercase text-[clamp(9px,1.4cqw,16px)]">
        Ny&apos;ah Phú Định
      </span>
    </Line>
  );

  // Chỉ hiện CÂU TRẢ LỜI LLM (answer_text) - sếp chốt: bỏ hẳn points tĩnh trên
  // slide có ảnh. Chưa có/không có answer (Groq sập, câu ngoài đề) -> chỉ ảnh.
  const BottomPoints = (_: { startDelay?: number }) => (
    data.answer_text ? (
      <div className="space-y-[1cqw]">
        <Line key={data.answer_text} delay={60}
          className="text-white font-semibold leading-snug text-[clamp(14px,2.9cqw,38px)] drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
          {data.answer_text}
        </Line>
      </div>
    ) : null
  );

  // Nền mờ phía sau: chính ảnh đang hiện blur + tối phủ toàn khung.
  const BlurBackdrop = ({ src }: { src: string }) => (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {/* PDF sếp duyệt: nền là ảnh phóng to LÀM TỐI (gần như không blur) */}
      <img src={src} alt="" className="w-full h-full object-cover scale-110 blur-[3px] brightness-[0.26] saturate-[0.8] transition-opacity duration-1000" />
      <div className="absolute inset-0 bg-black/35" />
    </div>
  );

  // ══════════════ LAYOUT 1: FULL BACKGROUND - chữ đè trực tiếp lên ảnh ═══════
  // Nhiều ảnh: nền tràn màn tự chuyển lần lượt (crossfade) - không thumbnail.
  if (hasImg && (data.layout_type === 'full_background' || !data.layout_type)) {
    return (
      <div style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full overflow-hidden bg-[#0C0F0D]">
          <div className="img-card absolute inset-0" style={{ animationDelay: '0ms', borderRadius: 0 }}>
            {imgs.map((src, i) => (
              <img
                key={src} src={src} alt=""
                className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-[800ms] ease-out ${
                  i === imgIdx ? 'opacity-100 animate-ken-burns' : 'opacity-0 pointer-events-none'
                }`}
                onError={onImageError ? () => onImageError(src) : undefined}
                onClick={onImageClick && i === imgIdx ? () => onImageClick(src) : undefined}
              />
            ))}
          </div>
          {/* Gradient đen đáy + đỉnh cho label */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/35" />

          {/* Label nhỏ trên cùng, giữa - như Figma */}
          <div className="absolute top-[3cqw] inset-x-0 text-center">
            <TopLabel />
          </div>

          {/* Title + khoảng cách LỚN + points - ghim đáy trái */}
          <div className="absolute left-[5cqw] right-[5cqw] bottom-[4.5cqw] max-w-[78cqw]">
            <h1 className="uppercase font-black leading-[1.06] tracking-tight text-white text-[clamp(22px,5.4cqw,100px)] drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
              <Line delay={190}>{data.title}</Line>
            </h1>
            {/* khoảng cách lớn giữa title và points (~100px màn trình chiếu) */}
            <div className="mt-[clamp(28px,6cqw,110px)]">
              <BottomPoints />
            </div>
          </div>

          {isMapImg(cur) && <QrChip />}
        </div>
      </div>
    );
  }

  // ══════════════ LAYOUT 2: ẢNH TỐI ĐA + CAPTION DƯỚI ẢNH (SlideLayout.pdf) ═══
  // Theo bản duyệt của sếp (08/2026): ảnh giữ nguyên tỉ lệ, phóng tối đa trong
  // khung; caption là DẢI RIÊNG nằm NGAY DƯỚI ảnh - không bao giờ đè lên ảnh.
  // Nền phía sau là chính ảnh phóng to làm tối. Tên slide chữ nhỏ góc trên phải.
  if (hasImg) {
    return (
      <div ref={rootRef} style={{ containerType: 'inline-size' }} className="w-full h-full">
        <div key={replayKey} className="relative w-full h-full overflow-hidden bg-[#0C0F0D] flex flex-col">
          <BlurBackdrop src={cur} />

          {/* Tên slide - nằm NGAY SÁT mép trên ảnh phía ngoài (không đè lên
              ảnh, không lơ lửng góc màn): là dòng đầu của khối canh giữa nên
              luôn dính theo vị trí ảnh. */}
          {/* Khối GIỮA: ảnh + caption DÍNH NHAU, canh giữa theo chiều dọc.
              Khung ảnh ôm theo tỉ lệ THẬT của ảnh (aspectRatio đo lúc load);
              khi ảnh cao quá thì flex shrink co lại, object-contain lo phần dư.
              Nhờ vậy caption luôn nằm sát mép dưới ảnh - không lơ lửng đáy màn. */}
          <div className="relative z-10 flex-1 min-h-0 flex flex-col justify-center">
            {/* Tên slide - dòng đầu khối canh giữa, SÁT mép trên ảnh phía
                ngoài (không đè lên ảnh, không lơ lửng góc màn). */}
            <div className="shrink-0 text-right pr-[2.2cqw] pb-[0.9cqw] pointer-events-none">
              <Line delay={120}>
                <span className="inline-block lowercase text-white/75 font-medium tracking-[0.12em] text-[clamp(11px,1.9cqw,24px)] drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
                  {data.title}
                </span>
              </Line>
            </div>
            <figure
              className={`img-card relative w-full shrink min-h-0 ${onImageClick ? 'cursor-zoom-in' : ''}`}
              style={{
                animationDelay: '320ms',
                aspectRatio: ratios[cur] || (orientOf(cur) === 'portrait' ? 3 / 4 : 16 / 9),
              }}
              onClick={onImageClick ? () => onImageClick(cur) : undefined}
            >
              {imgs.map((src, i) => (
                <img
                  key={src} src={src} alt=""
                  className={`absolute inset-0 w-full h-full ${framePortrait ? 'object-cover' : 'object-contain'} transition-all duration-[800ms] ease-out ${
                    i === imgIdx ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.02] pointer-events-none'
                  }`}
                  onLoad={e => {
                    const el = e.currentTarget;
                    if (el.naturalWidth && el.naturalHeight) {
                      setRatios(r => r[src] ? r : { ...r, [src]: el.naturalWidth / el.naturalHeight });
                    }
                  }}
                  onError={onImageError ? () => onImageError(src) : undefined}
                />
              ))}
              {isMapImg(cur) && <QrChip />}
            </figure>

            {/* Caption: dải riêng NGAY DƯỚI ảnh - CHỈ câu trả lời LLM (sếp chốt:
                bỏ points tĩnh; không có answer thì ảnh full, không caption). */}
            {data.answer_text && (
              <div className="shrink-0 w-full bg-black/45 backdrop-blur-[2px] px-[4cqw] py-[1.8cqw]">
                <Line key={data.answer_text} delay={60}
                  className="text-white font-semibold leading-snug text-[clamp(14px,2.7cqw,36px)] drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
                  {data.answer_text}
                </Line>
              </div>
            )}
          </div>

        </div>
      </div>
    );
  }

  // ══════════════ LAYOUT 3: TEXT-ONLY - nền ẢNH TỐI như SlideLayout.pdf ═══════
  // Khung cuối bản duyệt: không có ảnh chủ đề thì nền là ảnh dự án làm tối,
  // chữ trắng vạch xanh nằm giữa màn - được NHIỀU chữ hơn (tối đa 5 ý).
  const FALLBACK_BG = "/images/01_NyAh-PhuDinh/ny'ah-phu-dinh-tong-quan-1.jpg";
  return (
    <div style={{ containerType: 'inline-size' }} className="w-full h-full">
      <div key={replayKey} className="relative w-full h-full overflow-hidden bg-[#0C0F0D]">
        <div aria-hidden className="absolute inset-0 overflow-hidden">
          <img src={FALLBACK_BG} alt="" className="w-full h-full object-cover brightness-[0.22] saturate-[0.8]" />
          <div className="absolute inset-0 bg-black/30" />
        </div>

        {/* Tên slide góc trên phải - đồng bộ với layout có ảnh */}
        <div className="absolute top-[2.4cqw] right-[3cqw] z-20 text-right">
          <Line delay={120}>
            <span className="inline-block lowercase text-white/70 font-medium tracking-[0.12em] text-[clamp(11px,1.9cqw,24px)]">
              Ny&apos;ah Phú Định
            </span>
          </Line>
        </div>

        {/* Khối chữ giữa màn - title + số nổi bật + tối đa 5 ý, canh trái */}
        <div className="relative z-10 w-full h-full flex flex-col justify-center px-[8cqw] gap-[2.6cqw]">
          <h1 className="uppercase font-black leading-[1.08] tracking-tight text-white text-[clamp(22px,5.2cqw,88px)] drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
            <Line delay={190}>{data.title}</Line>
          </h1>
          {/* Ẩn số nổi bật nếu title ĐÃ chứa đúng số đó - tránh lặp "18 phút" 2 lần */}
          {data.highlight_number && !data.title.toLowerCase().includes(data.highlight_number.toLowerCase()) && (
            <Line delay={340} className="font-black leading-none text-transparent text-[clamp(34px,11cqw,150px)]">
              <span style={{ WebkitTextStroke: '0.55cqw #A8D94A' }}>{data.highlight_number}</span>
            </Line>
          )}
          {points.length > 0 && (
            <div className="space-y-[1.4cqw]">
              {points.slice(0, 5).map((p, i) => (
                <Line key={i} delay={520 + i * 140}
                  className="text-white/95 font-medium leading-snug text-[clamp(13px,2.7cqw,34px)]">
                  {p}
                </Line>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
