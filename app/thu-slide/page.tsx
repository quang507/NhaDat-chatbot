'use client';

// ============================================================================
// /thu-slide - TRANG THỬ SLIDE BẰNG CÁCH GÕ CHỮ
//
// Mục đích: gõ đúng câu khách hay hỏi -> xem ngay slide thật mà máy sẽ chiếu,
// không cần nói vào micro, không cần chờ ambient mode.
//
// Dùng CHUNG <SlideBody> với /slide và /voice nên bố cục, ảnh, animation
// giống hệt màn trình chiếu thật - thấy ở đây thế nào thì khách thấy thế đó.
//
// Cột phải là bảng chẩn đoán: nhánh nào xử lý (tĩnh/động), mất bao lâu,
// ảnh nào 404. Dùng để soi khi slide ra sai.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SlideBody } from '@/components/SlideBody';

const LIME = '#A8D94A'; // xanh brand dùng cho nhấn - khớp SlideBody

interface SlideData {
  layout_type?: string;
  title: string;
  points?: string[];
  speech_text?: string;
  image_urls?: string[];
  image_url?: string;
  highlight_number?: string;
  maps_url?: string;
  skip?: boolean;
  _source?: 'static_fast' | 'static_llm_text' | 'dynamic_llm';
}

// Nhãn nhánh xử lý - lấy từ _source do API trả về, KHÔNG suy đoán theo thời gian
// (lần gọi đầu ở dev chậm vì Next phải biên dịch route, dễ báo sai).
const NHAN_NGUON: Record<string, { ten: string; giai_thich: string }> = {
  static_fast: { ten: 'Slide tĩnh', giai_thich: 'lấy nguyên từ catalog, không qua LLM' },
  static_llm_text: { ten: 'Tĩnh + LLM viết lại chữ', giai_thich: 'ảnh cố định theo từ khóa, chữ do LLM' },
  dynamic_llm: { ten: 'Slide động', giai_thich: 'LLM sinh cả chữ lẫn chọn ảnh từ RAG' },
};

// Câu mẫu bấm nhanh - gom theo nhóm khách hay hỏi nhất.
const SAMPLES: { nhom: string; cau: string[] }[] = [
  { nhom: 'Tiền & rổ hàng', cau: ['giá bao nhiêu', 'còn căn nào trống', 'thanh toán trả góp', 'gói air hoàn thiện'] },
  { nhom: 'Pháp lý & tiến độ', cau: ['pháp lý sổ hồng', 'tiến độ xây tới đâu', 'khi nào bàn giao'] },
  { nhom: 'Mẫu nhà', cau: ['mẫu fusion gen 5', 'bếp cosmo', 'phòng ngủ opus', 'signature codinachs', 'cashmere', '2 mặt tiền'] },
  { nhom: 'Vị trí & tiện ích', cau: ['vị trí ở đâu', 'đi quận 1 mất bao lâu', 'sân chơi trẻ em', 'công viên nội khu'] },
  { nhom: 'Nhu cầu sống', cau: ['nhà cho 3 thế hệ', 'nuôi chó mèo được không', 'vừa ở vừa kinh doanh', 'hướng nhà phong thủy'] },
  { nhom: 'Giọng nói (STT)', cau: ['cho xem phiu dân', 'mẫu cát mô', 'nhà ô put', 'ê tốp là gì'] },
];

type Trace = {
  ms: number;
  status: number;
  raw: SlideData | null;
  brokenImgs: string[];
  err?: string;
};

