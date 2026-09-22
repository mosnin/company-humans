"use client";
import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
export function SignOutButton() {
  const { signOut } = useAuthActions();
  const [pending,setPending] = useState(false);
  const [failed,setFailed] = useState(false);
  async function leave() {
    setPending(true);setFailed(false);
    try { await signOut();
      try { localStorage.removeItem("ch_pending_invitation"); } catch { /* Browser storage is optional. */ }
      window.location.assign("/sign-in"); }
    catch { setPending(false);setFailed(true); }
  }
  return <span className="inline-flex items-center gap-2">
    <button type="button" disabled={pending} onClick={() => void leave()} className="focus-ring rounded-8 t-caption underline underline-offset-4 disabled:opacity-50">{pending ? "Signing out…" : "Sign out"}</button>
    {failed ? <span role="alert" className="t-caption">Sign-out failed. Retry.</span> : null}
  </span>;
}
