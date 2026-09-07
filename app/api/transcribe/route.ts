import { NextRequest, NextResponse } from 'next/server';
import { rateLimited } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  if (rateLimited(req, 'stt', 120)) return NextResponse.json({ error: 'Quá nhiều yêu cầu, thử lại sau ít phút.' }, { status: 429 });
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Thiếu file audio' }, { status: 400 });
    }

    const type = (file as Blob).type || 'audio/webm';
    const ext = type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('mpeg') ? 'mp3' : 'webm';
    const mimeType = type.includes('webm') ? 'audio/webm' : type;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1) DEEPGRAM NOVA-2 - Ưu tiên cao nhất, boost từ khóa qua param `keywords`.
    // NÂNG CẤP KHẢ DĨ: Deepgram nova-3 dùng `keyterm` (KHÁC tên param) và keyterm
    // CHẤP NHẬN CỤM NHIỀU TỪ - hợp với "Cosmo Gen 2", "Ny'ah Phú Định",
    // "Trương Đình Hội" hơn hẳn `keywords` từ đơn bên dưới. Blog Deepgram 2026 nói
    // nova-3 đã có tiếng Việt + keyterm, nhưng CHƯA kiểm chứng bằng call thật;
    // đổi model mà nova-3 không nhận `language=vi` thì tầng này gãy, rớt xuống Gemini.
    // -> Muốn đổi phải test bằng audio thật trước, đừng đổi mù.
    if (DEEPGRAM_API_KEY) {
      try {
        // Boost tên riêng. RÀNG BUỘC CỦA DEEPGRAM `keywords` (developers.deepgram.com/docs/keywords):
        //  • CHỈ nhận TỪ ĐƠN. Cụm nhiều từ KHÔNG được boost như một khối - Deepgram
        //    tách ra boost từng từ rời, thường ra kết quả ngoài ý muốn.
        //  • Chỉ gửi từ HIẾM / tên riêng model hay nghe sai; từ thông dụng thì vô ích.
        //  • Tránh chuỗi số ("6 tầng", "Quận 8", "Gen 2").
        //  • Càng nhiều keyword càng dễ ra output lạ -> giữ danh sách ngắn.
        // Vì vậy bảng này CHỈ còn tên riêng một từ. Các cụm tiếng Việt thông dụng
        // ("phòng khách", "sổ hồng", "gara ô tô", "mặt tiền"...) đã được
        // normalizeVietnameseSpeech() trong lib/speech.ts nắn ở tầng sau - đó mới là
        // chỗ sửa được cụm nhiều âm tiết, không phải ở đây.
        const KEYWORDS = [
          // Tên mẫu nhà / thương hiệu nước ngoài - nova-2 tiếng Việt nghe sai nhiều nhất
          'Cosmo:3', 'Fusion:3', 'Opus:3', 'Cashmere:3', 'Signature:3',
          'AirTop:3', 'ByteLife:3', 'Codinachs:3', 'Nyah:3',
          'Xingfa:2', 'Mizuki:2',
          // Âm tiết riêng của dự án/chủ đầu tư (bỏ các âm tiết thông dụng như
          // "An", "Dương", "Trương", "Đình" - boost vào chỉ gây nhiễu)
          'Nhã:2', 'Đạt:2', 'Định:2',
        ];

        const qs = new URLSearchParams({ model: 'nova-2', language: 'vi', smart_format: 'true' });
        for (const k of KEYWORDS) qs.append('keywords', k);
        const deepgramUrl = `https://api.deepgram.com/v1/listen?${qs.toString()}`;

        const dgRes = await fetch(deepgramUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': mimeType,
          },
          body: buffer
        });

        if (dgRes.ok) {
          const data = await dgRes.json();
          const text = data.results?.channels[0]?.alternatives[0]?.transcript || '';
          if (text.trim()) {
             return NextResponse.json({ text: text.trim() });
          }
        } else {
          console.warn(`Deepgram lỗi ${dgRes.status}: ${await dgRes.text()}. Rớt sang Gemini...`);
        }
      } catch (e) {
        console.warn('Deepgram exception. Rớt sang Gemini...', e);
      }
    }

    // 2) Fallback GEMINI 2.5 FLASH
    if (GEMINI_API_KEY) {
      try {
        const base64Data = buffer.toString('base64');
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: mimeType, data: base64Data } },
                {
                  text: `Bạn là trợ lý dịch giọng nói tiếng Việt cho dự án nhà phố Ny'ah Phú Định (Nhã Đạt).
Viết lại chính xác lời thoại bằng tiếng Việt. Sửa đúng tên riêng: Cosmo Gen 2, Fusion Gen 5, Opus, Cashmere, Signature, Ny'ah Phú Định, Nhã Đạt, Trương Đình Hội, An Dương Vương, Quận 8.
TUYỆT ĐỐI KHÔNG tự thêm số căn/lô nếu người nói không nói rõ. Nếu im lặng/không nghe rõ, trả về chuỗi RỖNG.
Chỉ trả về văn bản, không thêm lời dẫn.`
                }
              ]
            }],
            generationConfig: { temperature: 0.0 }
          })
        });

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text.trim()) {
            return NextResponse.json({ text: text.trim() });
          }
        } else {
          console.error(`Gemini transcription lỗi ${geminiRes.status}: ${await geminiRes.text()}`);
        }
      } catch (e) {
        console.error('Gemini transcription exception:', e);
      }
    }

    // 3) Fallback GROQ WHISPER
    if (GROQ_API_KEY) {
      try {
        const STT_PROMPT = "Dự án nhà phố Ny'ah Phú Định, nhà phát triển Nhã Đạt. Mẫu nhà: Cosmo Gen 2 (Cót mô, Cốt mô), Fusion Gen 5 (Phiêu dân, Phiu dân), Opus (Ô pút), Cashmere, Signature. Đường Trương Đình Hội, An Dương Vương, Quận 8. Các từ: gara ô tô, thang máy, giếng trời, ban công, phòng ngủ master, phòng khách, phòng bếp, sân thượng, mặt bằng, vị trí, bản đồ, sổ hồng, bàn giao, tiến độ, thanh toán. Gói bàn giao: gói Air (ê a, e rờ), gói Max (mắc, mách). Công nghệ: AirTop (ê tốp, a tốp), ByteLife (bai lai, bít lai). Kiến trúc sư Codinachs (cô đi nách). Tủ bếp An Cường, cửa nhôm Xingfa. Từ khóa: triều cường, ngập nước, phí quản lý. Lệnh: mở slide, cho xem, phóng to, thu nhỏ, đóng ảnh.";
        const fd = new FormData();
        const blobFromBuffer = new Blob([buffer], { type: mimeType });
        fd.append('file', blobFromBuffer, `audio.${ext}`);
        fd.append('model', 'whisper-large-v3-turbo');
        fd.append('language', 'vi');
        fd.append('response_format', 'json');
        fd.append('prompt', STT_PROMPT);

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
          body: fd,
        });

        if (res.ok) {
          const data = await res.json();
          return NextResponse.json({ text: (data.text || '').trim() });
        }
        console.warn(`Groq Whisper lỗi ${res.status}: ${await res.text()}`);
      } catch (e) {
        console.warn('Groq Whisper exception:', e);
      }
    }

    return NextResponse.json({ error: 'Không có API Key hợp lệ hoặc tất cả dịch vụ đều lỗi', text: '' }, { status: 500 });
  } catch (e) {
    console.error('Transcribe route error:', e);
    return NextResponse.json({ error: String(e), text: '' }, { status: 500 });
  }
}
