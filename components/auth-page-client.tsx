"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AuthUser, UserRole } from "@/lib/persistence";

type AuthMode = "login" | "signup";

export default function AuthPageClient({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>("student");
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    password: "",
    inviteCode: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function chooseRole(nextRole: UserRole) {
    setRole(nextRole);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? {
          displayName: form.displayName,
          email: form.email,
          password: form.password,
          role,
          inviteCode: form.inviteCode || undefined
        } : {
          email: form.email,
          username: form.email,
          password: form.password
        })
      });
      const data = await response.json().catch(() => null) as { user?: AuthUser; error?: string } | null;
      if (!response.ok || !data?.user) throw new Error(data?.error || "Authentication failed.");
      router.push(`/${data.user.role}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "login" ? "Log in to AuthorCheck" : "Create an AuthorCheck workspace";
  const subtitle = mode === "login"
    ? "Use your existing student or professor credentials."
    : "Create a professor workspace or join a class with a student invite.";

  return (
    <main className="auth-page">
      <header className="marketing-header">
        <Link className="brand-mark" href="/">AuthorCheck</Link>
        <nav className="product-nav" aria-label="Auth navigation">
          <Link href="/student">Student</Link>
          <Link href="/professor">Professor</Link>
          <Link href={mode === "login" ? "/signup" : "/login"}>
            {mode === "login" ? "Sign up" : "Log in"}
          </Link>
        </nav>
      </header>

      <section className="auth-shell portal-auth-shell">
        <div className="auth-copy">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>

        <form className="auth-card" onSubmit={submit}>
          <div className="auth-card-heading">
            <span className="auth-card-icon" aria-hidden="true">{role === "student" ? "S" : "P"}</span>
            <div>
              <h2>{role === "student" ? "Student access" : "Professor access"}</h2>
              <p>Sessions use signed, HTTP-only cookies.</p>
            </div>
          </div>
          <div className="segmented-control" aria-label="Choose role">
            <button className={role === "student" ? "active" : ""} onClick={() => chooseRole("student")} type="button">
              Student
            </button>
            <button className={role === "professor" ? "active" : ""} onClick={() => chooseRole("professor")} type="button">
              Professor
            </button>
          </div>

          {mode === "signup" ? (
            <>
              <label htmlFor="name">Name</label>
              <input
                id="name"
                autoComplete="name"
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder={role === "student" ? "Student name" : "Professor name"}
              />
              <label htmlFor="email">Email</label>
              <input
                id="email"
                autoComplete="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder={role === "student" ? "student@example.edu" : "professor@example.edu"}
              />
              {role === "student" ? (
                <>
                  <label htmlFor="invite-code">Invite code</label>
                  <input
                    id="invite-code"
                    autoComplete="off"
                    value={form.inviteCode}
                    onChange={(event) => setForm((current) => ({ ...current, inviteCode: event.target.value }))}
                    placeholder="Required when your school enables invites"
                  />
                </>
              ) : null}
            </>
          ) : (
            <>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </>
          )}

          <label htmlFor="password">Password</label>
          <input
            id="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            type="password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
          />

          <button className="primary" disabled={loading} type="submit">
            {loading ? "Working..." : mode === "login" ? "Log in" : "Create workspace"}
          </button>
          {error ? <p className="sync-error">{error}</p> : null}
          <p className="note">Passwords must be at least 12 characters and include letters and numbers.</p>
        </form>
      </section>
    </main>
  );
}
