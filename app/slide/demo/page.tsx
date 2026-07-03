'use client';

// TRANG DEMO LAYOUT SLIDE — duyet thiet ke 9 truong hop (theo ban Framer cua Quang).
// Dung CHUNG component <SlideBody> voi trang /slide that -> demo == that, khong lech.
// Bam vao khung de chay lai animation.

import React, { useState } from 'react';
import Link from 'next/link';
import { SlideBody, SlideBodyData, Orient } from '@/components/SlideBody';

interface DemoImg { src: string; orient: Orient; }
interface DemoCase extends SlideBodyData { id: string; label: string; imgs: DemoImg[]; }

// ANH THAT tu thu vien public/images — huong ghi dung theo kich thuoc file that.
const BEP_COSMO = '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/bep/cosmo-gen-2_bep.png';                       // NGANG
const CONG_VAO = '/images/01_NyAh-PhuDinh/tien_ich/cong_vao/tien-ich-1.jpg';                                    // NGANG
const TIEN_DO = '/images/01_NyAh-PhuDinh/tien_do/xay_dung/thang_05-2026-1-jpg.jpg';                             // NGANG
const MAP_18P = '/images/01_NyAh-PhuDinh/vi_tri/duong_di/18_phut_den_quan_1_chi_tiet.jpg';                      // NGANG
const THANG_XOAN = '/images/01_NyAh-PhuDinh/noi_that/thang_xoan/thang-xoan.jpg';                                // DOC
const PK_FUSION = '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/phong_khach/fusion-gen-5_phong-khach.png';     // DOC
const PK_COSMO = '/images/01_NyAh-PhuDinh/noi_that/cosmo_gen_2/phong_khach/cosmo-gen-2_phong-khach.png';        // DOC
const PHAN_LO = '/images/01_NyAh-PhuDinh/mat_bang/ban-do-phan-lo-dien-tich.jpg';                                // DOC
const PK_SIGNATURE = '/images/01_NyAh-PhuDinh/noi_that/signature_by_codinachs/phong-khach-01.jpg';              // DOC
const KHUON_VIEN = '/images/01_NyAh-PhuDinh/tien_ich/lanscape-khuon-vien-anh-chup/enscape_2021-08-09-14-00-56.jpg'; // DOC
const MAT_TIEN_FUSION = '/images/01_NyAh-PhuDinh/noi_that/fusion_gen_5/fusion-gen-5_mat-tien.jpg';              // DOC

const SLOGAN = 'Sống đẹp hơn chung cư — Sinh lời hơn thổ cư';

