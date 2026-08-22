const nodemailer = require('nodemailer');

// Kendi SMTP veya test sunucuna göre yapılandıracağın kısım
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.example.com',
    port: process.env.SMTP_PORT || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER || 'user',
        pass: process.env.SMTP_PASS || 'pass'
    }
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
