import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAllowedUser } from "@/lib/auth";
import { getTodayAnalysesPage } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
  const pageSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 10);

  try {
    await requireAllowedUser(request);
    return NextResponse.json(await getTodayAnalysesPage(page, pageSize), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Không thể đọc danh sách bài hôm nay.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
