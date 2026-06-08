"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button className="btn btn-primary" onClick={() => signOut({ callbackUrl: "/sign-in" })}>
      Sign out
    </button>
  );
}
