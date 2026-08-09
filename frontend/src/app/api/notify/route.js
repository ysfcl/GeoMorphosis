import { sendTelegramNotification } from '@/lib/telegram';

export async function POST(request) {
  try {
    const body = await request.json();
    const {chatId, message, title } = body;

    if (!message) {
      return Response.json(
        { success: false, error: 'Mesaj içeriği (message) zorunludur.' },
        { status: 400 }
      );
    }

    if (!chatId) {
      return Response.json(
        { success: false, error: 'Alıcı (chatId) zorunludur.' },
        { status: 400 }
      );
    }


    const isSent = await sendTelegramNotification(
      chatId,
      message,
      title || 'Sistem Bildirimi'
    );

    if (isSent) {
      return Response.json({
        success: true,
        message: 'Telegram bildirimi başarıyla gönderildi.',
      });
    } else {
      return Response.json(
        {
          success: false,
          error: 'Telegram bildirimi gönderilemedi. Sunucu loglarını kontrol edin.',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Notify API hatası:', error);
    return Response.json(
      { success: false, error: 'İstek işlenirken bir hata oluştu.' },
      { status: 500 }
    );
  }
}

// Tarayıcıdan test edebilmek için geçici bir GET metodu da eklenir
export async function GET() {
  const testChatId = process.env.TELEGRAM_CHAT_ID; // kendi chat ID'n

  const isSent = await sendTelegramNotification(
    testChatId,
    'Notify endpoint\'i başarıyla oluşturuldu ve çalışıyor! Bu, bir test mesajıdır.',
    'Sistem Testi'
  );

  return Response.json({
    status: isSent ? 'ok' : 'error',
    message: isSent
      ? 'Test mesajı Telegram\'a gönderildi!'
      : 'Mesaj gönderilemedi.',
  });
}