const CASES: DemoCase[] = [
  {
    id: '1-ngang', label: '1 ảnh — NGANG', title: 'Bếp và phòng ăn',
    points: ['Đảo bếp kiêm quầy bar', 'Tủ lạnh side by side, máy rửa chén'],
    speech_text: 'Gian bếp mở với đảo bar là nơi cả nhà quây quần mỗi ngày ạ.',
    imgs: [{ src: BEP_COSMO, orient: 'landscape' }],
  },
  {
    id: '1-doc', label: '1 ảnh — DỌC', title: 'Thang xoắn biến hóa',
    points: ['Giải phóng không gian từng tầng', 'Điểm nhấn kiến trúc độc bản'],
    speech_text: 'Thang xoắn biến hóa là chữ ký thiết kế riêng của Nhã Đạt.',
    imgs: [{ src: THANG_XOAN, orient: 'portrait' }],
  },
  {
    id: '2-ngang', label: '2 ảnh — CÙNG NGANG', title: 'Tiện ích và tiến độ',
    points: ['Cổng chính tự động, compound biệt lập', 'Tiến độ xây dựng cập nhật tháng 5'],
    speech_text: 'Khu compound đã hoàn thiện cổng chào và đang xây đúng tiến độ ạ.',
    imgs: [{ src: CONG_VAO, orient: 'landscape' }, { src: TIEN_DO, orient: 'landscape' }],
  },
  {
    id: '2-doc', label: '2 ảnh — CÙNG DỌC', title: 'Hai phong cách phòng khách',
    points: ['Fusion Gen 5 — thông tầng siêu sáng', 'Cosmo Gen 2 — mặt tiền 5 mét'],
    speech_text: 'Anh chị so sánh trực tiếp hai mẫu phòng khách được yêu thích nhất.',
    imgs: [{ src: PK_FUSION, orient: 'portrait' }, { src: PK_COSMO, orient: 'portrait' }],
  },
  {
    id: '2-tron', label: '2 ảnh — TRỘN (DỌC + NGANG)', title: 'Vị trí và phân lô',
    points: ['Bản đồ phân lô kèm diện tích từng căn', 'Chỉ 18 phút về Quận 1'],
    speech_text: 'Sơ đồ phân lô chi tiết và đường về Quận 1 chỉ 18 phút ạ.',
    imgs: [{ src: PHAN_LO, orient: 'portrait' }, { src: MAP_18P, orient: 'landscape' }],
  },
  {
    id: '3-ngang', label: '3 ảnh — CÙNG NGANG', title: 'Một vòng dự án',
    points: ['Cổng vào — Bếp mẫu — Công trường thật'],
    speech_text: 'Ba góc nhìn từ tiện ích, nhà mẫu đến tiến độ thi công thực tế.',
    imgs: [
      { src: CONG_VAO, orient: 'landscape' },
      { src: BEP_COSMO, orient: 'landscape' },
      { src: TIEN_DO, orient: 'landscape' },
    ],
  },
  {
    id: '3-doc', label: '3 ảnh — CÙNG DỌC', title: 'Ba chất sống Ny’ah',
    points: ['Thang xoắn — Khuôn viên xanh — Signature'],
    speech_text: 'Từ kiến trúc, cảnh quan đến nội thất, góc nào cũng đáng sống.',
    imgs: [
      { src: THANG_XOAN, orient: 'portrait' },
      { src: KHUON_VIEN, orient: 'portrait' },
      { src: PK_SIGNATURE, orient: 'portrait' },
    ],
  },
  {
    id: '3-tron', label: '3 ảnh — TRỘN', title: 'Tổng quan Fusion Gen 5',
    points: ['Vị trí — Mặt tiền — Gian bếp'],
    speech_text: 'Kết nối giao thông, mặt tiền và gian bếp của mẫu Fusion ạ.',
    imgs: [
      { src: MAP_18P, orient: 'landscape' },
      { src: MAT_TIEN_FUSION, orient: 'portrait' },
      { src: BEP_COSMO, orient: 'landscape' },
    ],
  },
  {
    id: '0-anh', label: 'KHÔNG ẢNH — CHỈ TEXT', title: 'Chính sách thanh toán',
    highlight_number: '3%/tháng',
    points: ['Đặt cọc 10%, mỗi tháng chỉ 3%', 'Bàn giao 8%, sang tên 61%', 'BIDV & Vietcombank cho vay 50%'],
    speech_text: 'Anh chị chỉ cần đóng 3 phần trăm mỗi tháng cho đến khi nhận nhà.',
    imgs: [],
  },
];

