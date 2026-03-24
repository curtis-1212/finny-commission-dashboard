export type UserRole =
  | { type: "rep"; repId: string }
  | { type: "exec" }
  | { type: "both"; repId: string };

const REP_EMAILS: Record<string, string> = {
  "jason@finny.com": "jason",
  "kelcy@finny.com": "kelcy",
  "roy@finny.com": "roy",
  "roy.kasten@finny.com": "roy",
  "max@finny.com": "max",
};

const EXEC_EMAILS = new Set([
  "curtis@finny.com",
  "eden@finny.com",
  "eric@finny.com",
  "jack@finny.com",
  "victoria@finny.com",
  "max@finny.com",
]);

export function getUserRole(email: string | undefined): UserRole | null {
  if (process.env.NODE_ENV !== "production") return { type: "exec" };
  if (!email) return null;
  const lower = email.toLowerCase();
  const repId = REP_EMAILS[lower];
  const isExecEmail = EXEC_EMAILS.has(lower);
  if (repId && isExecEmail) return { type: "both", repId };
  if (repId) return { type: "rep", repId };
  if (isExecEmail) return { type: "exec" };
  return null;
}

export function isExec(role: UserRole): boolean {
  return role.type === "exec" || role.type === "both";
}

export function isRep(role: UserRole): role is { type: "rep"; repId: string } | { type: "both"; repId: string } {
  return role.type === "rep" || role.type === "both";
}
