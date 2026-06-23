"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Reusable, accessible dialog primitive (Epic 20.3). Implements the WAI-ARIA dialog
// pattern: role="dialog" (or "alertdialog"), aria-modal, labelled by a title and
// optionally described by content. While open it TRAPS focus (Tab/Shift+Tab cycle
// within the panel), Escape always closes, and focus is RESTORED to the element that
// opened it. Tokens only; uses --shadow-overlay; sharp corners; both themes; honours
// prefers-reduced-motion. Built generically so 18.7 (Request side-peek) can reuse it.

// Elements that can receive keyboard focus inside the dialog.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    // The panel now hosts a full form, so be strict about what can actually take focus
    // (20.3 review): skip disabled/hidden/aria-hidden controls and anything with no
    // layout box (display:none, or a collapsed/conditionally-rendered field). The
    // active element is always kept so the Tab cycle can find its current position.
    if (el === document.activeElement) return true;
    if (
      (el as HTMLButtonElement | HTMLInputElement).disabled ||
      el.hasAttribute("disabled") ||
      el.hasAttribute("hidden") ||
      el.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }
    // No layout box → not focusable. offsetParent is null for display:none and for
    // position:fixed ancestors, so also accept any element that reports a client rect.
    return el.offsetParent !== null || el.getClientRects().length > 0;
  });
}

export interface ModalProps {
  /** Whether the dialog is rendered/open. */
  open: boolean;
  /** Called when the dialog requests to close (Escape, backdrop click for role="dialog"). */
  onClose: () => void;
  /** Visible title text. Used as the accessible name unless `labelledById` is given. */
  title: string;
  /** "dialog" (default) allows click-outside to close; "alertdialog" requires an explicit choice. */
  role?: "dialog" | "alertdialog";
  /** "center" (default) is a centred modal; "side" is a right-anchored, full-height slide-over (18.7). */
  placement?: "center" | "side";
  /** Override the element that labels the dialog (e.g. an existing heading id). */
  labelledById?: string;
  /** Id of an element that describes the dialog (maps to aria-describedby). */
  describedById?: string;
  /** Element to focus on open; defaults to the first focusable element in the panel. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** Hide the rendered title (still used as the accessible name). */
  hideTitle?: boolean;
  children: ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  role = "dialog",
  placement = "center",
  labelledById,
  describedById,
  initialFocusRef,
  hideTitle = false,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The element to restore focus to on close — captured when the dialog opens.
  const triggerRef = useRef<HTMLElement | null>(null);
  const generatedTitleId = useId();
  const titleId = labelledById ?? generatedTitleId;

  // Capture the opener and restore focus to it on close/unmount.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = (document.activeElement as HTMLElement) ?? null;
    return () => {
      triggerRef.current?.focus?.();
    };
  }, [open]);

  // Move focus into the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const target = initialFocusRef?.current ?? getFocusable(panel)[0] ?? panel;
    // rAF so the panel is laid out before we focus (matches the previous inline behaviour).
    const id = requestAnimationFrame(() => target.focus());
    return () => cancelAnimationFrame(id);
  }, [open, initialFocusRef]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = getFocusable(panel);
      if (focusable.length === 0) {
        // Nothing focusable — keep focus on the panel itself.
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open) return null;
  if (typeof document === "undefined") return null;

  function onBackdropClick() {
    // alertdialog requires an explicit choice; only a plain dialog closes on outside click.
    if (role === "dialog") onClose();
  }

  const side = placement === "side";

  return createPortal(
    // The backdrop is a pointer-only convenience that mirrors Escape (handled on the
    // panel via onKeyDown). Keyboard users close with Escape, so the backdrop needs no
    // key handler and is not an interactive element in the a11y tree — these two
    // jsx-a11y rules are false positives for a decorative backdrop with a redundant
    // click-to-close shortcut.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      onClick={onBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: side ? "stretch" : "center",
        // Side-peek anchors to the right edge; centred modal stays centred.
        justifyContent: side ? "flex-end" : "center",
        padding: side ? 0 : "var(--space-4)",
        background: "rgba(10,10,10,0.45)",
      }}
    >
      <div
        ref={panelRef}
        // The side variant animates in via a CSS class; the slide transform is guarded
        // behind prefers-reduced-motion in globals.css (.modal-side), so reduced-motion
        // users get no slide. Centred modals keep their inline styling unchanged.
        className={side ? "modal-side" : undefined}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
        style={
          side
            ? {
                background: "var(--surface)",
                borderLeft: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-0)",
                boxShadow: "var(--shadow-overlay)",
                padding: "var(--space-5)",
                // Full-height; up to ~520px, full-width on narrow screens (≤640px).
                width: "min(520px, 100vw)",
                maxWidth: "100vw",
                height: "100vh",
                maxHeight: "100vh",
                overflowY: "auto",
              }
            : {
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-0)",
                boxShadow: "var(--shadow-overlay)",
                padding: "var(--space-5)",
                maxWidth: "min(32rem, 100%)",
                width: "100%",
                maxHeight: "calc(100vh - var(--space-6))",
                overflowY: "auto",
              }
        }
      >
        <h2
          id={titleId}
          className="t-label"
          style={
            hideTitle
              ? { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }
              : { margin: 0, marginBottom: "var(--space-3)" }
          }
        >
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
