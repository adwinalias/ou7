export default function RequestPage() {
  return (
    <div>
      <h1 className="t-h1">Request leave</h1>
      <p className="t-muted" style={{ marginTop: 12 }}>
        Type → dates → duration → notes → <strong>Check details</strong> (conflict + over-booking blocks, allowance
        impact) → Submit. Validation lives in <code>core/leave</code>. See EPIC 5.
      </p>
    </div>
  );
}
