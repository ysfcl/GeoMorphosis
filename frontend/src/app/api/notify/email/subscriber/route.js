import { sendAnalysisEmailToUser } from '@/lib/email';

export async function POST(request) {
  const internalSecret = process.env.NOTIFICATION_INTERNAL_SECRET;
  if (
    internalSecret &&
    request.headers.get('x-notification-internal-secret') !== internalSecret
  ) {
    return Response.json({ success: false, error: 'Yetkisiz istek' }, { status: 401 });
  }

  try {
    const { userId, report } = await request.json();

    if (!userId || !report) {
      return Response.json(
        { success: false, error: 'Kullanıcı kimliği ve rapor zorunludur.' },
        { status: 400 }
      );
    }

    const isSent = await sendAnalysisEmailToUser(userId, report);
    return Response.json({ success: isSent });
  } catch (error) {
    console.error('Abone analiz e-postası hatası:', error);
    return Response.json({ success: false, error: 'Bildirim işlenemedi.' }, { status: 500 });
  }
}
