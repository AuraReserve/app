/**
 * Initial Setup API
 *
 * Creates the first owner account on a fresh deployment.
 * Only accessible when zero users exist in the database.
 */

import { NextRequest, NextResponse } from "next/server";
import { prismaBase } from "@/lib/prisma";
import { validatePassword, hashPassword } from "@/lib/password";
import { UserRole } from "@prisma/client";

const USER_ROLE_OWNER = "OWNER" as unknown as UserRole;

async function hasUsers(): Promise<boolean> {
  const count = await prismaBase.user.count({ take: 1 });
  return count > 0;
}

/**
 * GET /api/setup — Check if initial setup is needed
 */
export async function GET() {
  const usersExist = await hasUsers();
  return NextResponse.json({ setupRequired: !usersExist });
}

/**
 * POST /api/setup — Create the first owner account
 */
export async function POST(request: NextRequest) {
  // Hard check: only works when no users exist
  if (await hasUsers()) {
    return NextResponse.json(
      { error: "Setup has already been completed" },
      { status: 403 }
    );
  }

  let body: { name?: string; email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { name, email, password } = body;

  if (!name?.trim() || !email?.trim() || !password) {
    return NextResponse.json(
      { error: "Name, email, and password are required" },
      { status: 400 }
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 }
    );
  }

  // Validate password strength
  const validation = validatePassword(password);
  if (!validation.isValid) {
    return NextResponse.json(
      { error: validation.errors[0] },
      { status: 400 }
    );
  }

  // Race condition guard: re-check before writing
  if (await hasUsers()) {
    return NextResponse.json(
      { error: "Setup has already been completed" },
      { status: 403 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const hashedPassword = await hashPassword(password);

  // Create owner user
  const user = await prismaBase.user.create({
    data: {
      email: normalizedEmail,
      name: name.trim(),
      role: USER_ROLE_OWNER,
      emailVerified: true,
      isActive: true,
    },
  });

  // Better Auth credential account (required for email/password sign-in)
  await prismaBase.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: hashedPassword,
    },
  });

  // Seed default settings
  const defaultSettings = [
    { key: "signup_enabled", value: "false", description: "Allow new users to sign up for accounts" },
    { key: "allow_self_registration", value: "false", description: "Allow users to register without invitation" },
    { key: "require_email_verification", value: "false", description: "Require email verification for new accounts" },
    { key: "maintenance_mode", value: "false", description: "Put the application in maintenance mode" },
    { key: "app_name", value: "AuraReserve", description: "Application name displayed in UI" },
    { key: "max_api_keys_per_space", value: "10", description: "Maximum number of API keys allowed per space" },
  ];

  await Promise.all(
    defaultSettings.map(({ key, value, description }) =>
      prismaBase.setting.upsert({
        where: { key },
        update: {},
        create: { key, value, description, updatedBy: user.id },
      })
    )
  );

  return NextResponse.json({ success: true });
}
