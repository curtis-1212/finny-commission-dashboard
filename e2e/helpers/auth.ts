/**
 * Creates valid NextAuth v4 session tokens for Playwright tests.
 *
 * NextAuth encodes sessions as JWEs (encrypted JWTs) using a key derived
 * from NEXTAUTH_SECRET via HKDF. We replicate that process here so the
 * real middleware accepts our test cookies without any bypass code.
 */
import { EncryptJWT } from "jose";
import { hkdf } from "node:crypto";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";

const hkdfAsync = promisify(hkdf);
const SECRET = "test-secret-for-playwright-visual-testing";

async function deriveEncryptionKey(): Promise<Uint8Array> {
  // Matches next-auth/jwt getDerivedEncryptionKey(secret, salt="")
  const derived = await hkdfAsync(
    "sha256",
    SECRET,
    "", // salt
    "NextAuth.js Generated Encryption Key", // info
    32, // keylen
  );
  return new Uint8Array(derived);
}

export async function createSessionToken(email: string): Promise<string> {
  const key = await deriveEncryptionKey();
  const now = Math.floor(Date.now() / 1000);

  return new EncryptJWT({
    email,
    name: email.split("@")[0],
    sub: email,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(now)
    .setExpirationTime(now + 86400)
    .setJti(crypto.randomUUID())
    .encrypt(key);
}

export async function authenticateAs(page: Page, email: string): Promise<void> {
  const token = await createSessionToken(email);

  await page.context().addCookies([
    {
      name: "next-auth.session-token",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
