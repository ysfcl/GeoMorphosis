import { sendEmailNotification } from '@/lib/email';

export async function POST(request) {
  try {
    const body = await request.json();
    const { to, message, title } = body;

    if (!message) {
      return Response.json(
        { success: false, error: 'Mesaj içeriği (message) zorunludur.' },
        { status: 400 }
      );
    }

    if (!to) {
      return Response.json(
        { success: false, error: 'Alıcı email adresi (to) zorunludur.' },
        { status: 400 }
      );
    }

    const isSent = await sendEmailNotification(
      to,
      message,
      title || 'Sistem Bildirimi'
    );

    if (isSent) {
      return Response.json({
        success: true,
        message: 'Email bildirimi başarıyla gönderildi.',
      });
    } else {
      return Response.json(
        {
          success: false,
          error: 'Email bildirimi gönderilemedi. Sunucu loglarını kontrol edin.',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Notify Email API hatası:', error);
    return Response.json(
      { success: false, error: 'İstek işlenirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const testEmail = process.env.TEST_EMAIL_TO;

  const isSent = await sendEmailNotification(
    testEmail,
    'Notify email endpoint\'i başarıyla oluşturuldu ve çalışıyor! Bu, bir test mesajıdır.',
    'Sistem Testi'
  );

  return Response.json({
    status: isSent ? 'ok' : 'error',
    message: isSent
      ? 'Test e-postası gönderildi!'
      : 'E-posta gönderilemedi.',
  });
}