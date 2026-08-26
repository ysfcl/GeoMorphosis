import nodemailer from 'nodemailer';
import { getActiveEmailSubscription } from '@/lib/email-subscriptions';
import { buildAnalysisReportPdf } from '@/lib/pdfReport';
import { summarizeAnalysis } from '@/lib/reportPayload';
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
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

/** SMTP ayarlari dolu mu? Dogrulama kodu fallback'i icin route'larda kullanilir. */
export function isEmailConfigured() {
  return Boolean(getTransporter());
}

export async function sendEmailNotification(to, message, title = 'Sistem Bildirimi', attachments = []) {
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
      attachments,
    });

    return true;
  } catch (error) {
    console.error('Email bildirim hatası:', error);
    return false;
  }
}

/**
 * Analiz raporunu PDF ekiyle kullaniciya gonderir.
 *
 * @param {object} report  HAM analiz sonucu (statusData.result ile ayni sekil).
 * @param {object} [options]
 * @param {string} [options.baseUrl]  Sunucu tarafinda font/gorsel cekmek icin
 *   mutlak adres (ornek: http://localhost:3000). Route'lar istegin origin'ini
 *   gecirir; tarayici context'inde gerek yok.
 */
export async function sendAnalysisEmailToUser(userId, report, options = {}) {
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
    const coords = report?.coordinates || {};
    const risk = riskLabels[report?.deforestation_risk] || 'Normal';
    const message = [
      `Konum: ${coords.lat ?? '-'}, ${coords.lon ?? '-'}`,
      `Risk seviyesi: ${risk}`,
      '',
      summarizeAnalysis(report),
    ].join('\n');

    // Raporu arayuzdeki indirmeyle BIREBIR AYNI ureten ortak ureticiden
    // cevirip ek olarak gonder; PDF uretimi basarisa mailde "Rapor ekte"
    // notu da dusuyor.
    let attachments = [];
    let pdfNote = '';
    try {
      const doc = await buildAnalysisReportPdf(report, options.baseUrl || '');
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'));
      const regionSlug = String(report?.region_name || 'bolge')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      attachments = [
        {
          filename: `geomorphosis-${regionSlug || 'rapor'}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ];
      pdfNote = '\n\nDetaylı rapor ektedir.';
    } catch (error) {
      console.error('PDF olusturulamadi, metin rapor gonderiliyor:', error);
    }

    // notification_channels modelinde e-posta alani "destination".
    return sendEmailNotification(
      subscription.destination,
      message + pdfNote,
      'GeoMorphosis Analiz Raporu',
      attachments
    );
  } catch (error) {
    console.error('Analiz e-postası gönderme hatası:', error);
    return false;
  }
}
export async function sendVerificationCodeEmail(to, code) {
  const title = 'GeoMorphosis E-Posta Doğrulama Kodu';
  const message = `Doğrulama kodunuz: ${code}\nBu kod ile e-posta aboneliğinizi onaylayabilirsiniz.`;
  return sendEmailNotification(to, message, title);
}
