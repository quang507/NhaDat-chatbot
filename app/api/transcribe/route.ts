import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Phiên âm giọng nói bằng Groq Whisper (whisper-large-v3-turbo) — chạy server-side, không
// phụ thuộc Web Speech API của trình duyệt. Nhận audio (webm/ogg/wav/m4a/mp3) -> trả { text }.
export async function POST(req: NextRequest) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY chưa được set' }, { status: 500 });
  }
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Thiếu file audio' }, { status: 400 });
    }

    // Groq dùng API tương thích OpenAI: POST /audio/transcriptions (multipart).
    const fd = new FormData();
    // Đặt tên file có đuôi đúng để Groq nhận dạng định dạng (MediaRecorder Chrome -> webm).
    const type = (file as Blob).type || 'audio/webm';
    const ext = type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('mpeg') ? 'mp3' : 'webm';
    fd.append('file', file, `audio.${ext}`);
    fd.append('model', 'whisper-large-v3-turbo');
    fd.append('language', 'vi');
    fd.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: fd,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Groq Whisper lỗi ${res.status}: ${errText}`);
      return NextResponse.json({ error: 'Lỗi phiên âm', text: '' }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json({ text: (data.text || '').trim() });
  } catch (e) {
    console.error('Transcribe error:', e);
    return NextResponse.json({ error: String(e), text: '' }, { status: 500 });
  }
}
