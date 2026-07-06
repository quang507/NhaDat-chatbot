import EmbedChatContent from '@/components/EmbedChatContent';

// Trang chỉ chứa chat content (không button), để nhúng qua iframe vào WordPress/website khác
// Plugin WordPress sẽ quản lý button toggle, page này chỉ cung cấp nội dung chat
export default function EmbedPage() {
  return (
    <>
      <style>{`html,body{background:transparent !important;margin:0;padding:0;overflow:hidden;}`}</style>
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <EmbedChatContent />
      </div>
    </>
  );
}
