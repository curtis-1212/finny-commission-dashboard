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
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Attio ${objectSlug} query failed (${res.status}):`, text);
    throw new Error(`Attio query failed`);
  }
  return res.json();
}

/** Query list entries (e.g. Users list). List slug can be UUID or slug. */
export async function attioListEntriesQuery(listSlugOrId: string, body: object) {
  const res = await fetch(`${ATTIO_BASE}/lists/${listSlugOrId}/entries/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ATTIO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`Attio list ${listSlugOrId} entries query failed (${res.status}):`, text);
    throw new Error(`Attio list entries query failed`);
  }
  return res.json();
}

/**
 * Get attribute value from a list entry.
 * Checks entry_values (list-scoped attrs) first, then record_values / values
 * (parent record attrs surfaced on the entry).
 */
export function getEntryVal(entry: any, slug: string): any {
  const candidates = [
    entry?.entry_values?.[slug],
    entry?.record_values?.[slug],
    entry?.values?.[slug],
  ];
  for (const vals of candidates) {
    if (!vals || !Array.isArray(vals) || vals.length === 0) continue;
    const first = vals[0];
    if (first?.value !== undefined) return first.value;
    if (first?.target_record_id) return first.target_record_id;
    if (first?.currency_value !== undefined) return first.currency_value;
    if (typeof first === "string") return first;
    return first;
  }
  return null;
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
  // Date attributes may store as ISO string directly
  if (typeof first === "string") return first;
  return first;
}

// Get all attribute slugs from a record (diagnostic helper)
export function getAttributeSlugs(record: any): string[] {
  return Object.keys(record?.values || {});
}

// ─── Token Validation ───────────────────────────────────────────────────────
const TOKEN_MAP: Record<string, string | undefined> = {
  kelcy: process.env.TOKEN_KELCY,
  jason: process.env.TOKEN_JASON,
  max: process.env.TOKEN_MAX,
  exec: process.env.TOKEN_EXEC,
  austin: process.env.TOKEN_AUSTIN,
  roy: process.env.TOKEN_ROY,
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
