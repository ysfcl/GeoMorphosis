import { NextResponse } from 'next/server';
import { saveEmailSubscription } from '@/lib/email-subscriptions';

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

    const subscription = saveEmailSubscription(userId, email);

    return NextResponse.json({
      success: true,
      message: 'E-posta aboneliği kaydedildi',
      subscription: { email: subscription.email, notification_type: notification_type || 'email' },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Abonelik sirasinda hata olustu' }, { status: 500 });
  }
}
