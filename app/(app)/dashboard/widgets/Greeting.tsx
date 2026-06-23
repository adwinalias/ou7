// Dashboard greeting line (Epic 19.6, L3; streamed per 21.2). The h1 "My Dashboard" stays in
// the shell and renders instantly; only this greeting line awaits the viewer's firstName, so
// the heading never blocks on data. Greeting word + date are computed in Asia/Dubai with no
// data read; firstName is the only awaited value. Testid (dash-greeting) preserved.
import { greetingForHour } from "@/core/dates";
import { cachedGetDashboard } from "./data";

export default async function Greeting({ employeeId }: { employeeId: string }) {
  const { firstName } = await cachedGetDashboard(employeeId);

  const now = new Date();
  const dubaiHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", hour12: false }).format(now),
  );
  const greeting = greetingForHour(dubaiHour);
  const todayLong = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return (
    <p className="t-muted" style={{ margin: 0 }} data-testid="dash-greeting">
      Good {greeting}, {firstName}. <span className="t-num">{todayLong}</span>
    </p>
  );
}
