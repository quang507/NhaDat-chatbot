// Cấu hình hiển thị của chatbot (gợi ý câu hỏi, số điện thoại, Zalo).
// Lưu ở config.json trên nhánh main, admin chỉnh được, widget chat đọc công khai.
import { getFile, saveFile } from '@/lib/admin';

export interface BotConfig {
  suggestions: string[]; // câu hỏi gợi ý khi mở chat
  phone: string; // hotline để gọi
  zalo: string; // link Zalo (vd https://zalo.me/0901234567)
}

export const DEFAULT_CONFIG: BotConfig = {
  suggestions: [
    'Dự án có những loại sản phẩm nào?',
    'Giá và chính sách thanh toán ra sao?',
    'Vị trí dự án ở đâu, di chuyển thế nào?',
    'Pháp lý dự án hiện tại như thế nào?',
  ],
  phone: '',
  zalo: '',
};

export async function getConfig(): Promise<BotConfig> {
  try {
    const { content } = await getFile('config.json');
    if (!content.trim()) return DEFAULT_CONFIG;
    const parsed = JSON.parse(content);
    return {
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : DEFAULT_CONFIG.suggestions,
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      zalo: typeof parsed.zalo === 'string' ? parsed.zalo : '',
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(cfg: BotConfig): Promise<void> {
  await saveFile('config.json', JSON.stringify(cfg, null, 2), 'Cập nhật cấu hình bot từ admin');
}
