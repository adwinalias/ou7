import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { db } from "./db";
import { env } from "./env";

/**
 * Resolve a verified Google login to an existing OU7 Employee (no self-registration)
 * and link the Google account on first sign-in.
 *
 * - Found, no googleSub yet → link it (Epic 2.3 "link Google").
 * - Found, googleSub matches → fine.
 * - Found, googleSub set but DIFFERENT → identity conflict; do NOT link, return null so
 *   the RBAC guard blocks the session. (signIn already enforced the email domain.)
 * - Not found → return null; the user gets a session but is blocked as unprovisioned.
 *   They do NOT need to re-login once HR provisions them: lib/rbac falls back to an
 *   email lookup. See docs/adr/0004-rbac-and-session-mapping.md.
 */
async function linkAndResolveEmployeeId(email: string, googleSub?: string): Promise<string | null> {
  const employee = await db.employee.findUnique({ where: { email } });
  if (!employee) return null;

  if (googleSub && employee.googleSub && employee.googleSub !== googleSub) {
    console.warn(`[auth] googleSub mismatch for ${email}; blocking until reconciled.`);
    return null;
  }
  if (googleSub && !employee.googleSub) {
    await db.employee.update({ where: { id: employee.id }, data: { googleSub } });
  }
  return employee.id;
}

const providers: NextAuthOptions["providers"] = [
  GoogleProvider({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorization: {
      params: { hd: env.ALLOWED_EMAIL_DOMAIN, prompt: "select_account" },
    },
  }),
];

// Test-only login for Playwright e2e. NEVER enabled in production — guarded by an env
// flag that is only set by the e2e web server. Still domain-restricted, so even if it
// were on it couldn't admit an external account.
if (process.env.E2E_TEST_LOGIN === "1") {
  providers.push(
    CredentialsProvider({
      name: "E2E",
      credentials: { email: { label: "Email", type: "text" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase();
        if (!email.endsWith(`@${env.ALLOWED_EMAIL_DOMAIN.toLowerCase()}`)) return null;
        return { id: email, email };
      },
    }),
  );
}

/**
 * Google Workspace SSO, domain-restricted. No self-registration:
 * the `signIn` callback rejects anyone outside ALLOWED_EMAIL_DOMAIN.
 * The `jwt` callback then maps the verified login to an Employee (Epic 2 mapping);
 * `session` exposes the stable employeeId. Authority is resolved later by lib/rbac.
 */
export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/sign-in" },
  callbacks: {
    async signIn({ profile, account }) {
      // The test credentials provider already domain-checked in authorize().
      if (account?.provider === "credentials") return true;
      const p = profile as { email?: string; email_verified?: boolean } | undefined;
      const email = p?.email ?? "";
      const verified = p?.email_verified !== false;
      return verified && email.toLowerCase().endsWith(`@${env.ALLOWED_EMAIL_DOMAIN.toLowerCase()}`);
    },
    async jwt({ token, user, profile }) {
      // `profile` (OAuth) or `user` (credentials) is only present on initial sign-in.
      // Resolve + link once; the stable identity then rides on the token. Unprovisioned
      // (null) is recovered at request time by lib/rbac's email fallback, so no re-login
      // is needed after provisioning.
      if (profile || user) {
        const p = profile as { email?: string; sub?: string } | undefined;
        const email = (p?.email ?? user?.email ?? (token.email as string | undefined))?.toLowerCase();
        if (email) {
          token.email = email;
          token.employeeId = await linkAndResolveEmployeeId(email, p?.sub);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.employeeId = (token.employeeId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
};
