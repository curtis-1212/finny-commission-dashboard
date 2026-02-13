// ═══════════════════════════════════════════════════════════════════════════════
// SERVER-ONLY — Attio API helpers shared across routes
// ═══════════════════════════════════════════════════════════════════════════════

const ATTIO_BASE = "https://api.attio.com/v2";

export async function attioQuery(objectSlug: string, body: object) {
  const res = await fetch(`${ATTIO_BASE}/objects/${objectSlug}/records/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ATTIO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Attio ${objectSlug} query failed (${res.status}):`, text);
    throw new Error(`Attio query failed`); // Generic — don't leak details
  }
  return res.json();
}

export function getVal(record: any, slug: string): any {
  const vals = record?.values?.[slug];
  if (!vals || !Array.isArray(vals) || vals.length === 0) return null;
  const first = vals[0];
  // Handle different Attio value shapes
  if (first?.value !== undefined) return first.value;
  if (first?.target_record_id) return first.target_record_id;
  if (first?.referenced_actor_id) return first.referenced_actor_id;
  if (first?.currency_value !== undefined) return first.currency_value;
  return first;
}

// ─── Token Validation ───────────────────────────────────────────────────────
const TOKEN_MAP: Record<string, string | undefined> = {
  kelcy: process.env.TOKEN_KELCY,
  jason: process.env.TOKEN_JASON,
  max: process.env.TOKEN_MAX,
  exec: process.env.TOKEN_EXEC,
};

export function validateToken(role: string, token: string | null): boolean {
  const expected = TOKEN_MAP[role];
  if (!expected || !token) return false;
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}
