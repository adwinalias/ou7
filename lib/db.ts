import "server-only"; // Epic 22.4: hard-fail the build if this DB client is ever imported into a Client Component.
import { PrismaClient } from "@prisma/client";

// `query`-level event emission (Epic 22.3): emitting as an EVENT (not a log) is SILENT —
// nothing reaches stdout — but lets a test attach `db.$on("query", …)` to COUNT the
// queries a call issues and prove the wall chart is bounded (no N+1). The typed client
// below makes `db.$on("query", cb)` type-check.
type DbClient = PrismaClient<{ log: [{ emit: "event"; level: "query" }] }>;

// Prisma client singleton (avoids exhausting connections during dev hot-reload).
const globalForPrisma = globalThis as unknown as { prisma?: DbClient };

export const db: DbClient =
  globalForPrisma.prisma ?? new PrismaClient({ log: [{ emit: "event", level: "query" }] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
