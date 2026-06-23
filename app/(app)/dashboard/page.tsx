import { Suspense } from "react";
import DashboardGrid, { type DashboardWidget } from "@/components/DashboardGrid";
import { isApprover } from "@/core/authz";
import { requireUser } from "@/lib/rbac";
import AllowanceWidget from "./widgets/AllowanceWidget";
import Next7Widget from "./widgets/Next7Widget";
import WhosOffWidget from "./widgets/WhosOffWidget";
import UpcomingHolidaysWidget from "./widgets/UpcomingHolidaysWidget";
import AlertsWidget from "./widgets/AlertsWidget";
import PendingApprovalsWidget from "./widgets/PendingApprovalsWidget";
import Greeting from "./widgets/Greeting";
import WidgetSkeleton from "./widgets/WidgetSkeleton";

// Epic 21.2 — stream the dashboard. The page is a thin SHELL: the only top-level await is
// requireUser() (needed for the actor + perms; the tab bar already lives in the layout).
// Each widget is its OWN async server component that fetches its OWN data, wrapped in a
// <Suspense> with a sized skeleton fallback, so a slow query for one widget never blocks the
// shell or the other widgets — and RSC streaming flows through the client DashboardGrid
// (server components passed as `content` props stream with their own Suspense boundary).
export default async function DashboardPage() {
  const actor = await requireUser();
  // Pending only matters for approvers/HR; for everyone else the tile is omitted entirely
  // (AC4) — the widget is never even constructed, so its count is never queried.
  const approver = isApprover(actor);

  // Each widget's content is now an independently-streamed async server component. The array
  // order is the DEFAULT layout for new users; DashboardGrid is id-keyed so add/remove/reorder
  // (Epic 18.1, persisted) still works against these same { id, title, content } entries.
  const widgets: DashboardWidget[] = [
    {
      id: "alerts",
      title: "Alerts",
      content: (
        <Suspense fallback={<WidgetSkeleton minHeight={140} />}>
          <AlertsWidget actor={actor} approver={approver} />
        </Suspense>
      ),
    },
    {
      id: "allowance",
      title: "Allowance this year",
      content: (
        <Suspense fallback={<WidgetSkeleton minHeight={320} />}>
          <AllowanceWidget employeeId={actor.employeeId} />
        </Suspense>
      ),
    },
    {
      id: "next7",
      title: "My next 7 days",
      content: (
        <Suspense fallback={<WidgetSkeleton minHeight={200} />}>
          <Next7Widget employeeId={actor.employeeId} />
        </Suspense>
      ),
    },
    {
      id: "upcoming-holidays",
      title: "Upcoming holidays",
      content: (
        <Suspense fallback={<WidgetSkeleton minHeight={160} />}>
          <UpcomingHolidaysWidget employeeId={actor.employeeId} />
        </Suspense>
      ),
    },
    {
      id: "whosoff",
      title: "Who's off",
      content: (
        <Suspense fallback={<WidgetSkeleton minHeight={200} />}>
          <WhosOffWidget actor={actor} />
        </Suspense>
      ),
    },
    // Epic 18.7: the full-column "Request leave" tile was removed — the Request flow is now
    // reachable from the persistent side-peek action in the app-shell header (RequestPeek).
  ];

  // Role-aware "Pending approvals (N)" tile (Epic 18.3) — present in the registry ONLY for
  // approvers/HR; non-approvers never get the widget at all (AC4). Deep-links to /approvals.
  if (approver) {
    widgets.push({
      id: "pending-approvals",
      title: "Pending approvals",
      content: (
        <Suspense fallback={<WidgetSkeleton minHeight={120} />}>
          <PendingApprovalsWidget actor={actor} />
        </Suspense>
      ),
    });
  }

  // The SHELL renders without awaiting widget data: the h1 is instant; only the greeting line
  // streams in (its own Suspense, with a sized text fallback so the header doesn't shift).
  return (
    <div>
      <header style={{ marginBottom: "var(--space-5)" }}>
        <h1 className="t-h1" style={{ marginBottom: "var(--space-1)" }}>My Dashboard</h1>
        <Suspense
          fallback={
            <p className="t-muted" style={{ margin: 0 }} aria-hidden="true">
              &nbsp;
            </p>
          }
        >
          <Greeting employeeId={actor.employeeId} />
        </Suspense>
      </header>
      <DashboardGrid widgets={widgets} />
    </div>
  );
}
