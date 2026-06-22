import DifyChatbot from '@/components/DifyChatbot';

// Trang chỉ chứa widget chat, nền trong suốt, để nhúng qua iframe vào WordPress/website khác
export default function EmbedPage() {
  return (
    <>
      <style>{`html,body{background:transparent !important;margin:0;padding:0;}`}</style>
      <DifyChatbot />
    </>
  );
}
