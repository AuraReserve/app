/**
 * Email Update API Route
 * Handles email address changes with current password verification
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getSession } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { sendVerificationEmail } from "@/lib/email";
import { getAuthBaseUrl } from "@/lib/auth-env";
import { schemas } from "@/lib/api/validation";
import { auditUserOperation } from "@/lib/dal/audit";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await getSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { newEmail, currentPassword } = body;

    // Validate required fields
    if (!newEmail || !currentPassword) {
      return NextResponse.json(
        { error: "New email and current password are required" },
        { status: 400 }
      );
    }

    // Validate email format using centralized schema
    const emailResult = schemas.email.safeParse(newEmail);
    if (!emailResult.success) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check if user has a password (not OAuth-only user)
    if (!user.password) {
      return NextResponse.json(
        { error: "This account uses OAuth authentication. Please contact support to change your email." },
        { status: 400 }
      );
    }

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 401 }
      );
    }

    // Check if new email is already in use
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Email address is already in use" },
        { status: 400 }
      );
    }

    const oldEmail = user.email;

    // Update email and reset email verification
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: newEmail,
        emailVerified: false, // Require re-verification
      },
    });

    // Send verification email to new address
    const baseUrl = getAuthBaseUrl();
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.verification.create({
      data: {
        identifier: newEmail,
        value: token,
        expiresAt,
      },
    });

    await sendVerificationEmail(newEmail, token, baseUrl);

    after(async () => {
      await auditUserOperation("update", user.id, oldEmail, request, {
        details: { action: "email_change" },
        oldValues: { email: oldEmail },
        newValues: { email: newEmail },
      });
    });

    return NextResponse.json({
      success: true,
      message: "Email updated successfully. Please verify your new email address.",
    });
  } catch (error) {
    console.error("Email update error:", error);
    return NextResponse.json(
      { error: "Failed to update email" },
      { status: 500 }
    );
  }
}
