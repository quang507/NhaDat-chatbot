import { NextRequest, NextResponse } from 'next/server';

const DIFY_API_URL = process.env.DIFY_API_URL || 'https://api.dify.ai/v1';
const DIFY_API_KEY = process.env.DIFY_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, conversation_id } = body;

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    if (!DIFY_API_KEY) {
      return NextResponse.json({ error: 'DIFY_API_KEY chưa được set trong Vercel Environment Variables' }, { status: 500 });
    }

    const response = await fetch(`${DIFY_API_URL}/chat-messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DIFY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query: message,
        response_mode: 'blocking',
        conversation_id: conversation_id || '',
        user: 'user',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: JSON.stringify(data) }, { status: response.status });
    }

    return NextResponse.json({
      answer: data.answer,
      conversation_id: data.conversation_id,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
