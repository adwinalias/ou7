export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", app: "ou7", ts: new Date().toISOString() });
}
