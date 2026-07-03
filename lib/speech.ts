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

  // Phân số: "2/3", "1/2" -> "2 phần 3", "1 phần 2"
  clean = clean.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 phần $2');

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

// ───────────────────────────────────────────────────────────────────────────
// 5) Chuẩn hóa lỗi nhận diện (STT) tiếng Việt (dùng chung cho /voice và /slide)
// ───────────────────────────────────────────────────────────────────────────
const vnWord = (core: string) =>
  new RegExp(`(^|[^a-zà-ỹ0-9])(?:${core})(?![a-zà-ỹ0-9])`, 'gi');

const VN_SPEECH_FIXES: [RegExp, string][] = [
  // Tên dự án Ny'ah Phú Định
  [vnWord('ph[ốôuú]\\s*(?:đêm|định|đỉnh|đính|dinh|đin)'), 'phú định'],
  [vnWord("ny[\\s']*ah|ni\\s*a|nia|niah"), "ny'ah"],
  // Mẫu nhà — đặt cụm dài/cụ thể TRƯỚC cụm ngắn để không bị nuốt nhầm
  [vnWord('bếp\\s*(?:full|phun|phu|fun)\\s*(?:size|sai|sài|xai|sài?z)'), 'bếp fullsize'],
  [vnWord('cô\\s*gái\\s*của\\s*cô\\s*t[\\s-]*m[ôo]'), 'cosmo gen 2'],
  [vnWord('c[ốôo]t?[\\s-]*m[ôoơ]|c[ộô]t\\s*mô|cosmos|cot\\s*mo|cô\\s*t[\\s-]*m[ôo]'), 'cosmo'],
  [vnWord('ph(?:iu|iêu|i u)\\s*(?:giần|dân|gân|giàn)|fiu\\s*s[ầừ]n|ph[uùú]\\s*s[ầàẩ]n|phu\\s*san|fu\\s*sần'), 'fusion'],
  [vnWord('ô\\s*p(?:út|ut|ức|ớt|ợt|ót|ốt|ợc)|o\\s*p[úớ]t|âu\\s*p[ớú]t|ốp\\s*p[úớ]t|ô\\s*b[úớ]t|op[úớ]t'), 'opus'],
  [vnWord('[sx]i\\s*nha\\s*(?:t[ơưa]|ch[ơo])|sích\\s*na\\s*ch[ơo]|sin\\s*nh[ơa]'), 'signature'],
  [vnWord('cát\\s*m[ie]a?|cách\\s*mia|kát\\s*mia|cát\\s*me|cát\\s*mê'), 'cashmere'],
  [vnWord('óp\\s*ph[íi]t|ô\\s*ph[íi]t|óp\\s*f[íi]t|o\\s*ph[íi]t|óp\\s*phích'), 'office'],
  // Thương hiệu / địa danh
  [vnWord('nha\\s*dat|da\\s*đạt|nhả\\s*đạt'), 'nhã đạt'],
  [vnWord('ch[ưu]ơng\\s*đình\\s*hội|trương\\s*đình\\s*hồi'), 'trương đình hội'],
  [vnWord('võ\\s*văn\\s*ki[ệê]t|vỏ\\s*văn\\s*kiệt'), 'võ văn kiệt'],
  [vnWord('nguyễn\\s*văn\\s*lin[hg]'), 'nguyễn văn linh'],
  [vnWord('quận\\s*tám'), 'quận 8'],
  [vnWord('e\\s*ơ\\s*t[óo]p|ép\\s*tóp|air\\s*tóp'), 'airtop'],
  // Phòng ốc — để bắt từ khóa ra ảnh đúng
  [vnWord('ga[\\s-]*ra|ga\\s*ra'), 'gara'],
  [vnWord('thang\\s*má[yi]|thang\\s*mai'), 'thang máy'],
  [vnWord('thang\\s*xoắ?n[g]?'), 'thang xoắn'],
  [vnWord('thang\\s*biến\\s*hó?a'), 'thang biến hóa'],
  [vnWord('sân\\s*th[ưu]ợng'), 'sân thượng'],
  [vnWord('ban[\\s-]*công'), 'ban công'],
  [vnWord('giếng\\s*trời|ráng\\s*trời'), 'giếng trời'],
  [vnWord('thông\\s*tầng'), 'thông tầng'],
  [vnWord('phòng\\s*kh[ắáa]ch?'), 'phòng khách'],
  [vnWord('phòng\\s*ng[ủu]'), 'phòng ngủ'],
  [vnWord('phòng\\s*ng[ủu]\\s*ma[sx]?\\s*tơ|ma[sx]?\\s*tơ|mát\\s*tơ'), 'phòng ngủ master'],
  [vnWord('phòng\\s*t[ắáa]m|phòng\\s*vệ\\s*sinh|toa\\s*lét|toi\\s*lét'), 'phòng tắm'],
  [vnWord('phòng\\s*học'), 'phòng học'],
  [vnWord('phòng\\s*b[ếê]p|nhà\\s*b[ếê]p'), 'bếp'],
  [vnWord('nhà\\s*ăn|phòng\\s*ăn'), 'phòng ăn'],
  // Tiện ích
  [vnWord('công\\s*vi[êe]n'), 'công viên'],
  [vnWord('hồ\\s*b[ơo]i|hồ\\s*bời'), 'hồ bơi'],
  [vnWord('cầu\\s*lông'), 'cầu lông'],
  [vnWord('bóng\\s*rổ'), 'bóng rổ'],
  [vnWord('len\\s*m[áa]c|lan\\s*mác|landmark'), 'landmark'],
  [vnWord('sân\\s*chơi'), 'sân chơi'],
  // Vị trí
  [vnWord('vị\\s*tr[íi]'), 'vị trí'],
  [vnWord('b[ảa]n[g]?\\s*đồ'), 'bản đồ'],
  [vnWord('địa\\s*ch[ỉi]'), 'địa chỉ'],
  // Tài chính / pháp lý
  [vnWord('mặt\\s*t[iềêiê]+n'), 'mặt tiền'],
  [vnWord('diện\\s*t(?:ích|ịt|ít)'), 'diện tích'],
  [vnWord('ph(?:áp|át)\\s*l[ýí]'), 'pháp lý'],
  [vnWord('sổ\\s*h(?:ồng|ông)'), 'sổ hồng'],
  [vnWord('giấy\\s*ph[éêe]p'), 'giấy phép'],
  [vnWord('chiế[tc]\\s*khấu'), 'chiết khấu'],
  [vnWord('thanh\\s*to[áa]n|thăn\\s*toán'), 'thanh toán'],
  [vnWord('ngân\\s*h[àa]ng'), 'ngân hàng'],
  [vnWord('đặt\\s*c[ọo]c'), 'đặt cọc'],
  [vnWord('chủ\\s*đầu\\s*t[ưu]'), 'chủ đầu tư'],
  [vnWord('tiến\\s*độ'), 'tiến độ'],
  [vnWord('bàn\\s*giao'), 'bàn giao'],
  // Gen số
  [vnWord('gen\\s*hai'), 'gen 2'],
  [vnWord('gen\\s*năm'), 'gen 5'],
];

