// Google Maps Routes API: tính quãng đường + thời gian THẬT từ điểm xuất phát của khách
// đến dự án Ny'ah Phú Định. Mục tiêu: bot KHÔNG bịa "10-15 phút" mà dùng số liệu thật.
//
// Cần env: GOOGLE_MAPS_API_KEY (bật Routes API trong Google Cloud Console).

const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// Đích mặc định: dự án Ny'ah Phú Định (cổng chính Trương Đình Hội)
const DEFAULT_DESTINATION = 'Ny\'ah Phú Định, 58A Trương Đình Hội, Phường 16, Quận 8, TP.HCM';
const MAPS_PLACE_URL = 'https://maps.app.goo.gl/qwf4XibyMCL9sEX6A';

export interface RouteSummary {
  origin: string;
  destination: string;
  distanceText: string;   // vd "5,2 km"
  durationText: string;   // vd "18 phút"
  mapsUrl: string;
}

// Phát hiện câu hỏi có ý hỏi đường / khoảng cách / thời gian di chuyển
// Trả về { isRoute, origin } — origin có thể rỗng nếu khách chưa nói rõ điểm xuất phát.
export function detectRouteIntent(message: string): { isRoute: boolean; origin: string } {
  // normalize('NFC'): STT/1 số client gửi tiếng Việt dạng NFD (tổ hợp) -> "đi từ" khác
  // byte với chuỗi so khớp NFC -> includes() trượt -> KHÔNG nhận ra ý hỏi đường. Ép NFC.
  const q = (message || '').normalize('NFC').toLowerCase().trim();

  // Tín hiệu hỏi đường / khoảng cách / thời gian
  const routeSignals = [
    'đi từ', 'xuất phát từ', 'đi đường nào', 'đường đi', 'chỉ đường',
    'bao xa', 'bao nhiêu km', 'mất bao lâu', 'bao lâu thì tới', 'bao lâu tới',
    'cách bao xa', 'di chuyển', 'đi mất', 'tới dự án', 'đến dự án', 'cách dự án',
    'gần không', 'xa không', 'đi tới', 'đi đến',
  ];
  const isRoute = routeSignals.some(s => q.includes(s));
  if (!isRoute) return { isRoute: false, origin: '' };

  // Trích điểm xuất phát: "đi từ X", "từ X tới/đến/thì", "xuất phát từ X"
  let origin = '';
  const patterns = [
    /(?:đi\s+)?(?:xuất\s*phát\s+)?từ\s+(.+?)(?:\s+(?:tới|đến|thì|đi|về|ra|sang|qua|mất|bao|có|đường|là)\b|[?.,]|$)/i,
  ];
  for (const re of patterns) {
    const m = q.match(re);
    if (m && m[1]) {
      origin = m[1].trim();
      break;
    }
  }
  // Bỏ các đuôi thừa
  origin = origin.replace(/\s+(nhé|ạ|nha|vậy|đó|đấy)\b.*$/i, '').trim();

  return { isRoute: true, origin };
}

// Gọi Google Routes API (computeRoutes) lấy quãng đường + thời gian theo traffic
export async function getDrivingRoute(
  origin: string,
  destination: string = DEFAULT_DESTINATION
): Promise<RouteSummary | null> {
  if (!MAPS_API_KEY || !origin) return null;

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        // Them "TP.HCM, Viet Nam" neu khach chi noi ten dia diem tran (vd "benh vien hung
        // vuong") khong kem thanh pho -> geocode de bi mo ho/sai, tra ve route rong (0m/0s).
        origin: { address: /tp\.?\s*hcm|hồ chí minh|ho chi minh|việt nam|viet nam/i.test(origin) ? origin : `${origin}, TP.HCM, Việt Nam` },
        destination: { address: destination },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        languageCode: 'vi-VN',
        units: 'METRIC',
      }),
    });

    if (!res.ok) {
      console.warn(`Routes API lỗi ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;

    // distanceMeters -> "5,2 km" ; duration "1080s" -> "18 phút"
    const meters = route.distanceMeters || 0;
    const rawSeconds = parseInt(String(route.duration || '0').replace('s', ''), 10) || 0;
    // Routes API doi khi tra ve route "rong" (meters=0, duration=0s) khi dia chi origin
    // khong geocode duoc ro rang -> KHONG duoc coi la du lieu that, keo AI se noi "0 phut
    // di chuyen" vo ly. Coi day la that bai giong nhu khong co route.
    if (meters <= 0 || rawSeconds <= 0) {
      console.warn(`Routes API tra ve route rong (meters=${meters}, seconds=${rawSeconds}) cho origin="${origin}" -> coi nhu that bai.`);
      return null;
    }
    const distanceText = meters >= 1000
      ? `${(meters / 1000).toFixed(1).replace('.', ',')} km`
      : `${meters} m`;

    const minutes = Math.round(rawSeconds / 60);
    const durationText = minutes >= 60
      ? `${Math.floor(minutes / 60)} giờ ${minutes % 60} phút`
      : `${minutes} phút`;

    return {
      origin,
      destination,
      distanceText,
      durationText,
      mapsUrl: MAPS_PLACE_URL,
    };
  } catch (e) {
    console.warn('getDrivingRoute lỗi:', e);
    return null;
  }
}

// Biến kết quả route thành đoạn context để nhét vào prompt (AI chỉ diễn giải, không bịa).
// Lệnh CỨNG + đặt ở ĐẦU prompt vì llama hay bỏ qua/đọc méo số khi bị vùi dưới 12 chunk RAG.
export function routeSummaryToPrompt(r: RouteSummary): string {
  return `\n\n★★★ DỮ LIỆU TUYẾN ĐƯỜNG THỰC TẾ (Google Maps — ƯU TIÊN TUYỆT ĐỐI) ★★★
Khách đang hỏi đường/thời gian di chuyển. BẮT BUỘC trả lời NGAY bằng đúng 2 con số dưới đây,
KHÔNG được hỏi lại tên địa điểm, KHÔNG được bịa số khác, KHÔNG nói "cần biết thêm":
- Từ "${r.origin}" đến dự án Ny'ah Phú Định (58A Trương Đình Hội, P.16, Q.8):
- Quãng đường: ${r.distanceText}
- Thời gian di chuyển (theo giao thông hiện tại): ${r.durationText}
Câu trả lời PHẢI nêu rõ "${r.durationText}" và "${r.distanceText}", sau đó có thể mô tả hướng đi
chung và mời khách mở Google Maps (${r.mapsUrl}) để dẫn đường trực tiếp.`;
}