export default function ThuSlidePage() {
  const [text, setText] = useState('');
  const [slide, setSlide] = useState<SlideData | null>(null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [dangChay, setDangChay] = useState(false);
  const [doc, setDoc] = useState<'dung' | 'ngang'>('dung');
  const [replayKey, setReplayKey] = useState(0);
  const [lichSu, setLichSu] = useState<{ q: string; title: string; ok: boolean }[]>([]);
  const [imgOrient, setImgOrient] = useState<Record<string, 'landscape' | 'portrait'>>({});
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Đo hướng ảnh thật để SlideBody xử lý giống trang /slide.
  useEffect(() => {
    const imgs = collectImages(slide);
    imgs.forEach(src => {
      if (imgOrient[src]) return;
      const im = new window.Image();
      im.onload = () => setImgOrient(p => (p[src] ? p : { ...p, [src]: im.naturalWidth >= im.naturalHeight ? 'landscape' : 'portrait' }));
      im.onerror = () => setBrokenImages(p => ({ ...p, [src]: true }));
      im.src = src;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

  function collectImages(s: SlideData | null): string[] {
    if (!s) return [];
    const out: string[] = [];
    if (Array.isArray(s.image_urls)) out.push(...s.image_urls.filter(Boolean));
    else if (s.image_url) out.push(s.image_url);
    return out.filter(u => !brokenImages[u]).slice(0, 3);
  }

  async function chay(q: string) {
    const cau = q.trim();
    if (!cau || dangChay) return;
    setDangChay(true);
    setTrace(null);
    const t0 = performance.now();
    try {
      const res = await fetch('/api/slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: cau }),
      });
      const ms = Math.round(performance.now() - t0);
      const data: SlideData = await res.json();

      // Kiểm tra ảnh nào không tải được (404) để báo ngay.
      const urls = Array.isArray(data.image_urls) ? data.image_urls : data.image_url ? [data.image_url] : [];
      const broken = await Promise.all(
        urls.map(u => new Promise<string | null>(r => {
          const im = new window.Image();
          im.onload = () => r(null);
          im.onerror = () => r(u);
          im.src = u;
        }))
      );
      const brokenImgs = broken.filter(Boolean) as string[];

      const coSlide = !data.skip && !!data.title;
      setSlide(coSlide ? data : null);
      setTrace({ ms, status: res.status, raw: data, brokenImgs });
      setReplayKey(k => k + 1);
      setLichSu(h => [{ q: cau, title: coSlide ? data.title : '(không ra slide)', ok: coSlide && brokenImgs.length === 0 }, ...h].slice(0, 12));
    } catch (e: unknown) {
      setSlide(null);
      setTrace({ ms: Math.round(performance.now() - t0), status: 0, raw: null, brokenImgs: [], err: e instanceof Error ? e.message : String(e) });
    } finally {
      setDangChay(false);
    }
  }

  // Màn đứng: ghim theo chiều CAO (h-[72vh] + w-auto) để khung luôn nằm trong
  // tầm nhìn - nếu ghim theo chiều ngang thì tỉ lệ 9:16 đẩy khung cao quá màn
  // hình và phần chữ dưới slide bị cắt mất.
  const khung = doc === 'dung'
    ? 'h-[76vh] aspect-[9/16] w-auto'
    : 'w-full max-w-[1000px] aspect-video';

  return (
    <div
      className="min-h-screen bg-[#0b0c12] text-white"
      style={{ fontFamily: "'Be Vietnam Pro', 'Inter', system-ui, sans-serif" }}
    >
      {/* ── Thanh trên ──────────────────────────────────────────────────── */}
      <header className="border-b border-white/10 px-5 py-3 flex items-center gap-4 flex-wrap">
        <h1 className="font-bold tracking-tight text-lg">
          Thử slide<span className="text-white/40 font-normal"> · Ny&apos;ah Phú Định</span>
        </h1>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-white/5 rounded-full p-1">
          {(['dung', 'ngang'] as const).map(m => (
            <button
              key={m}
              onClick={() => setDoc(m)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition ${
                doc === m ? 'text-[#0b0c12]' : 'text-white/60 hover:text-white'
              }`}
              style={doc === m ? { background: LIME } : undefined}
            >
              {m === 'dung' ? 'Màn đứng 9:16' : 'Màn ngang 16:9'}
            </button>
          ))}
        </div>
        <Link href="/slide" className="text-xs text-white/50 hover:text-white transition">Màn chiếu →</Link>
        <Link href="/voice" className="text-xs text-white/50 hover:text-white transition">Giọng nói →</Link>
      </header>

      {/* ── Ô gõ câu hỏi ────────────────────────────────────────────────── */}
      <div className="px-5 pt-5">
        <form
          onSubmit={e => { e.preventDefault(); chay(text); }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Gõ câu khách hỏi, ví dụ: còn căn nào trống - rồi bấm Enter"
            className="flex-1 bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-[15px] placeholder:text-white/30 focus:outline-none focus:border-[#A8D94A]/70 focus:bg-white/[0.07] transition"
          />
          <button
            type="submit"
            disabled={dangChay || !text.trim()}
            className="px-6 py-3 rounded-xl font-bold text-[#0b0c12] text-sm disabled:opacity-30 disabled:cursor-not-allowed transition hover:brightness-110"
            style={{ background: LIME }}
          >
            {dangChay ? 'Đang chạy…' : 'Ra slide'}
          </button>
        </form>
      </div>

      {/* ── Slide + chẩn đoán ───────────────────────────────────────────── */}
      <div className="px-5 py-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        {/* Khung slide - giống hệt màn chiếu thật */}
        <div className="flex justify-center">
          <div className={`${khung} w-full max-w-[520px] lg:max-w-none rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-[#0C0F0D] relative`}>
            {slide ? (
              <SlideBody
                data={{ ...slide, image_urls: collectImages(slide) }}
                orientOf={s => imgOrient[s] || 'landscape'}
                onImageError={s => setBrokenImages(p => ({ ...p, [s]: true }))}
                replayKey={replayKey}
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-center px-8">
                {trace && !trace.err ? (
                  <div>
                    <p className="text-white/80 font-semibold">Câu này không ra slide</p>
                    <p className="text-white/45 text-sm mt-2 leading-relaxed">
                      Máy trả về <code className="text-[#A8D94A]">skip</code> - không khớp slide tĩnh nào
                      và cũng không sinh được slide động.
                    </p>
                  </div>
                ) : trace?.err ? (
                  <div>
                    <p className="text-red-300 font-semibold">Gọi API lỗi</p>
                    <p className="text-white/45 text-sm mt-2 font-mono">{trace.err}</p>
                  </div>
                ) : (
                  <p className="text-white/30">Gõ một câu ở trên để xem slide</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bảng chẩn đoán */}
        <aside className="space-y-4">
          {/* Câu mẫu bấm nhanh - đặt ở cột phải để khung slide bên trái được cao
              tối đa và không bị đẩy tràn khỏi màn hình. */}
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-3">Câu mẫu - bấm để thử</h2>
            <div className="space-y-3">
              {SAMPLES.map(g => (
                <div key={g.nhom}>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-white/30 mb-1.5">{g.nhom}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {g.cau.map(c => (
                      <button
                        key={c}
                        onClick={() => { setText(c); chay(c); }}
                        className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.13] border border-white/10 text-[12px] text-white/75 hover:text-white transition"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-3">Kết quả</h2>
            {trace ? (
              <dl className="space-y-2 text-[13px]">
                <Dong nhan="Nhánh">
                  {slide?._source ? (
                    <>
                      <span style={{ color: LIME }}>{NHAN_NGUON[slide._source]?.ten ?? slide._source}</span>
                      <span className="block text-[11px] text-white/35 mt-0.5">
                        {NHAN_NGUON[slide._source]?.giai_thich}
                      </span>
                    </>
                  ) : '-'}
                </Dong>
                <Dong nhan="Thời gian">
                  <span className={trace.ms < 500 ? 'text-[#A8D94A]' : trace.ms < 3000 ? 'text-amber-300' : 'text-red-300'}>
                    {trace.ms} ms
                  </span>
                </Dong>
                <Dong nhan="HTTP">{trace.status || '-'}</Dong>
                <Dong nhan="Bố cục">{slide?.layout_type || '(mặc định)'}</Dong>
                <Dong nhan="Số ý">{slide?.points?.length ?? 0}</Dong>
                <Dong nhan="Số ảnh">
                  {(slide?.image_urls?.length ?? 0)}
                  {trace.brokenImgs.length > 0 && (
                    <span className="text-red-300 ml-2">· {trace.brokenImgs.length} ảnh lỗi 404</span>
                  )}
                </Dong>
              </dl>
            ) : (
              <p className="text-white/30 text-[13px]">Chưa chạy câu nào.</p>
            )}
          </section>

          {trace?.brokenImgs.length ? (
            <section className="rounded-xl border border-red-400/25 bg-red-400/[0.06] p-4">
              <h2 className="text-[10px] uppercase tracking-[0.16em] text-red-300/80 mb-2">Ảnh không tải được</h2>
              <ul className="space-y-1 text-[11px] font-mono text-red-200/80 break-all">
                {trace.brokenImgs.map(u => <li key={u}>{u}</li>)}
              </ul>
            </section>
          ) : null}

          {slide?.speech_text ? (
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-2">Câu máy sẽ đọc</h2>
              <p className="text-[13px] text-white/70 leading-relaxed italic">“{slide.speech_text}”</p>
            </section>
          ) : null}

          {lichSu.length > 0 && (
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-[10px] uppercase tracking-[0.16em] text-white/40 mb-3">Đã thử</h2>
              <ul className="space-y-1.5">
                {lichSu.map((h, i) => (
                  <li key={i}>
                    <button
                      onClick={() => { setText(h.q); chay(h.q); }}
                      className="w-full text-left group flex items-start gap-2 hover:bg-white/[0.05] rounded px-1.5 py-1 -mx-1.5 transition"
                    >
                      <span
                        className={`mt-[3px] shrink-0 ${h.ok ? '' : 'text-red-300'}`}
                        style={h.ok ? { color: LIME } : undefined}
                      >
                        {h.ok ? '●' : '○'}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[12px] text-white/80 truncate group-hover:text-white">{h.q}</span>
                        <span className="block text-[11px] text-white/35 truncate">{h.title}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {trace?.raw && (
            <details className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <summary className="text-[10px] uppercase tracking-[0.16em] text-white/40 cursor-pointer select-none">
                JSON máy trả về
              </summary>
              <pre className="mt-3 text-[10.5px] leading-relaxed text-white/55 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(trace.raw, null, 2)}
              </pre>
            </details>
          )}
        </aside>
      </div>

      <footer className="px-5 pb-8 text-[11px] text-white/25 max-w-4xl leading-relaxed">
        Trang nội bộ để kiểm tra slide. Dùng chung component <code>SlideBody</code> với màn chiếu thật,
        nên bố cục và ảnh ở đây đúng như khách sẽ thấy. Ô “Nhánh” cho biết slide do catalog tĩnh trả
        về hay do LLM sinh. Lần gọi đầu tiên có thể chậm vì Next phải biên dịch route.
      </footer>
    </div>
  );
}

function Dong({ nhan, children }: { nhan: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-white/40 w-[86px] shrink-0">{nhan}</dt>
      <dd className="min-w-0 text-white/85">{children}</dd>
    </div>
  );
}
