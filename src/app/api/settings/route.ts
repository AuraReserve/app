/**
 * Settings API Route
 * Manage global application settings
 */

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { clearSettingsCache } from "@/lib/settings";
import { auditSettingsOperation } from "@/lib/dal";

// GET /api/settings - Get settings
// Public settings can be accessed without auth, all settings require owner role
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const publicOnly = searchParams.get("public") === "true";

    // List of settings that can be accessed publicly (no auth required)
    const publicSettings = ["signup_enabled", "allow_self_registration", "require_email_verification", "app_name"];

    if (publicOnly) {
      // Return only public settings without requiring authentication
      const settings = await prisma.setting.findMany({
        where: {
          key: {
            in: publicSettings,
          },
        },
        orderBy: { key: "asc" },
      });

      return NextResponse.json(settings);
    }

    // For all settings, require owner role
    await requireRole("owner");

    const settings = await prisma.setting.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json(settings);
  } catch (error: unknown) {
    console.error("Error fetching settings:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch settings";
    const status = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// PUT /api/settings - Update settings
export async function PUT(request: NextRequest) {
  try {
    // Require owner role
    const user = await requireRole("owner");

    const body = await request.json();
    const { settings, updatedBy } = body;

    if (!settings || !Array.isArray(settings)) {
      return NextResponse.json(
        { error: "Invalid settings data" },
        { status: 400 }
      );
    }

    // Update all settings
    await Promise.all(
      settings.map(({ key, value }: { key: string; value: string }) =>
        prisma.setting.upsert({
          where: { key },
          update: {
            value,
            updatedBy: updatedBy || user.id,
          },
          create: {
            key,
            value,
            updatedBy: updatedBy || user.id,
          },
        })
      )
    );

    // Clear cached settings so changes take effect immediately
    clearSettingsCache();

    // Audit log for settings changes
    try {
      for (const { key, value } of settings as Array<{ key: string; value: string }>) {
        await auditSettingsOperation("update", key, user.email, request, {
          newValues: { key, value },
          details: { setting_key: key },
        });
      }
    } catch (auditError) {
      console.error("Error creating audit log for settings update:", auditError);
    }

    const updatedSettings = await prisma.setting.findMany({
      orderBy: { key: "asc" },
    });

    return NextResponse.json(updatedSettings);
  } catch (error: unknown) {
    console.error("Error updating settings:", error);
    const message = error instanceof Error ? error.message : "Failed to update settings";
    const status = message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
