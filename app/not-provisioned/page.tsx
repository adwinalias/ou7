import SignOutButton from "./SignOutButton";

// Shown to a signed-in Google user whose account isn't an active OU7 Employee yet
// (no self-registration). Lives outside the (app) group so the shell guard doesn't
// redirect-loop. Once HR provisions them, lib/rbac's email fallback lets them in with
// no re-login required.
export default function NotProvisionedPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg)", color: "var(--text)" }}>
      <div className="card" style={{ padding: "var(--space-7)", maxWidth: 420, textAlign: "center" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>N°17 · OU7</div>
        <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Your account isn&apos;t set up yet</h1>
        <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
          You&apos;ve signed in successfully, but you don&apos;t have an active OU7 profile.
          Please ask HR to provision your account, then sign in again.
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
