import { NextResponse } from 'next/server';
import { verifyEmailSubscription } from '@/lib/email-subscriptions';
import { sendAnalysisEmailToUser } from '@/lib/email';

// Dogrulama akisinin 2. adimi: kullanici modalda girdigi 6 haneli kod burada
// eslesir; basariliysa notification_channels.verified_at yazilir ve analiz
// raporlari bu kanala gonderilmeye baslanir. Istekle birlikte gelen son analiz
// varsa PDF'li karşılama raporu hemen gonderilir.
export async function POST(request) {
  try {
    const body = await request.json();
    const userId = body.user_id;
    const code = String(body.code ?? '').trim();

    if (!userId || !code) {
      return NextResponse.json(
        { error: 'Kullanıcı kimliği ve doğrulama kodu gerekli' },
        { status: 400 }
      );
    }

    const channel = await verifyEmailSubscription(userId, code);

    if (!channel) {
      return NextResponse.json(
        { error: 'Doğrulama kodu hatalı. E-postanıza gelen son kodu girin.' },
        { status: 400 }
      );
    }

    // Abonelik dogrulanir dogrulanmaz somut deger verelim: elimizdeki son
    // analiz raporunu PDF ekiyle gonder (istemci localStorage'dan tasiyor).
    let emailSent = false;
    let emailSkipReason = null;
    if (!body.report || typeof body.report !== 'object') {
      emailSkipReason = 'no-report';
      console.warn(
        `[VERIFY] ${userId}: gonderilecek rapor yok — dogrulama oncesi analiz tamamlanmamis olabilir.`
      );
    } else {
      try {
        // PDF'teki font/gorseller sunucu tarafinda mutlak adresten iniyor.
        emailSent = await sendAnalysisEmailToUser(userId, body.report, {
          baseUrl: new URL(request.url).origin,
        });
        if (!emailSent) emailSkipReason = 'send-failed';
      } catch (error) {
        emailSkipReason = 'send-error';
        console.error('Karsilama raporu gonderilemedi:', error);
      }
    }

    return NextResponse.json({
      success: true,
      emailSent,
      ...(emailSkipReason ? { emailSkipReason } : {}),
      message: emailSent
        ? 'E-posta adresiniz doğrulandı; son analiz raporunuzu PDF olarak gönderdik.'
        : emailSkipReason === 'no-report'
          ? 'E-posta adresiniz doğrulandı. İlk analiz tamamlandığında rapor bu adrese gönderilecek.'
          : 'E-posta adresiniz doğrulandı ancak karşılama raporu gönderilemedi.',
      email: channel.destination,
    });
  } catch (error) {
    console.error('Dogrulama hatasi:', error);
    return NextResponse.json({ error: 'Doğrulama sırasında hata oluştu' }, { status: 500 });
  }
}
