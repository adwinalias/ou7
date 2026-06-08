import { z } from "zod";

// Validate environment at boot so a misconfigured deploy fails fast and loudly.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: z.string().url().optional(),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  ALLOWED_EMAIL_DOMAIN: z.string().default("interestingtimes.me"),
});

export const env = schema.parse(process.env);