// Header + marquee giong het trang that, bao quanh SlideBody.
function DemoFrame({ c, replayKey }: { c: DemoCase; replayKey: number }) {
  const orientMap: Record<string, Orient> = {};
  c.imgs.forEach(im => { orientMap[im.src] = im.orient; });
  const data: SlideBodyData = {
    title: c.title, points: c.points, speech_text: c.speech_text,
    highlight_number: c.highlight_number, image_urls: c.imgs.map(i => i.src),
  };

  return (
    <div className="relative w-full h-full flex flex-col bg-[#F5F3EC] text-[#161616] overflow-hidden">
      {/* trang tri nhe */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="dots absolute top-[7%] right-[6%] w-[16%] h-[9%] opacity-40" />
        <div className="absolute -top-[7%] -left-[9%] w-[34%] aspect-square rounded-full bg-[#E3F0E3]/60" />
        <div className="absolute top-[15%] -right-[8%] w-[26%] aspect-square rounded-full border-2 border-[#2E9E5B]/12" />
        <div className="dots absolute bottom-[7%] left-[4%] w-[13%] h-[9%] opacity-30" />
      </div>

      {/* header */}
      <div className="relative z-10 px-[5%] pt-[2.5%] pb-[1.5%] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-[2.5%]">
          <span className="w-[9cqw] h-[9cqw] max-w-[54px] max-h-[54px] rounded-[2.5cqw] overflow-hidden bg-white shadow-sm border border-black/5 flex items-center justify-center shrink-0">
            <img src="/logo.svg" alt="" className="w-[82%] h-[82%] object-contain" />
          </span>
          <div>
            <p className="font-black tracking-tight leading-[1.2] text-[clamp(11px,3.6cqw,26px)]">NY&apos;AH PHÚ ĐỊNH</p>
            <p className="text-neutral-500 font-semibold tracking-[0.2em] uppercase mt-[0.3cqw] text-[clamp(6px,1.9cqw,13px)]">A development by Nhã Đạt</p>
          </div>
        </div>
        <span className="px-[3cqw] py-[1.2cqw] rounded-full bg-[#E3F0E3] text-[#0E5A34] border border-[#2E9E5B]/30 font-bold uppercase text-[clamp(7px,2.3cqw,15px)] flex items-center gap-[1.4cqw]">
          <span className="flex items-end gap-[0.5cqw] h-[2.4cqw]" aria-hidden>
            <span className="w-[0.6cqw] bg-[#0E5A34] rounded-full" style={{ height: '45%' }} />
            <span className="w-[0.6cqw] bg-[#0E5A34] rounded-full" style={{ height: '100%' }} />
            <span className="w-[0.6cqw] bg-[#0E5A34] rounded-full" style={{ height: '60%' }} />
          </span>
          Đang nghe
        </span>
      </div>

      {/* than slide dung chung */}
      <div className="relative z-10 flex-1 min-h-0">
        <SlideBody data={data} orientOf={(s) => orientMap[s] || 'landscape'} replayKey={replayKey} />
      </div>

      {/* marquee */}
      <div className="relative z-10 shrink-0 overflow-hidden bg-[#0E5A34] py-[1.4cqw]">
        <div className="marquee-track flex w-max items-center gap-[6cqw] whitespace-nowrap font-black uppercase tracking-wider text-[#F5F3EC] text-[clamp(9px,2.6cqw,20px)]">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="flex items-center gap-[6cqw]">
              <span>{SLOGAN}</span>
              <span className="w-[1.4cqw] h-[1.4cqw] rounded-full bg-[#A8D94A] inline-block" />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SlideDemoPage() {
  const [replays, setReplays] = useState<Record<string, number>>({});
  const replay = (id: string) => setReplays(r => ({ ...r, [id]: (r[id] || 0) + 1 }));

  return (
    <div className="min-h-screen bg-[#0E1512] text-white p-8" style={{ fontFamily: "'Be Vietnam Pro', 'Inter', system-ui, sans-serif" }}>
      <style dangerouslySetInnerHTML={{ __html: `
        .dots { background-image: radial-gradient(rgba(22,22,22,.28) 1.4px, transparent 1.4px); background-size: 13px 13px; }
        .line-mask { overflow: hidden; padding: 0.14em 0 0.2em; margin: -0.14em 0 -0.2em; }
        .line-in { animation: lineUp .6s cubic-bezier(.22,1,.36,1) both, glowFade .95s ease-out both; will-change: transform, opacity; }
        @keyframes lineUp { 0% { transform: translateY(140%); opacity: 0; } 55% { opacity: 1; } 100% { transform: translateY(0); opacity: 1; } }
        @keyframes glowFade { 0% { text-shadow: 0 0 16px rgba(255,255,255,.9), 0 4px 24px rgba(46,158,91,.4); } 100% { text-shadow: 0 0 0 rgba(255,255,255,0), 0 0 0 rgba(46,158,91,0); } }
        .img-card { animation: imgIn .7s cubic-bezier(.22,1,.36,1) both; will-change: transform, opacity; }
        @keyframes imgIn { 0% { opacity: 0; transform: translateY(22px) scale(.965); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        .marquee-track { animation: marquee 26s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      ` }} />

      <div className="max-w-[1560px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Demo Slide — 9 trường hợp (bản Framer)</h1>
            <p className="text-neutral-400 mt-1 text-sm">
              Ảnh không crop, hiện hết cùng lúc theo số lượng &amp; hướng. Dùng chung <strong className="text-[#A8D94A]">SlideBody</strong> với trang thật. <strong className="text-[#A8D94A]">Bấm vào khung để chạy lại animation.</strong>
            </p>
          </div>
          <Link href="/slide" className="px-4 py-2 rounded-full bg-white/10 text-white font-bold text-sm hover:bg-white/20 transition">← Trang Slide thật</Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-8">
          {CASES.map(c => (
            <div key={c.id}>
              <p className="mb-2 font-bold text-[#A8D94A] text-sm uppercase tracking-wider">{c.label}</p>
              <div
                className="aspect-[9/16] rounded-[28px] overflow-hidden shadow-2xl ring-1 ring-white/10 cursor-pointer hover:ring-[#2E9E5B]/60 transition"
                title="Bấm để chạy lại animation"
                onClick={() => replay(c.id)}
              >
                <DemoFrame c={c} replayKey={replays[c.id] || 0} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
