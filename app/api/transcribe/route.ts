import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// STT: Thứ tự ưu tiên:
// 1) Groq Whisper (whisper-large-v3) — tốt nhất cho tiếng Việt, ~0.6s
// 2) Gemini 2.5 Flash — fallback chính xác nhưng chậm hơn
// NOTE: Deepgram Nova-2 đã thử nhưng tiếng Việt rất kém (nhận sai hoàn toàn)
//       nên đã loại khỏi pipeline. DEEPGRAM_API_KEY hiện không dùng cho STT.
export async function POST(req: NextRequest) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Thiếu file audio' }, { status: 400 });
    }

    const type = (file as Blob).type || 'audio/webm';
    const ext = type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('mpeg') ? 'mp3' : 'webm';
    const mimeType = type.includes('webm') ? 'audio/webm' : type;

    // 1) GROQ WHISPER — tốt nhất cho tiếng Việt, ~0.3s.
    if (GROQ_API_KEY) {
      try {
        // prompt giúp nhận đúng tên riêng; KHÔNG seed số căn cụ thể (tránh bịa "căn 23").
        const STT_PROMPT = "Dự án nhà phố Ny'ah Phú Định, nhà phát triển Nhã Đạt. Mẫu nhà: Cosmo Gen 2 (Cót mô, Cốt mô), Fusion Gen 5 (Phiêu dân, Phiu dân), Opus (Ô pút), Cashmere, Signature. Đường Trương Đình Hội, An Dương Vương, Quận 8. Các từ: gara ô tô, thang máy, giếng trời, ban công, phòng ngủ master, phòng khách, phòng bếp, sân thượng, mặt bằng, vị trí, bản đồ, sổ hồng, bàn giao, tiến độ, thanh toán. Lệnh: mở slide, cho xem, phóng to, thu nhỏ, đóng ảnh.";
        const fd = new FormData();
        fd.append('file', file, `audio.${ext}`);
        fd.append('model', 'whisper-large-v3');
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
        const errText = await res.text();
        console.warn(`Groq Whisper lỗi ${res.status}: ${errText}. Rớt sang Gemini...`);
      } catch (e) {
        console.warn('Groq Whisper exception. Rớt sang Gemini...', e);
      }
    }

    // 2) Fallback Gemini 2.5 Flash (chính xác cao nhưng chậm hơn).
    if (GEMINI_API_KEY) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = Buffer.from(arrayBuffer).toString('base64');

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
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
          return NextResponse.json({ text: text.trim() });
        }
        const errText = await geminiRes.text();
        console.error(`Gemini transcription lỗi ${geminiRes.status}: ${errText}`);
      } catch (e) {
        console.error('Gemini transcription exception:', e);
      }
    }

    return NextResponse.json({ error: 'Không có API Key hợp lệ hoặc tất cả dịch vụ đều lỗi', text: '' }, { status: 500 });
  } catch (e) {
    console.error('Transcribe route error:', e);
    return NextResponse.json({ error: String(e), text: '' }, { status: 500 });
  }
}
