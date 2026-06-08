import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { env } from "./env";

/**
 * Google Workspace SSO, domain-restricted. No self-registration:
 * the `signIn` callback rejects anyone outside ALLOWED_EMAIL_DOMAIN.
 * (Mapping a verified login to an existing Employee record happens in a
 *  later story — see EPIC 2; this is the auth foundation.)
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: { hd: env.ALLOWED_EMAIL_DOMAIN, prompt: "select_account" },
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/sign-in" },
  callbacks: {
    async signIn({ profile }) {
      const p = profile as { email?: string; email_verified?: boolean } | undefined;
      const email = p?.email ?? "";
      const verified = p?.email_verified !== false;
      return verified && email.toLowerCase().endsWith(`@${env.ALLOWED_EMAIL_DOMAIN.toLowerCase()}`);
    },
  },
};
