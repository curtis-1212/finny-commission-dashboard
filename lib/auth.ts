import { NextAuthOptions, Session } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const isDev = process.env.NODE_ENV !== "production";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return user.email?.endsWith("@finny.com") ?? false;
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};

const DEV_SESSION: Session = {
  user: { email: "dev@finny.com", name: "Dev Admin" },
  expires: "2099-01-01T00:00:00.000Z",
};

export async function getAppSession(): Promise<Session | null> {
  if (isDev) return DEV_SESSION;
  return getServerSession(authOptions);
}
