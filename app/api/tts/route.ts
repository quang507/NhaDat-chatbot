import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30; // Max duration for Vercel functions

export async function GET(req: NextRequest) {
  try {
    // Force ws library to use pure JS implementation and avoid bufferutil native compilation errors in Next.js
    process.env.WS_NO_BUFFER_UTIL = '1';
    
    const { UniversalEdgeTTS } = await import('edge-tts-universal');
    
    const { searchParams } = new URL(req.url);
    const text = searchParams.get('text');
    
    if (!text || !text.trim()) {
      return new Response('Text is required', { status: 400 });
    }
    
    const voice = searchParams.get('voice') || 'vi-VN-HoaiMyNeural';
    // rate: tốc độ đọc, vd "+15%" (nhanh hơn), "-10%" (chậm hơn). Mặc định bình thường.
    const rawRate = searchParams.get('rate') || '';
    const rate = /^[+-]\d{1,3}%$/.test(rawRate) ? rawRate : '+0%';

    // Create the TTS instance (kèm tốc độ đọc)
    const tts = new UniversalEdgeTTS(text.trim(), voice, { rate });
    
    // Synthesize the text into audio and subtitles
    const result = await tts.synthesize();
    
    // Get the audio data as an ArrayBuffer
    const arrayBuffer = await result.audio.arrayBuffer();
    
    // Return the audio as MPEG audio stream with caching headers
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=604800, immutable', // Cache for 7 days
      },
    });
  } catch (error: any) {
    console.error('Edge TTS generation error:', error);
    return new Response(`TTS generation failed: ${error.message || error}`, { status: 500 });
  }
}
