"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Mode = "login" | "signup";

export function LoginForm({
  next,
  demoUsers,
  demoPassword,
}: {
  next: string;
  demoUsers: { username: string; displayName: string }[];
  demoPassword: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const submit = async (m: Mode, body: Record<string, string>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${m}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      router.replace(next);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <h1>{mode === "login" ? "Log in to bid" : "Create your account"}</h1>
        <p className="muted">Anyone can watch. You need an account to place bids or start an auction.</p>

        <div className="seg seg-2" role="tablist">
          <button type="button" className={mode === "login" ? "on" : ""} onClick={() => setMode("login")}>
            Log in
          </button>
          <button type="button" className={mode === "signup" ? "on" : ""} onClick={() => setMode("signup")}>
            Sign up
          </button>
        </div>

        <form
          className="form-tight"
          onSubmit={(e) => {
            e.preventDefault();
            submit(mode, mode === "login" ? { username, password } : { username, password, displayName }, "form");
          }}
        >
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
          </label>
          {mode === "signup" && (
            <label className="field">
              <span>
                Display name <em className="muted">shown on your bids</em>
              </span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={24} placeholder={username || "e.g. Sandip"} />
            </label>
          )}
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </label>
          {error && <div className="notice warn">{error}</div>}
          <button className="btn btn-accent btn-lg" disabled={!!busy}>
            {busy === "form" ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div className="demo">
          <div className="label">Or try a demo account</div>
          <div className="demo-row">
            {demoUsers.map((d) => (
              <button
                key={d.username}
                type="button"
                className="btn btn-ghost"
                disabled={!!busy}
                onClick={() => submit("login", { username: d.username, password: demoPassword }, d.username)}
              >
                {busy === d.username ? "…" : d.displayName}
              </button>
            ))}
          </div>
          <p className="muted small">
            Shared accounts (password <code>{demoPassword}</code>). Open two browsers as different people to stage a bidding war.
          </p>
        </div>
      </div>
    </div>
  );
}
