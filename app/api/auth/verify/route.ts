import { NextRequest, NextResponse } from "next/server";
import { validateToken } from "@/lib/attio";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const role = request.nextUrl.searchParams.get("role") || "exec";

  if (validateToken(role, token)) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
