import { NextResponse } from "next/server";
import { getQuotaStatus } from "@/lib/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getQuotaStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể đọc quota.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
