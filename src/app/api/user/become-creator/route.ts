import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { auditUserOperation } from "@/lib/dal/audit";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();

    // Self-hosted mode: admin must assign roles, no self-service
    if (getEnv().SELF_HOSTED) {
      return NextResponse.json(
        { error: "Self-service role upgrade is not available in self-hosted mode" },
        { status: 403 }
      );
    }

    // User already has a platform role (admin, owner, or creator)
    if (user.role) {
      return NextResponse.json(
        { error: "User already has a platform role" },
        { status: 400 }
      );
    }

    // Assign creator role — use uppercase unmapped name per Prisma bug workaround
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "CREATOR" as unknown as import("@prisma/client").UserRole },
    });

    after(async () => {
      await auditUserOperation("update", user.id, user.email, request, {
        details: { action: "self_assign_creator_role" },
        oldValues: { role: null },
        newValues: { role: "creator" },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
