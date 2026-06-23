import { allowanceBreakdown, type BreakdownInput } from "@/lib/allowance-breakdown";

// Shared, labelled allowance breakdown (Epic 18.4; resolves H4/AD9). Presentational only —
// data comes via props. Renders the grouped subtraction that reconciles EXACTLY to
// Available: (held) − (used) = Available, with Carry-over surfaced as its own line and
// Remaining shown alongside the headline. Tokens only; works in both themes; reflows on
// narrow screens (the table scrolls inside its own container). Numbers use `.t-num`.

const num: React.CSSProperties = { textAlign: "right", fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

/** Render a value with an explicit sign so subtractions read unambiguously. */
function signed(v: number) {
  return v < 0 ? String(v) : `−${v}`; // used rows subtract; negative value flips back to add
}

export default function AllowanceBreakdown({
  balance,
  testid = "allowance-breakdown",
}: {
  balance: BreakdownInput;
  testid?: string;
}) {
  const b = allowanceBreakdown(balance);

  return (
    <div className="table-scroll" data-testid={testid}>
      <table className="table" style={{ width: "100%" }}>
        <caption className="t-label" style={{ textAlign: "left", marginBottom: "var(--space-2)" }}>
          Allowance breakdown
        </caption>
        <tbody>
          {/* Held: Opening + Carry-over (+ Adjustments) */}
          {b.held.map((r) => (
            <tr key={r.key}>
              <th scope="row" style={{ fontWeight: 400 }}>{r.label}</th>
              <td style={num} className="t-num" data-testid={`bd-${r.key}`}>{r.value}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid var(--border-strong)" }}>
            <th scope="row" className="t-label">Total held</th>
            <td style={num} className="t-num" data-testid="bd-held-total">{b.heldTotal}</td>
          </tr>

          {/* Used/requested: Taken + Pending (+ Deductions) — shown as subtractions */}
          {b.used.map((r) => (
            <tr key={r.key}>
              <th scope="row" style={{ fontWeight: 400 }}>{r.label}</th>
              <td style={num} className="t-num" data-testid={`bd-${r.key}`}>{signed(r.value)}</td>
            </tr>
          ))}
          <tr style={{ borderTop: "1px solid var(--border-strong)" }}>
            <th scope="row" className="t-label">Used / requested</th>
            <td style={num} className="t-num" data-testid="bd-used-total">{signed(b.usedTotal)}</td>
          </tr>

          {/* Headline: Available (= held − used) with Remaining shown alongside */}
          <tr>
            <th scope="row">Remaining</th>
            <td style={num} className="t-num" data-testid="bd-remaining">{b.remaining}</td>
          </tr>
          <tr style={{ borderTop: "2px solid var(--accent)" }}>
            <th scope="row"><strong>Available to book</strong></th>
            <td style={{ ...num, fontWeight: 700 }} className="t-num" data-testid="bd-available">{b.available}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
