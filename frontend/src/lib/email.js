import nodemailer from 'nodemailer';
import { getActiveEmailSubscription } from '@/lib/email-subscriptions';
//dotenv'e ihtiyaç duyulmuyor çünkü Next.js otomatik olarak .env dosyasını yükler ve process.env üzerinden erişim sağlar.

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || user.includes('your_')) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(port) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });

  return transporter;
}

/** SMTP ayarlari dolu mu? Dogrulama kodu fallback'i icin route'larda kullanilir. */
export function isEmailConfigured() {
  return Boolean(getTransporter());
}

export async function sendEmailNotification(to, message, title = 'Sistem Bildirimi') {
  const transport = getTransporter();

  if (!transport) {
    console.warn('Email konfigürasyonu eksik, bildirim atlanıyor.');
    return false;
  }

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject: title,
      html: `<h2>${title}</h2><p>${message}</p>`,
      text: `${title}\n\n${message}`,
    });

    return true;
  } catch (error) {
    console.error('Email bildirim hatası:', error);
    return false;
  }
}

export async function sendAnalysisEmailToUser(userId, report) {
  try {
    const subscription = await getActiveEmailSubscription(userId);

    if (!subscription) {
      console.warn('Kullanıcının aktif e-posta aboneliği bulunamadı, rapor atlanıyor.');
      return false;
    }

    const riskLabels = {
      yok: 'Yok',
      dusuk: 'Düşük',
      orta: 'Orta',
      yuksek: 'Yüksek',
    };
    const risk = riskLabels[report.riskLevel] || 'Normal';
    const message = [
      `Konum: ${report.lat}, ${report.lon}`,
      `Risk seviyesi: ${risk}`,
      '',
      report.summary,
    ].join('\n');

    return sendEmailNotification(subscription.email, message, 'GeoMorphosis Analiz Raporu');
  } catch (error) {
    console.error('Analiz e-postası gönderme hatası:', error);
    return false;
  }
}
