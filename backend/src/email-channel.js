import nodemailer from 'nodemailer';

function rejected(error) {
  const code = error?.responseCode;
  if (Number.isInteger(code) && code >= 400 && code < 600) {
    return { status: code >= 500 ? 'permanent' : 'retryable', error: `SMTP rejected the message (code ${code})` };
  }
  if (['EAUTH', 'EENVELOPE', 'EMESSAGE'].includes(error?.code)) {
    return { status: 'permanent', error: 'SMTP rejected the credentials or message configuration' };
  }
  return { status: 'retryable', error: 'SMTP connection or delivery failed' };
}

/** Send a normalized alert to one recipient and return a safe, channel-neutral outcome. */
export function createEmailChannel({
  host = '127.0.0.1', port = 11025, from = 'alerts@example.test', secure = false, auth,
  transport = nodemailer.createTransport({
    host, port, secure, auth,
    connectionTimeout: 5_000, greetingTimeout: 5_000, socketTimeout: 10_000,
    disableFileAccess: true, disableUrlAccess: true,
  }),
} = {}) {
  return {
    async send(destination, { title, topic, publisher, url, occurredAt }) {
      const text = [title, `Topic: ${topic}`, `Source: ${publisher}`];
      if (occurredAt !== undefined) text.push(`Occurred (UTC): ${new Date(occurredAt).toISOString()}`);
      if (url) text.push(url);
      try {
        const result = await transport.sendMail({
          from, to: { name: '', address: destination }, subject: title, text: text.join('\n'),
        });
        if (result.accepted?.length === 1) return { status: 'sent' };
        return rejected(result.rejectedErrors?.[0]);
      } catch (error) {
        return rejected(error);
      }
    },
  };
}
