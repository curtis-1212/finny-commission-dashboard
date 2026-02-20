"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const supabase = createClient();
        const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
        });

        if (error) {
                setError(error.message);
                setLoading(false);
                return;
        }

        // Redirect to dashboard on successful login
        window.location.href = "/";
  };

  return (
        <div
                style={{
                          minHeight: "100vh",
                          background: "#0B1120",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontFamily: "DM Sans, system-ui, sans-serif",
                }}
              >
              <div
                        style={{
                                    background: "#1E293B",
                                    borderRadius: "12px",
                                    padding: "40px",
                                    width: "100%",
                                    maxWidth: "400px",
                                    boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
                        }}
                      >
                      <h1
                                  style={{
                                                color: "#F1F5F9",
                                                fontSize: "24px",
                                                fontWeight: 700,
                                                marginBottom: "8px",
                                                textAlign: "center",
                                                fontFamily: "Outfit, system-ui, sans-serif",
                                  }}
                                >
                                FINNY Commission Dashboard
                      </h1>h1>
                      <p
                                  style={{
                                                color: "#64748B",
                                                fontSize: "14px",
                                                textAlign: "center",
                                                marginBottom: "32px",
                                  }}
                                >
                                Sign in with your Finny account
                      </p>p>
              
                      <form onSubmit={handleLogin}>
                                <div style={{ marginBottom: "16px" }}>
                                            <label
                                                            style={{
                                                                              display: "block",
                                                                              color: "#94A3B8",
                                                                              fontSize: "13px",
                                                                              marginBottom: "6px",
                                                                              fontWeight: 500,
                                                            }}
                                                          >
                                                          Email
                                            </label>label>
                                            <input
                                                            type="email"
                                                            value={email}
                                                            onChange={(e) => setEmail(e.target.value)}
                                                            placeholder="you@finny.com"
                                                            required
                                                            style={{
                                                                              width: "100%",
                                                                              padding: "10px 14px",
                                                                              borderRadius: "8px",
                                                                              border: "1px solid #334155",
                                                                              background: "#0F172A",
                                                                              color: "#F1F5F9",
                                                                              fontSize: "14px",
                                                                              outline: "none",
                                                                              boxSizing: "border-box",
                                                            }}
                                                          />
                                </div>div>
                      
                                <div style={{ marginBottom: "24px" }}>
                                            <label
                                                            style={{
                                                                              display: "block",
                                                                              color: "#94A3B8",
                                                                              fontSize: "13px",
                                                                              marginBottom: "6px",
                                                                              fontWeight: 500,
                                                            }}
                                                          >
                                                          Password
                                            </label>label>
                                            <input
                                                            type="password"
                                                            value={password}
                                                            onChange={(e) => setPassword(e.target.value)}
                                                            placeholder="Your password"
                                                            required
                                                            style={{
                                                                              width: "100%",
                                                                              padding: "10px 14px",
                                                                              borderRadius: "8px",
                                                                              border: "1px solid #334155",
                                                                              background: "#0F172A",
                                                                              color: "#F1F5F9",
                                                                              fontSize: "14px",
                                                                              outline: "none",
                                                                              boxSizing: "border-box",
                                                            }}
                                                          />
                                </div>div>
                      
                        {error && (
                                    <p
                                                    style={{
                                                                      color: "#F87171",
                                                                      fontSize: "13px",
                                                                      marginBottom: "16px",
                                                                      textAlign: "center",
                                                    }}
                                                  >
                                      {error}
                                    </p>p>
                                )}
                      
                                <button
                                              type="submit"
                                              disabled={loading}
                                              style={{
                                                              width: "100%",
                                                              padding: "12px",
                                                              borderRadius: "8px",
                                                              border: "none",
                                                              background: loading ? "#334155" : "#3B82F6",
                                                              color: "#FFFFFF",
                                                              fontSize: "14px",
                                                              fontWeight: 600,
                                                              cursor: loading ? "not-allowed" : "pointer",
                                                              transition: "background 0.2s",
                                              }}
                                            >
                                  {loading ? "Signing in..." : "Sign In"}
                                </button>button>
                      </form>form>
              </div>div>
        </div>div>
      );
}</div>
