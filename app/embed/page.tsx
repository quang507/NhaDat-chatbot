import ChatPanel from '@/components/ChatPanel';

// Trang chỉ chứa chat content (không button), để nhúng qua iframe vào WordPress/website khác
// Plugin WordPress sẽ quản lý button toggle, page này chỉ cung cấp nội dung chat
export default function EmbedPage() {
  return (
    <>
      <style>{`html,body{background:transparent !important;margin:0;padding:0;overflow:hidden;height:100%;}`}</style>
      <div style={{ width: '100%', height: '100vh', display: 'flex' }}>
        <ChatPanel embedded />
      </div>
    </>
  );
}
