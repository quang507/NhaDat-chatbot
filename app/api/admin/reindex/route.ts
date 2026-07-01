import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';

// ĐÃ KHÓA: nguồn chỉ mục chính thức (index.json) giờ do sync_and_reindex.js quản lý
// (chạy qua Chay_Dong_Bo.bat, đọc từ OneDrive ChatBotData_Upload/ChatBotImages_Upload).
// Route này từng build lại TOÀN BỘ index từ data.md và GHI ĐÈ index.json trên nhánh
// chatbot-logs — mỗi lần bấm sẽ xóa sạch dữ liệu mà sync_and_reindex.js vừa đồng bộ
// (2 hệ thống ghi đè lẫn nhau, không dedup được vì mỗi bên chỉ biết nguồn của mình).
// Muốn cập nhật chỉ mục: sửa dữ liệu trong OneDrive rồi chạy Chay_Dong_Bo.bat.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  return NextResponse.json(
    {
      error:
        'Đã tắt: chỉ mục (index.json) giờ chỉ được cập nhật qua Chay_Dong_Bo.bat (đồng bộ từ OneDrive). ' +
        'Rebuild qua web sẽ ghi đè và xóa mất dữ liệu đã đồng bộ. Hãy sửa file trong OneDrive rồi chạy lại bat.',
    },
    { status: 409 }
  );
}
