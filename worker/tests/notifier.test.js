const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const nodemailer = require('nodemailer');

function loadNotifierWithStub(sendMailStub) {
  const originalCreateTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({
    sendMail: sendMailStub,
  });

  delete require.cache[require.resolve('../services/notifier')];
  const notifier = require('../services/notifier');

  nodemailer.createTransport = originalCreateTransport;
  return notifier;
}

test('sendAlert sends the mail payload to the configured transporter', async () => {
  let sentMailOptions = null;

  const notifier = loadNotifierWithStub(async (mailOptions) => {
    sentMailOptions = mailOptions;
  });

  process.env.SMTP_USER = 'sender@example.com';

  await notifier.sendAlert('recipient@example.com', 'Alert subject', 'Alert body');

  assert.ok(sentMailOptions);
  assert.equal(sentMailOptions.from, 'sender@example.com');
  assert.equal(sentMailOptions.to, 'recipient@example.com');
  assert.equal(sentMailOptions.subject, 'Alert subject');
  assert.equal(sentMailOptions.text, 'Alert body');
});
