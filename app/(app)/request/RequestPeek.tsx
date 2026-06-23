"use client";

import { useCallback, useState } from "react";
import Modal from "@/components/Modal";
import type { RequestContext } from "@/lib/leave";
import { requestContextAction } from "./actions";
import RequestForm from "./RequestForm";

// Persistent "Request leave" action (Epic 18.7). Lives in the app-shell header so it's
// reachable from every screen, and opens the existing Request flow in a right-anchored
// slide-over (Modal placement="side") instead of navigating to /request. The context
// is LAZY-loaded on open via requestContextAction() so the trigger adds no query to
// every page. All a11y mechanics (focus trap, Escape, focus restore, aria-modal) are
// inherited from Modal — server-side validation/authz are unchanged (same RequestForm,
// same preview/submit actions).
export default function RequestPeek() {
  const [open, setOpen] = useState(false);
  const [ctx, setCtx] = useState<RequestContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    requestContextAction()
      .then((res) => setCtx(res))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  function onOpen() {
    setOpen(true);
    // Fetch fresh each open so the balance/leave types reflect the latest state.
    load();
  }

  function onClose() {
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        onClick={onOpen}
        data-testid="dash-request"
      >
        Request leave
      </button>

      <Modal open={open} onClose={onClose} title="Request leave" placement="side" role="dialog">
        {loading && (
          <p className="t-muted" aria-live="polite" style={{ margin: 0 }}>
            Loading…
          </p>
        )}
        {!loading && error && (
          <div
            role="alert"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderLeft: "3px solid var(--danger)",
              padding: "var(--space-3) var(--space-4)",
              color: "var(--text)",
            }}
          >
            Couldn&apos;t load the request form. Please close and try again.
          </div>
        )}
        {!loading && !error && ctx && (
          <RequestForm
            leaveTypes={ctx.leaveTypes}
            regionName={ctx.regionName}
            available={ctx.balance?.available ?? null}
            hasPeriod={ctx.balance !== null}
          />
        )}
      </Modal>
    </>
  );
}
