import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// STT: Thứ tự ưu tiên:
// 1) Deepgram Nova-2 — chất lượng tiếng Việt cao, latency thấp (~0.3s)
// 2) Groq Whisper (whisper-large-v3-turbo) — fallback nhanh
// 3) Gemini 2.5 Flash — fallback cuối
export async function POST(req: NextRequest) {
  const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';
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

    // 1) DEEPGRAM NOVA-2 — chất lượng tiếng Việt tốt nhất, latency thấp.
    if (DEEPGRAM_API_KEY) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const params = new URLSearchParams({
          model: 'nova-2',
          language: 'vi',
          smart_format: 'true',
          punctuate: 'true',
          filler_words: 'false',
          keywords: [
            "Ny'ah:2", 'Phú Định:2', 'Nhã Đạt:2',
            'Cosmo:2', 'Fusion:2', 'Opus:1', 'Cashmere:1', 'Signature:1',
            'gara:1', 'thang máy:1', 'giếng trời:1', 'sổ hồng:1',
          ].join(','),
        });
        const dgRes = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
          method: 'POST',
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            'Content-Type': mimeType,
          },
          body: arrayBuffer,
        });

        if (dgRes.ok) {
          const data = await dgRes.json();
          const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
          if (text.trim()) return NextResponse.json({ text: text.trim() });
        } else {
          const errText = await dgRes.text();
          console.warn(`Deepgram lỗi ${dgRes.status}: ${errText}. Rớt sang Groq...`);
        }
      } catch (e) {
        console.warn('Deepgram exception. Rớt sang Groq...', e);
      }
    }

    // 2) GROQ WHISPER — nhanh nhất trong số Whisper, ưu tiên hàng đầu cho nghe ngầm realtime.
    if (GROQ_API_KEY) {
      try {
        // prompt giúp nhận đúng tên riêng; KHÔNG seed số căn cụ thể (tránh bịa "căn 23").
        const STT_PROMPT = "Dự án nhà phố Ny'ah Phú Định, nhà phát triển Nhã Đạt. Mẫu nhà: Cosmo Gen 2 (Cót mô, Cốt mô), Fusion Gen 5 (Phiêu dân, Phiu dân), Opus (Ô pút), Cashmere, Signature. Đường Trương Đình Hội, An Dương Vương, Quận 8. Các từ: gara ô tô, thang máy, giếng trời, ban công, phòng ngủ master, phòng khách, phòng bếp, sân thượng, mặt bằng, vị trí, bản đồ, sổ hồng, bàn giao, tiến độ, thanh toán. Lệnh: mở slide, cho xem, phóng to, thu nhỏ, đóng ảnh.";
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
        console.warn(`Groq Whisper lỗi ${res.status}: ${errText}. Rớt sang Gemini...`);
      } catch (e) {
        console.warn('Groq Whisper exception. Rớt sang Gemini...', e);
      }
    }

    // 3) Fallback Gemini 2.5 Flash (chính xác cao nhưng chậm hơn).
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
