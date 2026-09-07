"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

export function OwnerSignIn({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(!setup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!setup) return;
    const fragment = window.location.hash.slice(1);
    // Remove the invitation from the address bar/history before further navigation.
    window.history.replaceState(null, "", window.location.pathname);
    if (/^[a-f0-9]{64}$/.test(fragment)) setToken(fragment);
    setReady(true);
  }, [setup]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const username = String(values.get("username") ?? "");
    const password = String(values.get("password") ?? "");
    if (setup && password !== values.get("confirm")) { setError("Your passwords do not match."); return; }
    setBusy(true); setError("");
    try {
      if (setup) {
        const response = await fetch("/api/owner-setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, username, password }) });
        const result = await response.json();
        if (!response.ok) { setError(result.error ?? "Setup could not be completed."); return; }
        setToken(""); setDone(true);
      } else {
        const result = await signIn.username({ username, password });
        if (result.error) { setError("Could not sign in. Check your username and password, or wait a minute before trying again."); return; }
        router.replace("/dashboard"); router.refresh();
      }
    } catch { setError("Could not connect. Please try again."); }
    finally { setBusy(false); }
  }
  const unavailable = setup && ready && !token && !done;
  return <main className="min-h-dvh flex items-center justify-center px-6 py-16">
    <section className="w-full max-w-md space-y-8">
      <Link href="/" className="text-sm font-medium">WhoDoYouKnow</Link>
      <div className="space-y-3">
        <p className="text-sm text-neutral-600">Your private relationship workspace</p>
        <h1 className="font-serif text-4xl text-balance">{done ? "You’re ready." : setup ? "Make yourself at home." : "Welcome back."}</h1>
        <p className="text-neutral-600 text-pretty">{done ? "Your account is set up. Sign in with the username and password you just chose." : setup ? "Choose a username and a password just for this app." : "Sign in to see who you’d like to reconnect with."}</p>
      </div>
      {done ? <Button asChild><Link href="/login">Continue to sign in</Link></Button> : unavailable ?
        <p role="alert" className="text-sm text-pretty">Open your private account setup link to continue. If it has expired, request a fresh link from your administrator.</p> :
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2"><label htmlFor="username" className="text-sm font-medium">Username</label>
            <Input id="username" name="username" autoComplete="username" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9_]{3,30}" aria-describedby={setup ? "username-help" : undefined} />
            {setup && <p id="username-help" className="text-sm text-neutral-600">3–30 letters, numbers, or underscores.</p>}</div>
          <div className="space-y-2"><label htmlFor="password" className="text-sm font-medium">Password</label>
            <Input id="password" name="password" type="password" autoComplete={setup ? "new-password" : "current-password"} required minLength={setup ? 12 : 1} maxLength={128} />
            {setup && <p className="text-sm text-neutral-600">At least 12 characters. A password manager can create and save one for you.</p>}</div>
          {setup && <div className="space-y-2"><label htmlFor="confirm" className="text-sm font-medium">Confirm password</label><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></div>}
          {setup && <p className="text-sm text-neutral-600">Already completed setup? <Link href="/login" className="underline">Sign in</Link>.</p>}
          {error && <p role="alert" className="text-sm text-red-700 text-pretty">{error}</p>}
          <Button className="w-full" type="submit" disabled={busy || !ready}>{busy ? "One moment…" : setup ? "Create my account" : "Sign in"}</Button>
          <p className="text-sm text-neutral-600 text-pretty">{setup ? "This invitation works once. Your email password is never needed here." : "Private access only. Connecting a mailbox is a separate step."}</p>
        </form>}
    </section>
  </main>;
}
