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

    // 1) Thử phiên âm bằng Groq Whisper
    if (GROQ_API_KEY) {
      try {
        const fd = new FormData();
        fd.append('file', file, `audio.${ext}`);
        fd.append('model', 'whisper-large-v3-turbo');
        fd.append('language', 'vi');
        fd.append('response_format', 'json');

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
        console.warn(`Groq Whisper failed, status: ${res.status} ${errText}. Falling back to Gemini...`);
      } catch (e) {
        console.warn('Groq Whisper exception. Falling back to Gemini...', e);
      }
    }

    // 2) Fallback sang Gemini 2.5 Flash
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
                  text: "Hãy viết lại chính xác toàn bộ lời thoại bằng tiếng Việt trong đoạn ghi âm trên, giữ đúng các số hiệu căn hộ nếu có. Chỉ trả về văn bản đã dịch, không thêm bất kỳ lời dẫn hay bình luận nào."
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
        console.error(`Gemini transcription error: ${geminiRes.status} ${errText}`);
      } catch (e) {
        console.error('Gemini transcription exception:', e);
      }
    }

    return NextResponse.json({ error: 'Không có API Key hợp lệ hoặc tất cả các dịch vụ đều lỗi', text: '' }, { status: 500 });
  } catch (e) {
    console.error('Transcribe route error:', e);
    return NextResponse.json({ error: String(e), text: '' }, { status: 500 });
  }
}
