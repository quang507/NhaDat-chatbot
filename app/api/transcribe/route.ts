import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
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

    // 1) DEEPGRAM NOVA-3 — Ưu tiên cao nhất, có Keyterm Prompting
    if (DEEPGRAM_API_KEY) {
      try {
        // Ép từ khóa mạnh để nhận diện chính xác tên riêng
        const rawKeywords = [
          "Cosmo:2", "Cosmo Gen 2:3", "Fusion:2", "Fusion Gen 5:3", "Opus:2", 
          "Cashmere:2", "Signature:2", "Ny'ah Phú Định:3", "Nhã Đạt:2", 
          "Trương Đình Hội:2", "An Dương Vương:2", "Quận 8:2",
          "Ngô Trần Công Luận:2", "Villa Ny'ah", "Villa Cầu Tràm", "Long An", "Mizuki",
          "vị trí Ny'ah Phú Định:2", "Ny'ah ở đâu", "Ny'ah đường nào",
          "6 tầng", "mặt tiền 5 mét", "ngang 5 mét", "ngang 4 mét", "nhà phố",
          "bếp fullsize", "giặt sấy tại bếp", "bàn ăn nhanh", "phòng ăn riêng", "đảo bếp",
          "gara ô tô", "sân thượng", "phòng ngủ master", "phòng khách", "thang máy", "giếng trời",
          "sổ hồng", "bàn giao", "tiến độ", "thanh toán", "ban công", "mặt bằng", "mở slide"
        ];
        // Đảm bảo URL encode cho tiếng Việt và khoảng trắng
        const keywords = rawKeywords.map(k => encodeURIComponent(k)).join('&keywords=');

        const deepgramUrl = `https://api.deepgram.com/v1/listen?model=nova-2&language=vi&smart_format=true&keywords=${keywords}`;
        
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
        const STT_PROMPT = "Dự án nhà phố Ny'ah Phú Định, nhà phát triển Nhã Đạt. Mẫu nhà: Cosmo Gen 2 (Cót mô, Cốt mô), Fusion Gen 5 (Phiêu dân, Phiu dân), Opus (Ô pút), Cashmere, Signature. Đường Trương Đình Hội, An Dương Vương, Quận 8. Các từ: gara ô tô, thang máy, giếng trời, ban công, phòng ngủ master, phòng khách, phòng bếp, sân thượng, mặt bằng, vị trí, bản đồ, sổ hồng, bàn giao, tiến độ, thanh toán. Lệnh: mở slide, cho xem, phóng to, thu nhỏ, đóng ảnh.";
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
