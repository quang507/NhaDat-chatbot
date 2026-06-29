// lib/speech.ts — Tiện ích giọng nói DÙNG CHUNG cho cả trang /voice và /slide.
// Mục tiêu: 1 nguồn sự thật cho việc làm sạch chữ + tách câu, để TTS đọc
// đồng nhất ở mọi trang (trước đây mỗi trang tự viết một kiểu nên bị lệch).
// Đây là util thuần (pure functions) chạy ở client — không gọi API, không state.

// ───────────────────────────────────────────────────────────────────────────
// 1) Làm sạch & chuẩn hóa chữ trước khi đưa vào TTS (đọc tự nhiên kiểu ChatGPT Voice)
// ───────────────────────────────────────────────────────────────────────────
export function cleanTextForTTS(text: string): string {
  if (!text) return '';

  // Bỏ các dòng chứa Google Maps / link / website / bản đồ (không cần đọc ra)
  const cleanedLines = text.split('\n').filter((line) => {
    const l = line.toLowerCase();
    return !(l.includes('google maps') || l.includes('link') || l.includes('website') || l.includes('bản đồ'));
  });
  let clean = cleanedLines.join('\n');

  // Bỏ URL
  clean = clean.replace(/https?:\/\/\S+|www\.\S+/g, '');

  // Khoảng số: "5-7 tỷ" -> "5 đến 7 tỷ"
  clean = clean.replace(/(\d+)\s*-\s*(\d+)/g, '$1 đến $2');

  // Mã lô/căn: "#03" -> "số 3" (tránh đọc thành "thăng không ba")
  clean = clean.replace(/#\s*0*(\d+)/g, 'số $1');

  // Kích thước "5x20", "5 x 9m" -> "5 nhân 20"
  clean = clean.replace(/(\d+)\s*[xX]\s*(\d+)/g, '$1 nhân $2');

  // Dấu ba chấm -> ngắt nghỉ nhẹ (tránh đọc lắp)
  clean = clean.replace(/\.{2,}/g, ', ');

  // m2 / m² đứng sau số -> "mét vuông" (né mã block kiểu M2, A2)
  clean = clean.replace(/(\d+)\s*(m²|m2)\b/gi, '$1 mét vuông');

  // Tiền tệ
  clean = clean.replace(/(\d+)\s*(VNĐ|VND|đ)\b/gi, '$1 đồng');

  // Phần trăm
  clean = clean.replace(/(\d+)\s*%/g, '$1 phần trăm');

  // Số điện thoại -> đọc từng chữ số (090 123 4567 -> 0 9 0   1 2 3   4 5 6 7)
  clean = clean.replace(/\b(0[35789]\d)[\s.-]?(\d{3})[\s.-]?(\d{3,4})\b/g, (_m, p1, p2, p3) => {
    const a = p1.split('').join(' ');
    const b = p2.split('').join(' ');
    const c = p3.split('').join(' ');
    return `${a}   ${b}   ${c}`;
  });

  // Tên thương hiệu & viết tắt
  const replacements: [RegExp, string][] = [
    [/\bNhã Đạt Co\.\s*Ltd\b/gi, 'công ty cổ phần nhã đạt'],
    [/\bNhaDat Co\.\s*Ltd\b/gi, 'công ty cổ phần nhã đạt'],
    [/\bNhã Đạt Co\.ltd\b/gi, 'công ty cổ phần nhã đạt'],
    [/\bNhaDat Co\.ltd\b/gi, 'công ty cổ phần nhã đạt'],
    [/\bNhã Đạt Co\b/gi, 'nhã đạt'],
    [/\bNhaDat Co\b/gi, 'nhã đạt'],
    [/\bCo\.\s*Ltd\b/gi, 'công ty cổ phần'],
    [/\bCo\.ltd\b/gi, 'công ty cổ phần'],
    [/\bLtd\.\b/gi, 'công ty cổ phần'],
    [/\bCo\.\b/gi, 'công ty'],
    [/\bTP\.HCM\b/gi, 'Thành phố Hồ Chí Minh'],
    [/\bTpHCM\b/gi, 'Thành phố Hồ Chí Minh'],
    [/\bHCM\b/gi, 'Hồ Chí Minh'],
    [/\bQ\b\.(\d+)/gi, 'Quận $1'],
    [/\bđ\/c\b/gi, 'địa chỉ'],
    [/\bĐ\/c\b/gi, 'Địa chỉ'],
    [/\bđ\/c\.\b/gi, 'địa chỉ'],
    [/\bNy'ah\b/gi, 'Ni a'],
    [/\bNyah\b/gi, 'Ni a'],
    [/\bVilla\b/gi, 'biệt thự'],
    [/\bTS\.\b/gi, 'Tiến sĩ'],
    [/\banh\/chị\b/gi, 'anh chị'],
    [/\bAnh\/Chị\b/gi, 'Anh chị'],
  ];
  replacements.forEach(([pattern, replacement]) => {
    clean = clean.replace(pattern, replacement);
  });

  // Bỏ markdown
  clean = clean.replace(/\*\*/g, '').replace(/__/g, '').replace(/\*/g, '').replace(/`/g, '');

  // Bỏ bullet đầu dòng
  clean = clean.replace(/^\s*[-*+]\s+/gm, ' ');

  // Bỏ số thứ tự đầu câu ("1. ", "2)") — yêu cầu có space/hết chuỗi sau dấu chấm
  // -> KHÔNG đụng tới "1.5 tỷ"
  clean = clean.replace(/^\s*\d{1,2}[.)](\s+|$)/, ' ');

  // Chỉ giữ chữ cái, số, khoảng trắng và dấu câu cơ bản
  clean = clean.replace(
    /[^a-zA-Z0-9\s.,;:?!áàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐ]/g,
    ' '
  );

  return clean.replace(/\s+/g, ' ').trim();
}

// ───────────────────────────────────────────────────────────────────────────
// 2) Tách câu thông minh (dùng cho luồng STREAM của /voice).
//    Trả về các câu đã hoàn chỉnh + phần còn dư (remaining) để gộp với chunk sau.
//    Né các trường hợp dễ cắt nhầm: số thập phân (1.5), viết tắt (Co., Q.8, TP.HCM), "...".
// ───────────────────────────────────────────────────────────────────────────
const ABBREVIATIONS = ['co', 'ltd', 'ts', 'tp', 'dc', 'đc'];
const VN_LETTER =
  'a-zA-ZáàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđĐ';
const VN_LOWER = 'a-zàảãạăằẳẵặâấầẩẫậèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ';
const RE_VN_LETTER = new RegExp(`[${VN_LETTER}]`);
const RE_VN_LOWER = new RegExp(`[${VN_LOWER}]`);

export function splitSentences(buffer: string): { sentences: string[]; remaining: string } {
  const sentences: string[] = [];
  let i = 0;

  while (i < buffer.length) {
    const char = buffer[i];
    if (['.', '?', '!', '\n'].includes(char)) {
      let isEnding = true;

      if (char === '.') {
        // Số thập phân (1.5 tỷ)
        if (i > 0 && i < buffer.length - 1 && /\d/.test(buffer[i - 1]) && /\d/.test(buffer[i + 1])) {
          isEnding = false;
        }
        // Chữ cái + . + số (Q.8, P.16, A.1) -> viết tắt địa chỉ
        if (isEnding && i > 0 && i < buffer.length - 1 && /[a-zA-ZÀ-ỹ]/.test(buffer[i - 1]) && /\d/.test(buffer[i + 1])) {
          isEnding = false;
        }
        // Dấu ba chấm liền nhau
        if (isEnding && (buffer[i + 1] === '.' || buffer[i - 1] === '.')) {
          isEnding = false;
        }
        // Dấu chấm giữa 2 chữ cái không có space (TP.HCM, Co.ltd)
        if (isEnding && i > 0 && i < buffer.length - 1 && RE_VN_LETTER.test(buffer[i - 1]) && RE_VN_LETTER.test(buffer[i + 1])) {
          isEnding = false;
        }
        // Dấu chấm theo sau bởi chữ thường (viết tắt + space)
        if (isEnding) {
          let nextIdx = i + 1;
          while (nextIdx < buffer.length && /\s/.test(buffer[nextIdx])) nextIdx++;
          if (nextIdx < buffer.length && RE_VN_LOWER.test(buffer[nextIdx])) {
            isEnding = false;
          }
        }
        // Dấu chấm đứng sau từ viết tắt đã biết (Co., TS., Tp.)
        if (isEnding) {
          const words = buffer.substring(0, i).split(/[\s,;:?!\n]/);
          const lastWord = (words[words.length - 1] || '').toLowerCase().replace(/[^a-zđ]/g, '');
          if (ABBREVIATIONS.includes(lastWord)) isEnding = false;
        }
      }

      if (isEnding) {
        const sentence = buffer.substring(0, i + 1).trim();
        buffer = buffer.substring(i + 1);
        i = 0;
        if (sentence) sentences.push(sentence);
        continue;
      }
    }
    i++;
  }
  return { sentences, remaining: buffer };
}

// ───────────────────────────────────────────────────────────────────────────
// 3) Tách câu cho luồng MỘT LẦN (dùng cho /slide — nhận trọn speech_text).
//    Trả về mảng câu đã làm sạch, sẵn sàng đưa vào TTS.
// ───────────────────────────────────────────────────────────────────────────
export function splitCleanSentences(text: string): string[] {
  const { sentences, remaining } = splitSentences(text || '');
  const all = remaining.trim() ? [...sentences, remaining.trim()] : sentences;
  return all.map((s) => cleanTextForTTS(s)).filter(Boolean);
}

// ───────────────────────────────────────────────────────────────────────────
// 4) Dựng URL gọi /api/tts (kèm tốc độ đọc tùy chọn, vd "+15%")
// ───────────────────────────────────────────────────────────────────────────
export function ttsUrl(text: string, rate?: string): string {
  const r = rate && /^[+-]\d{1,3}%$/.test(rate) ? `rate=${encodeURIComponent(rate)}&` : '';
  return `/api/tts?${r}text=${encodeURIComponent(text)}`;
}
