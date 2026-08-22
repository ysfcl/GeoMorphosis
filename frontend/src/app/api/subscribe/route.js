import { NextResponse } from 'next/server';
import { saveEmailSubscription } from '@/lib/email-subscriptions';
import { isEmailConfigured, sendEmailNotification } from '@/lib/email';

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, user_id: userId, notification_type } = body;

    if (!email || !userId) {
      return NextResponse.json({ error: 'Email ve kullanıcı kimliği gerekli' }, { status: 400 });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'Geçerli bir email adresi gerekli' }, { status: 400 });
    }

    const subscription = await saveEmailSubscription(userId, email);

    // Faz 3: dogrulama kodu e-posta ile iletilir. SMTP yapilandirilmamissa
    // kod yanitla dondurulur; boylece yerel gelistirmede akis test edilebilir.
    let devCode = null;
    if (isEmailConfigured()) {
      const sent = await sendEmailNotification(
        subscription.destination,
        `Doğrulama kodunuz: ${subscription.verification_code}`,
        'GeoMorphosis E-posta Doğrulama'
      );
      if (!sent) devCode = subscription.verification_code;
    } else {
      devCode = subscription.verification_code;
    }

    return NextResponse.json({
      success: true,
      message: 'E-posta aboneliği kaydedildi, doğrulama kodu gönderildi',
      subscription: {
        email: subscription.destination,
        notification_type: notification_type || 'email',
      },
      ...(devCode ? { devCode } : {}),
    });
  } catch (error) {
    console.error('Abonelik hatası:', error);
    return NextResponse.json({ error: 'Abonelik sirasinda hata olustu' }, { status: 500 });
  }
}
