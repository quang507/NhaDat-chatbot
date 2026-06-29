import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Phiên âm giọng nói bằng Groq Whisper (nếu có key), tự động rớt sang Gemini 2.5 Flash nếu Groq lỗi hoặc thiếu key.
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

    // 1) SỬ DỤNG GEMINI 2.5 FLASH ĐỂ PHIÊN ÂM TIẾNG VIỆT CHÍNH XÁC CAO (Ưu tiên hàng đầu)
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
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                },
                {
                  text: `Bạn là trợ lý dịch giọng nói tiếng Việt chuyên nghiệp cho dự án nhà phố Ny'ah Phú Định (Nhã Đạt). 
Hãy viết lại chính xác toàn bộ lời thoại bằng tiếng Việt trong đoạn ghi âm trên.
Đặc biệt chú ý sửa đúng các tên riêng và thuật ngữ của dự án:
- Mẫu nhà: Cosmo Gen 2 (nếu đọc là Cót mô, Cốt mô), Fusion Gen 5 (nếu đọc là Phiêu dân, Phiêu-dân), Opus (nếu đọc là Ô pút, Ô-pút, Opút).
- Địa danh: Ny'ah Phú Định, Nhã Đạt, đường Trương Đình Hội, Quận 8.
- Các từ liên quan: căn số 23, gara ô tô, thang máy, công viên, bản đồ Google Maps, quét mã QR.
Chỉ trả về văn bản đã dịch chính xác, không thêm bất kỳ lời dẫn, giải thích hay bình luận nào.`
                }
              ]
            }],
            generationConfig: {
              temperature: 0.0,
            }
          })
        });

        if (geminiRes.ok) {
          const data = await geminiRes.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          return NextResponse.json({ text: text.trim() });
        }
        const errText = await geminiRes.text();
        console.warn(`Gemini transcription failed, status: ${geminiRes.status} ${errText}. Falling back to Groq...`);
      } catch (e) {
        console.warn('Gemini transcription exception. Falling back to Groq...', e);
      }
    }

    // 2) Fallback sang Groq Whisper nếu Gemini lỗi
    if (GROQ_API_KEY) {
      try {
        const STT_PROMPT = "Dự án nhà phố Ny'ah Phú Định, nhà phát triển Nhã Đạt (Nyah Co Ltd). Các mẫu nhà phố liên kế: Cosmo Gen 2 (Cót mô, Cốt mô, Cotmo), Fusion Gen 5 (Phiêu dân, Phiêu-dân, Phiu dân, Fusion), Opus (Ô pút, Ô-pút, Opút). Vị trí đường Trương Đình Hội, Quận 8, TP.HCM. Các tiện ích và thiết kế: công viên, gara ô tô, xe bán tải, thang máy, giếng trời, ban công, thông tầng, lệch tầng, lửng, phòng ngủ master, phòng ngủ con, nhà vệ sinh, wc, phòng bếp, phòng khách, phòng học, sân thượng, mặt bằng tầng 1, tầng 2, tầng 3, vị trí, bản đồ Google Maps, quét mã QR. Thông tin pháp lý và giá bán: sổ hồng, bàn giao, tiến độ xây dựng, thanh toán, căn hộ số 23, căn số 23, giá bán từ 5 đến 7 tỷ. Khẩu lệnh điều khiển slide: xin chào, mở slide, cho xem căn, phóng to hình ảnh, thu nhỏ lại, đóng ảnh, quay lại.";
        const fd = new FormData();
        fd.append('file', file, `audio.${ext}`);
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
        const errText = await res.text();
        console.error(`Groq Whisper transcription error: ${res.status} ${errText}`);
      } catch (e) {
        console.error('Groq Whisper transcription exception:', e);
      }
    }

    return NextResponse.json({ error: 'Không có API Key hợp lệ hoặc tất cả các dịch vụ đều lỗi', text: '' }, { status: 500 });
  } catch (e) {
    console.error('Transcribe route error:', e);
    return NextResponse.json({ error: String(e), text: '' }, { status: 500 });
  }
}
