import { NextResponse } from "next/server";
import { getSpaceRole, requireSpaceAccess } from "@/lib/auth-utils";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;

    // Require space access
    await requireSpaceAccess(spaceId);

    // Get user's role for this space
    const role = await getSpaceRole(spaceId);

    return NextResponse.json({ role });
  } catch (error) {
    console.error("Error fetching space role:", error);

    if (error instanceof Error) {
      if (error.message.includes("Unauthorized")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message.includes("Forbidden")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch space role" },
      { status: 500 }
    );
  }
}
