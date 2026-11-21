"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/types";

export function UserMenu({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const path = usePathname();
  const [busy, setBusy] = useState(false);

  if (!user) {
    if (path === "/login") return null;
    return (
      <Link href={`/login?next=${encodeURIComponent(path)}`} className="btn btn-sm btn-ghost">
        Log in
      </Link>
    );
  }

  const logout = async () => {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.refresh();
    setBusy(false);
  };

  return (
    <div className="user">
      <span className="avatar" aria-hidden>
        {user.displayName.slice(0, 1).toUpperCase()}
      </span>
      <span className="user-name">{user.displayName}</span>
      <button className="link-btn" onClick={logout} disabled={busy}>
        Log out
      </button>
    </div>
  );
}
