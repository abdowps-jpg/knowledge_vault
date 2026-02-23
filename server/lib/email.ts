type SendVerificationEmailInput = {
  to: string;
  code: string;
};

async function sendViaResend(input: SendVerificationEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: 'Verify your Knowledge Vault account',
      html: `<p>Your verification code is: <strong>${input.code}</strong></p><p>This code expires in 15 minutes.</p>`,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    console.error('[Email] Resend failed:', response.status, message);
    return false;
  }

  return true;
}

export async function sendVerificationEmail(input: SendVerificationEmailInput): Promise<void> {
  const sent = await sendViaResend(input);
  if (sent) {
    console.log('[Email] Verification email sent:', { to: input.to });
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Email provider is not configured');
  }

  // Dev-only fallback to unblock local testing without a provider.
  console.log('[Email][DEV] Verification code fallback:', {
    to: input.to,
    code: input.code,
  });
}
