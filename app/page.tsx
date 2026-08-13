import ChatPanel from '@/components/ChatPanel';

// Trang chủ = khung chat FULL TRANG, đồng bộ trải nghiệm với /voice và /slide
// (widget nổi góc phải đã bỏ 08/2026 - khách vào là chat được ngay).
// style height:100dvh đè h-screen trên trình duyệt mới để thanh địa chỉ
// mobile không che ô nhập; trình duyệt cũ không hiểu dvh thì rơi về h-screen.
export default function Home() {
  return (
    <main className="h-screen" style={{ height: '100dvh' }}>
      <ChatPanel fullPage />
    </main>
  );
}
