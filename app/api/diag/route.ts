import { NextResponse } from 'next/server';
import { getDrivingRoute } from '@/lib/maps';

export const runtime = 'nodejs';

// PROBE TAM — do trang thai Routes API ngay luc goi (rate-limit? quota?). XOA sau.
export async function GET() {
  const KEY = process.env.GOOGLE_MAPS_API_KEY || '';
  const out: any = { keyTail: KEY ? KEY.slice(-4) : null };

  // Raw Routes API — xem status + body loi (429? PERMISSION? quota?)
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
      body: JSON.stringify({ origin: { address: 'bệnh viện chợ rẫy, TP.HCM, Việt Nam' }, destination: { address: '58A Trương Đình Hội, Phường 16, Quận 8, TP.HCM' }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'vi-VN', units: 'METRIC' }),
    });
    out.raw = { status: r.status, body: (await r.text()).slice(0, 400) };
  } catch (e) { out.raw = { error: String(e) }; }

  // getDrivingRoute that (qua ham cua app)
  try {
    out.getDrivingRoute = await getDrivingRoute('bệnh viện chợ rẫy');
  } catch (e) { out.getDrivingRouteError = String(e); }

  return NextResponse.json(out);
}
