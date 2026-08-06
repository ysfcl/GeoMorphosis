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

async function sendNotification(to, subject, text) {
    try {
        const info = await transporter.sendMail({
            from: '"Geomorphosis AI" <noreply@geomorphosis.com>',
            to: to,
            subject: subject,
            text: text
        });
        console.log('E-posta başarıyla gönderildi, Mesaj ID: %s', info.messageId);
    } catch (error) {
        console.error('E-posta gönderim hatası:', error);
    }
}

module.exports = { sendNotification };