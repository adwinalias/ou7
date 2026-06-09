"use client";

export default function PrintButton() {
  return (
    <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()} data-testid="wc-print">
      Print
    </button>
  );
}
