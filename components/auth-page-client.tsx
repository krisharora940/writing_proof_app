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
  const [verificationCode, setVerificationCode] = useState("");
  const [signupStep, setSignupStep] = useState<"details" | "verify">("details");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function chooseRole(nextRole: UserRole) {
    setRole(nextRole);
    setError("");
    setNotice("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const path = mode === "signup" && signupStep === "verify"
        ? "/api/auth/signup/verify"
        : mode === "signup"
          ? "/api/auth/signup"
          : "/api/auth/login";
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? {
          ...(signupStep === "verify" ? {
            email: form.email,
            code: verificationCode
          } : {
            displayName: form.displayName,
            email: form.email,
            password: form.password,
            role,
            inviteCode: form.inviteCode || undefined
          })
        } : {
          email: form.email,
          username: form.email,
          password: form.password
        })
      });
      const data = await response.json().catch(() => null) as {
        user?: AuthUser;
        error?: string;
        delivery?: "email" | "development";
        expiresInMinutes?: number;
        code?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || "Authentication failed.");

      if (mode === "signup" && signupStep === "details") {
        setSignupStep("verify");
        setNotice(
          data?.delivery === "development" && data.code
            ? `Development code: ${data.code}`
            : `A verification code was sent to ${form.email}. It expires in ${data?.expiresInMinutes || 10} minutes.`
        );
        return;
      }

      if (!data?.user) throw new Error("Authentication failed.");
      router.push(`/${data.user.role}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/auth/signup/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email })
      });
      const data = await response.json().catch(() => null) as {
        error?: string;
        delivery?: "email" | "development";
        expiresInMinutes?: number;
        code?: string;
      } | null;
      if (!response.ok) throw new Error(data?.error || "Unable to resend verification code.");
      setNotice(
        data?.delivery === "development" && data.code
          ? `Development code: ${data.code}`
          : `A new verification code was sent to ${form.email}. It expires in ${data?.expiresInMinutes || 10} minutes.`
      );
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Unable to resend verification code.");
    } finally {
      setLoading(false);
    }
  }

  const title = mode === "login" ? "Log in to DraftProof" : "Create a DraftProof workspace";
  const subtitle = mode === "login"
    ? "Use your existing student or professor credentials."
    : "Create a professor workspace or join a class with a student invite.";

  return (
    <main className="auth-page">
      <header className="marketing-header">
        <Link className="brand-mark" href="/">DraftProof</Link>
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

          {mode === "signup" && signupStep === "verify" ? (
            <>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                autoComplete="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
              <label htmlFor="verification-code">Verification code</label>
              <input
                id="verification-code"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
              />
            </>
          ) : mode === "signup" ? (
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
          {mode === "signup" && signupStep === "verify" ? (
            <input
              id="password"
              autoComplete="new-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              disabled
            />
          ) : (
            <input
              id="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              type="password"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            />
          )}

          <button className="primary" disabled={loading} type="submit">
            {loading ? "Working..." : mode === "login" ? "Log in" : signupStep === "verify" ? "Verify email" : "Send verification code"}
          </button>
          {mode === "signup" && signupStep === "verify" ? (
            <button
              type="button"
              onClick={() => {
                setSignupStep("details");
                setVerificationCode("");
                setError("");
                setNotice("");
              }}
            >
              Edit details
            </button>
          ) : null}
          {mode === "signup" && signupStep === "verify" ? (
            <button type="button" onClick={() => void resendCode()} disabled={loading || !form.email}>
              Resend code
            </button>
          ) : null}
          {error ? <p className="sync-error">{error}</p> : null}
          {notice ? <p className="note">{notice}</p> : null}
          <p className="note">Passwords must be at least 8 characters and include 1 uppercase letter, 1 lowercase letter, and 1 number.</p>
        </form>
      </section>
    </main>
  );
}
