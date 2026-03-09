/**
 * Email Verification API Route
 * Handles email verification token validation
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthBaseUrl } from "@/lib/auth-env";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Verification token is required" },
        { status: 400 }
      );
    }

    // Find the verification token
    const verification = await prisma.verification.findFirst({
      where: {
        value: token,
      },
    });

    if (!verification) {
      return NextResponse.json(
        { error: "Invalid or expired verification token" },
        { status: 400 }
      );
    }

    // Check if token has expired
    if (verification.expiresAt < new Date()) {
      // Delete expired token
      await prisma.verification.delete({
        where: {
          id: verification.id,
        },
      });

      return NextResponse.json(
        { error: "Verification token has expired" },
        { status: 400 }
      );
    }

    // Find user by email (identifier in Verification)
    const user = await prisma.user.findUnique({
      where: {
        email: verification.identifier,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Update user's emailVerified field
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        emailVerified: true,
      },
    });

    // Delete the used verification token
    await prisma.verification.delete({
      where: {
        id: verification.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Email verification error:", error);
    return NextResponse.json(
      { error: "Failed to verify email" },
      { status: 500 }
    );
  }
}

/**
 * Resend verification email
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || user.emailVerified) {
      // Don't reveal if user exists or verification status for security
      return NextResponse.json({
        success: true,
        message: "If the email exists and is unverified, a verification link has been sent",
      });
    }

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

    // Create verification token
    await prisma.verification.create({
      data: {
        identifier: email,
        value: token,
        expiresAt,
      },
    });

    // Send verification email
    const { sendVerificationEmail } = await import("@/lib/email");
    const baseUrl = getAuthBaseUrl();
    await sendVerificationEmail(email, token, baseUrl);

    return NextResponse.json({
      success: true,
      message: "Verification email sent",
    });
  } catch (error) {
    console.error("Resend verification error:", error);
    return NextResponse.json(
      { error: "Failed to send verification email" },
      { status: 500 }
    );
  }
}
