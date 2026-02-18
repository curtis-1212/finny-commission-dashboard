import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AuthResult {
  authenticated: boolean;
  method: "supabase" | "token" | null;
  role: "exec" | "ae" | "bdr" | null;
  repId: string | null;
}

const TOKEN_MAP: Record<string, string | undefined> = {
  exec: process.env.TOKEN_EXEC,
  kelcy: process.env.TOKEN_KELCY,
  jason: process.env.TOKEN_JASON,
  max: process.env.TOKEN_MAX,
  austin: process.env.TOKEN_AUSTIN,
  roy: process.env.TOKEN_ROY,
};

const BDR_IDS = new Set(["max"]);

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function resolveTokenIdentity(token: string): { role: "exec" | "ae" | "bdr"; repId: string } | null {
  for (const [key, expected] of Object.entries(TOKEN_MAP)) {
    if (!expected) continue;
    if (constantTimeCompare(token, expected)) {
      if (key === "exec") return { role: "exec", repId: "exec" };
      return { role: BDR_IDS.has(key) ? "bdr" : "ae", repId: key };
    }
  }
  return null;
}

export async function getAuth(request: NextRequest): Promise<AuthResult> {
  const noAuth: AuthResult = {
    authenticated: false, method: null, role: null, repId: null,
  };

  // Check legacy token first (fast, no network call)
  const token =
    request.nextUrl.searchParams.get("token") ||
    request.headers.get("authorization")?.replace("Bearer ", "") ||
    null;

  if (token) {
    const identity = resolveTokenIdentity(token);
    if (identity) {
      return {
        authenticated: true,
        method: "token",
        role: identity.role,
        repId: identity.repId,
      };
    }
  }

  // Check Supabase session
  try {
    const supabase = createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return noAuth;

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("team_members")
      .select("rep_id, role")
      .eq("user_id", user.id)
      .single();

    if (!profile) return noAuth;

    return {
      authenticated: true,
      method: "supabase",
      role: profile.role as AuthResult["role"],
      repId: profile.rep_id,
    };
  } catch {
    return noAuth;
  }
}
