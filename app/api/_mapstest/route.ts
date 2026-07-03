import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// ENDPOINT CHAN DOAN TAM — kiem tra Routes API tren production. XOA sau khi test.
// Khong lo key (chi tra do dai + trang thai + body loi cua Google).
export async function GET() {
  const KEY = process.env.GOOGLE_MAPS_API_KEY || '';
  const out: any = { keyPresent: !!KEY, keyLen: KEY.length, keyTail: KEY ? KEY.slice(-4) : null };

  if (!KEY) return NextResponse.json(out);

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { address: 'bệnh viện chợ rẫy, TP.HCM, Việt Nam' },
        destination: { address: "Ny'ah Phú Định, 58A Trương Đình Hội, Phường 16, Quận 8, TP.HCM" },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        languageCode: 'vi-VN',
        units: 'METRIC',
      }),
    });
    out.routesStatus = res.status;
    out.routesBody = (await res.text()).slice(0, 800);
  } catch (e) {
    out.routesError = String(e);
  }
  return NextResponse.json(out);
}
