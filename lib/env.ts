import { z } from "zod";

// Validate environment at boot so a misconfigured deploy fails fast and loudly with a clear,
// per-variable message. Every value here is REQUIRED — there are no silent defaults for
// auth/credentials, so a missing var stops the app instead of half-working.
const schema = z.object({
  DATABASE_URL: z.string().url("DATABASE_URL must be a valid Postgres connection URL"),
  AUTH_URL: z.string().url("AUTH_URL must be the app's canonical URL, e.g. https://ou7.example.com"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required (generate with: openssl rand -base64 32)"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required (Google OAuth client)"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required (Google OAuth client)"),
  ALLOWED_EMAIL_DOMAIN: z.string().min(1, "ALLOWED_EMAIL_DOMAIN is required, e.g. interestingtimes.me"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  • ${String(i.path[0] ?? "?")}: ${i.message}`).join("\n");
  // Names only — never echo values/secrets.
  throw new Error(`Invalid or missing environment variables:\n${lines}\n\nSet them in your deploy env (Netlify) or .env — see .env.example.`);
}

export const env = parsed.data;

// Bridge the canonical AUTH_* vars to the names next-auth v4 reads from process.env, so the
// rest of the app only depends on AUTH_URL/AUTH_SECRET.
process.env.NEXTAUTH_SECRET ||= env.AUTH_SECRET;
process.env.NEXTAUTH_URL ||= env.AUTH_URL;
