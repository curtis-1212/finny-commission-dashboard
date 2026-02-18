"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const B = {
  primary: "#6366F1",
  primaryLight: "#818CF8",
  accent: "#10B981",
  bg: "#FAFBFD",
  card: "#FFFFFF",
  text: "#1E293B",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  danger: "#EF4444",
};

const F = {
  display: "'Instrument Sans', 'DM Sans', system-ui, sans-serif",
  body: "'DM Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError("Invalid email or password");
      setLoading(false);
      return;
    }

    // Fetch profile to determine redirect
    const res = await fetch("/api/auth/profile");
    if (!res.ok) {
      setError("Account not configured. Contact your admin.");
      setLoading(false);
      return;
    }
    const profile = await res.json();

    if (redirect) {
      router.push(redirect);
    } else if (profile.role === "exec") {
      router.push("/");
    } else {
      router.push(`/dashboard/${profile.rep_id}`);
    }
  }

  return (
    <div style={{
      width: "100%",
      maxWidth: 380,
      background: B.card,
      borderRadius: 20,
      border: `1px solid ${B.border}`,
      boxShadow: "0 1px 3px rgba(0,0,0,.04), 0 8px 32px rgba(0,0,0,.06)",
      padding: "40px 32px 36px",
    }}>
      {/* Logo + Title */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <img
          src="/logo.png"
          alt="FINNY"
          style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 20 }}
        />
        <h1 style={{
          fontSize: 22,
          fontWeight: 700,
          color: B.text,
          fontFamily: F.display,
          letterSpacing: "-0.03em",
          margin: 0,
        }}>
          Commission Dashboard
        </h1>
        <p style={{
          fontSize: 14,
          color: B.muted,
          fontFamily: F.body,
          marginTop: 8,
          lineHeight: 1.5,
        }}>
          Sign in to access your dashboard
        </p>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: "10px 14px",
          marginBottom: 16,
          borderRadius: 10,
          background: "#FEF2F2",
          border: "1px solid #FECACA",
          color: B.danger,
          fontSize: 13,
          fontFamily: F.body,
          fontWeight: 500,
        }}>
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 16 }}>
          <label style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: B.muted,
            fontFamily: F.body,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${B.border}`,
              background: B.card,
              color: B.text,
              fontSize: 15,
              fontFamily: F.body,
              outline: "none",
              transition: "border-color 0.2s",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = B.primary)}
            onBlur={(e) => (e.target.style.borderColor = B.border)}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{
            display: "block",
            fontSize: 12,
            fontWeight: 600,
            color: B.muted,
            fontFamily: F.body,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 10,
              border: `1px solid ${B.border}`,
              background: B.card,
              color: B.text,
              fontSize: 15,
              fontFamily: F.body,
              outline: "none",
              transition: "border-color 0.2s",
              boxSizing: "border-box",
            }}
            onFocus={(e) => (e.target.style.borderColor = B.primary)}
            onBlur={(e) => (e.target.style.borderColor = B.border)}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            padding: "13px 0",
            borderRadius: 10,
            border: "none",
            background: loading ? B.faint : B.primary,
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            fontFamily: F.body,
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.2s, transform 0.1s",
            letterSpacing: "-0.01em",
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      {/* Footer */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        marginTop: 32,
      }}>
        <img src="/logo.png" alt="" style={{ width: 12, height: 12, borderRadius: 3, opacity: 0.3 }} />
        <span style={{ fontSize: 11, color: B.faint, fontFamily: F.body }}>Powered by FINNY</span>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: B.bg,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>
      <Suspense fallback={
        <div style={{ textAlign: "center", color: B.faint, fontFamily: F.body, fontSize: 13 }}>
          Loading...
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
