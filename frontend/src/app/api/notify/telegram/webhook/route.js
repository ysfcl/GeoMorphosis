import { NextResponse } from "next/server";
import { linkTelegramAccount } from "@/lib/telegram";

export async function POST(req) {
  try {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (
      webhookSecret &&
      req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret
    ) {
      console.warn('Geçersiz Telegram webhook isteği reddedildi.');
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const body = await req.json();

    console.log("Telegram'dan Gelen İstek:", JSON.stringify(body, null, 2))

    // 1. Telegram'dan gelen bir mesaj var mı kontrol et
    if (body.message && body.message.text) {
      const chatId = body.message.chat.id;
      const text = body.message.text.trim(); // Örn: "/start 550e8400-e29b-41d4-a716-446655440000"

      // 2. Mesaj /start ile mi başlıyor?
      if (text.startsWith("/start")) {
        const parts = text.split(" ");
        const userId = parts[1]; // /start yanındaki USER_ID parametresi

        console.log(`Yakalanan UserId: ${userId}, ChatId: ${chatId}`);

        if (userId) {
          // 3. Veritabanında ilgili kullanıcının telegramChatId alanını güncelle
          const updatedUser = await linkTelegramAccount(userId, chatId);

          if (updatedUser) {
            // 4. Kullanıcının Telegram sohbetine onay mesajı gönder
            await fetch(
              `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: "Hesabınız başarıyla eşleştirildi! Bildirimler artık bu sohbet üzerinden gönderilecektir.",
                }),
              }
            );
          }
        }
      }
    }

    // Telegram webhook'larına her zaman HTTP 200 (ok: true) dönmek gerekir
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram Webhook Hatası:", error);
    // Hata olsa dahi Telegram'a 200 dönüyoruz ki Telegram aynı isteği sürekli tekrar atmasın
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
