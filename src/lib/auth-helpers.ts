/**
 * Authentication Helper Functions
 * Utilities for email verification, password reset, etc.
 */

import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";
import { getAuthBaseUrl } from "@/lib/auth-env";

/**
 * Generate and send email verification token
 */
export async function generateVerificationToken(
  email: string
): Promise<string> {
  // Delete any existing verification tokens for this email
  await prisma.verification.deleteMany({
    where: {
      identifier: email,
    },
  });

  // Generate new verification token
  const crypto = await import("crypto");
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Create verification token in database
  await prisma.verification.create({
    data: {
      identifier: email,
      value: token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Send verification email to user
 */
export async function sendUserVerificationEmail(
  email: string
): Promise<boolean> {
  try {
    const token = await generateVerificationToken(email);
    const baseUrl = getAuthBaseUrl();
    return await sendVerificationEmail(email, token, baseUrl);
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return false;
  }
}

/**
 * Generate password reset token
 */
export async function generatePasswordResetToken(
  email: string
): Promise<string> {
  // Delete any existing reset tokens for this email
  await prisma.verification.deleteMany({
    where: {
      identifier: `reset:${email}`,
    },
  });

  // Generate new reset token
  const crypto = await import("crypto");
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Create reset token in database
  await prisma.verification.create({
    data: {
      identifier: `reset:${email}`,
      value: token,
      expiresAt,
    },
  });

  return token;
}
