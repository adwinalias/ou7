// Module augmentation: carry the OU7 Employee identity on the Auth.js session/JWT.
//
// The token holds only the STABLE employee identity (id + email). Authority — role,
// approver level, approver assignments, active status — is resolved fresh from the DB
// by lib/rbac on each guarded action, so role changes apply immediately and every
// action is authorized server-side. See docs/adr/0004-rbac-and-session-mapping.md.
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** OU7 Employee id, or null if the signed-in Google account isn't provisioned yet. */
      employeeId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    employeeId?: string | null;
  }
}
