export type UserRole = { type: "rep"; repId: string } | { type: "exec" };

const REP_EMAILS: Record<string, string> = {
  "jason@finny.com": "jason",
  "kelcy@finny.com": "kelcy",
  "roy@finny.com": "roy",
  "max@finny.com": "max",
};

const EXEC_EMAILS = new Set([
  "curtis@finny.com",
  "eden@finny.com",
  "eric@finny.com",
  "jack@finny.com",
  "victoria@finny.com",
]);

export function getUserRole(email: string | undefined): UserRole | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (lower in REP_EMAILS) return { type: "rep", repId: REP_EMAILS[lower] };
  if (EXEC_EMAILS.has(lower)) return { type: "exec" };
  return null;
}
