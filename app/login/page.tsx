"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGoogleSignIn() {
    setLoading(true);
    setError("");
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch {
      setError("Failed to sign in. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAFBFD", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" />
      <div style={{ background: "#FFFFFF", borderRadius: "16px", padding: "48px 40px", width: "100%", maxWidth: "400px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.06)" }}>
        {/* FINNY Logo */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <img src="/logo.png" alt="FINNY" style={{ width: 64, height: 64, borderRadius: 12 }} />
        </div>
        
        <h1 style={{ color: "#1B1B1B", fontSize: "22px", fontWeight: 600, marginBottom: "8px", textAlign: "center", letterSpacing: "-0.02em" }}>Revenue Command Center</h1>
        <p style={{ color: "#6E6E80", fontSize: "14px", textAlign: "center", marginBottom: "32px" }}>Sign in with your Finny Google account</p>
        
        {error && (
          <p style={{ color: "#EF4444", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>{error}</p>
        )}
        
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            borderRadius: "10px",
            border: "1px solid rgba(0,0,0,0.1)",
            background: loading ? "#F5F6FA" : "#FFFFFF",
            color: loading ? "#9A9AAA" : "#1B1B1B",
            fontSize: "15px",
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            transition: "all 0.15s ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>
        
        <p style={{ color: "#9A9AAA", fontSize: "12px", textAlign: "center", marginTop: "24px" }}>
          Only @finny.com accounts are allowed
        </p>
      </div>
    </div>
  );
}
