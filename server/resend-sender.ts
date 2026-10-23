/**
 * Resend email delivery for sign-in OTPs. The OTP is passed straight into the
 * message and never logged. Delivery errors surface to the caller; the
 * authentication library owns OTP expiry and consumption.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function createResendSender(apiKey: string, from: string) {
  return {
    async send({ email, otp }: { email: string; otp: string; type: string }) {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: email,
          subject: 'Animate Studio 登录验证码',
          text: `你的登录验证码是 ${otp}，5 分钟内有效。如非本人操作，请忽略此邮件。`,
        }),
      });
      if (!response.ok) throw new Error(`Resend delivery failed (${response.status})`);
    },
  };
}
