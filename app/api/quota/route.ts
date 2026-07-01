import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAllowedUser } from "@/lib/auth";
import { getQuotaStatus } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAllowedUser(request);
    return NextResponse.json(await getQuotaStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Không thể đọc quota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
