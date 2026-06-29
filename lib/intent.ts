export type AmbientIntent = {
  shouldGenerate: boolean;
  reason: 'too_short' | 'filler' | 'has_project_topic' | 'explicit_slide_request';
  confidence: number;
  topic?: 'price' | 'location' | 'unit' | 'legal' | 'amenity' | 'design' | 'general';
};

const FILLER_WORDS = [
  'ừ', 'ok', 'đúng rồi', 'cái đó đẹp', 'rồi sao nữa', 'anh thấy ổn', 'vâng', 'à ừ', 'thế à', 'ừ nhỉ', 'được rồi', 'thì cũng tốt', 'ok em', 'dạ', 'dạ anh', 'dạ chị'
];

const EXPLICIT_TRIGGERS = [
  'cho khách xem', 'mở slide', 'hiện cái', 'show phần', 'trình chiếu', 'mở hình', 'cho xem', 'nhìn trên màn hình', 'em mở', 'mở cho'
];

const TOPIC_KEYWORDS = {
  price: [
    'giá', 'bao nhiêu tiền', 'thanh toán', 'đặt cọc', 'chiết khấu', 'vay', 'ngân hàng', 
    'lãi suất', 'tỷ', 'triệu', 'bảng giá', 'giá bán', 'booking', 'chính sách', 'pttt', 
    'trả góp', 'ân hạn', 'vốn tự có', 'nợ gốc', 'tài chính', 'báo giá', 'giá rumor', 'giá trần'
  ],
  location: [
    'vị trí', 'địa chỉ', 'bản đồ', 'quận', 'đường', 'bình chánh', 'an dương vương', 'quận 8', 
    'đi lại', 'di chuyển', 'kết nối', 'mặt tiền', 'hẻm', 'cách bao xa', 'km', 'phút', 
    'hướng đi', 'quận 6', 'võ văn kiệt', 'quốc lộ', 'giao thông', 'ngập nước', 'triều cường'
  ],
  unit: [
    'căn số', 'lô', 'diện tích', 'tầng', 'gara', 'thang máy', 'sân thượng', 'phòng ngủ', 
    'phòng khách', 'phòng tắm', 'bếp', 'phòng học', 'toilet', 'wc', 'ban công', 'ngang', 
    'dài', 'trệt', 'lầu', 'lửng', 'áp mái', 'm2', 'mét vuông', 'hướng cửa', 'hướng nhà', 
    'hướng ban công', 'tây tứ trạch', 'đông tứ trạch'
  ],
  legal: [
    'pháp lý', 'sổ hồng', 'hợp đồng', 'cam kết', 'qsdđ', 'sổ đỏ', 'quy hoạch', 'giấy phép', 
    'xây dựng', 'gpxd', 'hoàn công', 'sở hữu', 'lâu dài', 'thời hạn', 'sang tên', 
    'công chứng', 'hdmb', 'văn bản thỏa thuận', 'phê duyệt'
  ],
  amenity: [
    'tiện ích', 'công viên', 'hồ bơi', 'cầu lông', 'bóng rổ', 'sinh thái', 'xanh', 
    'trung tâm thương mại', 'metro', 'landmark', 'bảo vệ', 'an ninh', 'camera', 
    'chỗ đậu xe', 'bãi giữ xe', 'gym', 'spa', 'bbq', 'trường học', 'bệnh viện', 
    'siêu thị', 'chợ', 'khu dân cư', 'compound', 'biệt lập'
  ],
  design: [
    'mặt bằng', 'mẫu nhà', 'thiết kế', 'nội thất', 'phối cảnh', 'nhà phố', 'layout', 
    'kiến trúc', 'phong cách', 'cảnh quan', 'hoàn thiện', 'giao thô', 'vật liệu', 
    'chuẩn', 'hiện đại', 'cổ điển', 'tân cổ điển', 'không gian', 'giếng trời', 'thông tầng'
  ],
  general: [
    'phú định', "ny'ah", 'nyah', 'niah', 
    'cosmo', 'cót mô', 'cót-mô', 'cốt mô',
    'fusion', 'phiêu dân', 'phiêu-dân',
    'opus', 'ô-pút', 'ô pút', 'o pút',
    'office', 'cashmere', 
    'nhà đạt', 'nha dat', 'công ty', 'chủ đầu tư', 'founder', 'nhà mẫu', 'sa bàn', 
    'tiến độ', 'khởi công', 'bàn giao', 'chủ thầu', 'đơn vị thi công', 'phát triển', 'dự án'
  ]
};

export function classifyAmbientIntent(text: string): AmbientIntent {
  const clean = text.toLowerCase().trim();
  const wordCount = clean.split(/\s+/).length;

  if (wordCount < 3 && !EXPLICIT_TRIGGERS.some(t => clean.includes(t))) {
    return { shouldGenerate: false, reason: 'too_short', confidence: 1.0 };
  }

  // Kiểm tra filler (các câu cửa miệng không mang thông tin query)
  const isFiller = FILLER_WORDS.some(filler => clean === filler || clean.includes(' ' + filler + ' '));
  if (isFiller && wordCount < 5) {
    return { shouldGenerate: false, reason: 'filler', confidence: 0.9 };
  }

  // 1. Kiểm tra explicit triggers (yêu cầu trình chiếu rõ ràng)
  for (const trigger of EXPLICIT_TRIGGERS) {
    if (clean.includes(trigger)) {
      return { shouldGenerate: true, reason: 'explicit_slide_request', confidence: 1.0, topic: 'general' };
    }
  }

  // 2. Phân loại theo Topic
  let bestTopic: keyof typeof TOPIC_KEYWORDS | undefined;
  
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => clean.includes(kw))) {
      bestTopic = topic as keyof typeof TOPIC_KEYWORDS;
      break; 
    }
  }

  if (bestTopic) {
    return { shouldGenerate: true, reason: 'has_project_topic', confidence: 0.8, topic: bestTopic };
  }

  return { shouldGenerate: false, reason: 'filler', confidence: 0.5 };
}
