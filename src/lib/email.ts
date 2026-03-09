/**
 * Email Service
 * Handles sending emails for verification, password reset, etc.
 * Uses console logging in development, can be extended with real email providers
 */

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email
 * In production, this should be replaced with a real email service like SendGrid, Resend, or AWS SES
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    // In development, log to console
    if (process.env.NODE_ENV === "development") {
      console.log("📧 Email would be sent:");
      console.log(`To: ${options.to}`);
      console.log(`Subject: ${options.subject}`);
      console.log(`Body:\n${options.text || options.html}`);
      return true;
    }

    // TODO: Implement actual email sending in production
    // Example with Resend:
    // const resend = new Resend(process.env.RESEND_API_KEY);
    // await resend.emails.send({
    //   from: 'noreply@aurareserve.com',
    //   ...options
    // });

    console.warn("Email sending not configured for production");
    return false;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<boolean> {
  const verificationUrl = `${baseUrl}/auth/verify-email?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Verify Your Email</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Verify Your Email Address</h1>
          <p>Thank you for signing up with AuraReserve. Please click the button below to verify your email address:</p>
          <div style="margin: 30px 0;">
            <a href="${verificationUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all;">${verificationUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
Verify Your Email Address

Thank you for signing up with AuraReserve. Please click the link below to verify your email address:

${verificationUrl}

This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: "Verify Your Email - AuraReserve",
    html,
    text,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  token: string,
  baseUrl: string
): Promise<boolean> {
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Reset Your Password</h1>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <div style="margin: 30px 0;">
            <a href="${resetUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="color: #666; word-break: break-all;">${resetUrl}</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
Reset Your Password

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
  `;

  return sendEmail({
    to: email,
    subject: "Reset Your Password - AuraReserve",
    html,
    text,
  });
}

/**
 * Send account linking notification email
 */
export async function sendAccountLinkingEmail(
  email: string,
  provider: string
): Promise<boolean> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Account Linked</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">Account Linked Successfully</h1>
          <p>Your AuraReserve account has been successfully linked with your ${provider} account.</p>
          <p>You can now sign in using either your email/password or your ${provider} account.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            If you didn't authorize this linking, please contact support immediately.
          </p>
        </div>
      </body>
    </html>
  `;

  const text = `
Account Linked Successfully

Your AuraReserve account has been successfully linked with your ${provider} account.

You can now sign in using either your email/password or your ${provider} account.

If you didn't authorize this linking, please contact support immediately.
  `;

  return sendEmail({
    to: email,
    subject: "Account Linked - AuraReserve",
    html,
    text,
  });
}
