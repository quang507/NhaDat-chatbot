import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/admin';

export const runtime = 'nodejs';

// ĐÃ KHÓA: cùng lý do với /api/admin/reindex — nguồn chỉ mục chính thức (index.json)
// giờ do sync_and_reindex.js quản lý (chạy qua Chay_Dong_Bo.bat, đọc từ OneDrive).
// Route này từng embed nội dung crawl và MERGE thẳng vào index.json trên nhánh
// chatbot-logs. Vì chunk thêm vào đây gắn file: 'data.md' (không có trong OneDrive),
// lần chạy Chay_Dong_Bo.bat kế tiếp sẽ XÓA MẤT các chunk này — tốn API embedding
// vô ích và tạo cảm giác sai là nội dung crawl đã vào được RAG.
// Muốn đưa nội dung crawl vào RAG: lưu file .md vào OneDrive ChatBotData_Upload
// rồi chạy Chay_Dong_Bo.bat như bình thường.
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Sai mật khẩu' }, { status: 401 });
  }
  return NextResponse.json(
    {
      error:
        'Đã tắt: chỉ mục (index.json) giờ chỉ được cập nhật qua Chay_Dong_Bo.bat (đồng bộ từ OneDrive). ' +
        'Hãy lưu nội dung crawl thành file .md vào thư mục OneDrive ChatBotData_Upload rồi chạy lại bat.',
    },
    { status: 409 }
  );
}
