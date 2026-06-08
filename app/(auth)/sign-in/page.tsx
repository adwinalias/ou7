"use client";

import { signIn } from "next-auth/react";

export default function SignIn() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div className="card" style={{ padding: "var(--space-7)", maxWidth: 380, textAlign: "center" }}>
        <div className="t-label" style={{ marginBottom: "var(--space-3)" }}>N°17 · OU7</div>
        <h1 className="t-h1" style={{ marginBottom: "var(--space-2)" }}>Time off, made simple.</h1>
        <p className="t-muted" style={{ marginBottom: "var(--space-5)" }}>
          Sign in with your Interesting Times Google account.
        </p>
        <button className="btn btn-primary" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
