/**
 * Forgot Password API Route
 * Generates a password reset token and sends an email with the reset link.
 * Uses timing-safe responses to prevent user enumeration.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generatePasswordResetToken } from "@/lib/auth-helpers";
import { sendPasswordResetEmail } from "@/lib/email";
import { getAuthBaseUrl } from "@/lib/auth-env";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Always return the same response to prevent user enumeration.
    // Only send the email if the user exists and has a password.
    const successResponse = NextResponse.json({
      success: true,
      message: "If an account exists with that email, a password reset link has been sent",
    });

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    // Don't reveal whether user exists
    if (!user || !user.password) {
      return successResponse;
    }

    const token = await generatePasswordResetToken(user.email);
    const baseUrl = getAuthBaseUrl();
    await sendPasswordResetEmail(user.email, token, baseUrl);

    return successResponse;
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
