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

// ĐÃ THU HẸP: chỉ giữ từ ĐẶC TRƯNG sản phẩm, bỏ các từ đời thường (tỷ, phút, quận, đường,
// chợ, trường học, tầng, hiện đại, "dự án"...) vì chúng bắn slide lung tung trong lúc nói chuyện.
const TOPIC_KEYWORDS = {
  price: [
    'giá bán', 'bảng giá', 'bao nhiêu tiền', 'mấy tỷ', 'thanh toán', 'đặt cọc',
    'chiết khấu', 'trả góp', 'ân hạn', 'pttt', 'booking', 'báo giá'
  ],
  location: [
    'vị trí', 'địa chỉ', 'bản đồ', 'an dương vương', 'trương đình hội', 'võ văn kiệt',
    'mặt tiền', 'cách trung tâm', 'bao xa', 'ở đâu', 'nằm ở'
  ],
  unit: [
    'căn số', 'diện tích', 'gara', 'thang máy', 'thang xoắn', 'sân thượng', 'phòng ngủ',
    'phòng khách', 'phòng tắm', 'phòng bếp', 'phòng học', 'ban công', 'master',
    'hướng nhà', 'giếng trời', 'thông tầng'
  ],
  legal: [
    'pháp lý', 'sổ hồng', 'sổ đỏ', 'qsdđ', 'quy hoạch', 'giấy phép', 'hoàn công',
    'sở hữu lâu dài', 'sang tên', 'hợp đồng mua bán', 'hdmb'
  ],
  amenity: [
    'tiện ích', 'công viên', 'hồ bơi', 'bể bơi', 'cầu lông', 'bóng rổ', 'sân thể thao',
    'landmark', 'khu vui chơi', 'sân chơi'
  ],
  design: [
    'mặt bằng', 'mẫu nhà', 'thiết kế nhà', 'nội thất', 'phối cảnh', 'kiến trúc nhà', 'sa bàn'
  ],
  general: [
    'phú định', "ny'ah", 'nyah', 'niah',
    'cosmo', 'cót mô', 'cốt mô',
    'fusion', 'phiêu dân',
    'opus', 'ô-pút', 'ô pút',
    'cashmere', 'signature',
    'nhã đạt', 'nha dat', 'chủ đầu tư', 'nhà mẫu', 'tiến độ', 'bàn giao'
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

  // 2. Kích hoạt khi câu có TÊN RIÊNG (general) HOẶC chứa bất kỳ từ khóa chuyên biệt nào của dự án
  // (vị trí, giá bán, gara, phòng ngủ, pháp lý, sổ hồng, công viên, mặt bằng...)
  const hasProperName = TOPIC_KEYWORDS.general.some(kw => clean.includes(kw));
  let bestTopic: keyof typeof TOPIC_KEYWORDS | null = null;
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (topic === 'general') continue;
    if (keywords.some(kw => clean.includes(kw))) {
      bestTopic = topic as keyof typeof TOPIC_KEYWORDS;
      break;
    }
  }

  if (!hasProperName && !bestTopic) {
    return { shouldGenerate: false, reason: 'filler', confidence: 0.6 };
  }

  return { 
    shouldGenerate: true, 
    reason: 'has_project_topic', 
    confidence: 0.85, 
    topic: bestTopic || 'general' 
  };
}
