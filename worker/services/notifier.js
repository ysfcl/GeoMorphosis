const nodemailer = require('nodemailer');

// Kendi SMTP veya test sunucuna göre yapılandıracağın kısım
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: Number(process.env.SMTP_PORT) || 587,
    // 465 = baglanti bastan TLS (secure:true), 587 = STARTTLS (secure:false)
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER || 'user',
        pass: process.env.SMTP_PASS || 'pass'
    },
    // Asili SMTP baglantilarinin worker'i kilitlememesi icin
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
});

/**
 * Uyarı e-postası gönderir.
 * @returns {Promise<boolean>} gönderim başarılı ise true
 */
async function sendAlert(to, subject, text) {
    if (!to) {
        console.warn('E-posta alicisi belirtilmedi, bildirim atlanıyor.');
        return false;
    }

    try {
        const info = await transporter.sendMail({
            from: process.env.SMTP_USER,
            to,
            subject,
            text
        });
        console.log('E-posta başarıyla gönderildi, Mesaj ID: %s', info.messageId);
        return true;
    } catch (error) {
        console.error('E-posta gönderim hatası:', error);
        return false;
    }
}

module.exports = {
    sendAlert,
    // Eski isim geriye dönük uyumluluk için korunuyor
    sendNotification: sendAlert
};
