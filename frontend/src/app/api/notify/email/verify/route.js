import { NextResponse } from 'next/server';
import { verifyEmailSubscription } from '@/lib/email-subscriptions';

export async function POST(request) {
  try {
    const { userId, code } = await request.json();

    if (!userId || !code) {
      return NextResponse.json(
        { error: 'Kullanıcı kimliği ve doğrulama kodu gerekli' },
        { status: 400 }
      );
    }

    const verified = await verifyEmailSubscription(userId, code);

    if (!verified) {
      return NextResponse.json(
        { success: false, error: 'Doğrulama kodu geçersiz.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'E-posta adresi doğrulandı. Analiz raporları bu adrese gönderilecek.',
    });
  } catch (error) {
    console.error('E-posta dogrulama hatasi:', error);
    return NextResponse.json({ error: 'Dogrulama sirasinda hata olustu' }, { status: 500 });
  }
}