// ───────────────────────────────────────────────────────────────────────────
// 6) FUZZY MATCH tên riêng — "quy tắc chung" thay vì liệt kê tay từng biến thể.
//    STT hay nghe méo tên nước ngoài (cosmo, fusion, opus...). Thay vì chỉ bắt
//    các biến thể đã viết sẵn ở VN_SPEECH_FIXES, ta so KHOẢNG CÁCH CHỈNH SỬA
//    (Levenshtein) của mỗi từ / cụm 2 từ với danh sách tên chuẩn — GẦN GIỐNG
//    đủ mức thì tự nắn về đúng tên. Bắt được cả biến thể MỚI chưa gặp.
//    (Ca méo QUÁ XA vd "danh hài" thì fuzzy không với tới — vẫn cần thêm tay.)
// ───────────────────────────────────────────────────────────────────────────
const FUZZY_NAMES = ['cosmo', 'fusion', 'opus', 'signature', 'cashmere', 'office', 'airtop'];

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

// Tra ve ten chuan neu token gan giong (>=72%), nguoc lai null.
function fuzzyName(token: string): string | null {
  const t = stripDiacritics(token.toLowerCase()).replace(/[^a-z]/g, '');
  if (t.length < 3) return null;
  let best: string | null = null, bestScore = 0;
  for (const v of FUZZY_NAMES) {
    const score = 1 - editDistance(t, v) / Math.max(t.length, v.length);
    if (score > bestScore) { bestScore = score; best = v; }
  }
  return bestScore >= 0.72 ? best : null;
}

// Chi snap TUNG TU DON gan giong ten chuan (khong ghep 2 tu — ghep de nham
// "co mo"/"co so" -> cosmo). Cac ca meo tach 2 tu ("cot mo", "o put", "op phit")
// da co bang regex VN_SPEECH_FIXES lo truoc, nen fuzzy chi can vet tu don.
function applyFuzzyNames(text: string): string {
  return text.replace(/[^\s]+/g, (w) => fuzzyName(w) || w);
}

export function normalizeVietnameseSpeech(text: string): string {
  if (!text) return '';
  let clean = ' ' + text.toLowerCase() + ' ';
  for (const [re, to] of VN_SPEECH_FIXES) clean = clean.replace(re, (_m, b) => b + to);
  clean = applyFuzzyNames(clean);   // lop 2: fuzzy bat bien the moi chua co trong bang
  return clean.trim();
}
