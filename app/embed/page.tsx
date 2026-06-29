import ChatWidget from '@/components/ChatWidget';

// Trang chỉ chứa widget chat, nền trong suốt, để nhúng qua iframe vào WordPress/website khác
export default function EmbedPage() {
  return (
    <>
      <style>{`html,body{background:transparent !important;margin:0;padding:0;}`}</style>
      <ChatWidget />
    </>
  );
}
