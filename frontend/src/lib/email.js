import nodemailer from 'nodemailer';
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