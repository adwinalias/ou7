export default function DashboardPage() {
  return (
    <div>
      <h1 className="t-h1" style={{ marginBottom: "var(--space-5)" }}>Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "var(--space-4)" }}>
        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div className="t-label">Allowances this year</div>
          <div className="t-num" style={{ fontSize: 40, marginTop: 8 }}>
            1<span className="t-muted" style={{ fontSize: 16 }}> / 26 days available</span>
          </div>
          <p className="t-muted" style={{ marginTop: 8, fontSize: 13 }}>Opening 26 · Pending 10 · Taken 15</p>
        </section>

        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div className="t-label">My next 7 days</div>
          <p className="t-muted" style={{ marginTop: 8 }}>Work pattern + booked leave — see EPIC 8.</p>
        </section>

        <section className="card" style={{ padding: "var(--space-5)" }}>
          <div className="t-label">Request leave</div>
          <p className="t-muted" style={{ marginTop: 8, marginBottom: "var(--space-4)" }}>Book time off in a couple of clicks.</p>
          <a className="btn btn-primary" href="/request">Request leave</a>
        </section>
      </div>
    </div>
  );
}
