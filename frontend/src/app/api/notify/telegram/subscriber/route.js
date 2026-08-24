import { sendAnalysisReportToUser } from '@/lib/telegram';

// Worker analizi bitirince bu rotayi cagirir. Rapor onceden /api/analyze GET
// handler'indan, yani tarayici polling'i sirasinda gonderiliyordu; bu hem her
// sorguda tekrar mesaj atiyordu hem de kullanici sekmeyi kapattiginda hic
// gonderilmiyordu. E-posta zaten worker'dan gidiyordu, Telegram da ayni yola alindi.
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

    const isSent = await sendAnalysisReportToUser(userId, report);
    return Response.json({ success: isSent });
  } catch (error) {
    console.error('Abone analiz Telegram bildirimi hatası:', error);
    return Response.json({ success: false, error: 'Bildirim işlenemedi.' }, { status: 500 });
  }
}
