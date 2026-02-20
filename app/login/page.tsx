"use client";
import { useState, FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
      const [error, setError] = useState("");
        const [loading, setLoading] = useState(false);

          async function handleLogin(e: FormEvent) {
              e.preventDefault();
                  setLoading(true);
                      setError("");
                          const supabase = createClient();
                              const res = await supabase.auth.signInWithPassword({ email, password });
                                  if (res.error) {
                                        setError(res.error.message);
                                              setLoading(false);
                                                    return;
                                                        }
                                                            window.location.href = "/";
                                                              }

                                                                const boxStyle = { boxSizing: "border-box" as const };
                                                                  const inputBase = { width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid #334155", background: "#0F172A", color: "#F1F5F9", fontSize: "14px", ...boxStyle };

                                                                    return (
                                                                        <div style={{ minHeight: "100vh", background: "#0B1120", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "DM Sans, system-ui, sans-serif" }}>
                                                                              <div style={{ background: "#1E293B", borderRadius: "12px", padding: "40px", width: "100%", maxWidth: "400px" }}>
                                                                                      <h1 style={{ color: "#F1F5F9", fontSize: "24px", fontWeight: 700, marginBottom: "8px", textAlign: "center" }}>FINNY Commission Dashboard</h1>
                                                                                              <p style={{ color: "#64748B", fontSize: "14px", textAlign: "center", marginBottom: "32px" }}>Sign in with your Finny account</p>
                                                                                                      <form onSubmit={handleLogin}>
                                                                                                                <div style={{ marginBottom: "16px" }}>
                                                                                                                            <label style={{ display: "block", color: "#94A3B8", fontSize: "13px", marginBottom: "6px" }}>Email</label>
                                                                                                                                        <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="you@finny.com" required style={inputBase} />
                                                                                                                                                  </div>
                                                                                                                                                            <div style={{ marginBottom: "24px" }}>
                                                                                                                                                                        <label style={{ display: "block", color: "#94A3B8", fontSize: "13px", marginBottom: "6px" }}>Password</label>
                                                                                                                                                                                    <input type="password" value={password} onChange={(ev) => setPassword(ev.target.value)} placeholder="Your password" required style={inputBase} />
                                                                                                                                                                                              </div>
                                                                                                                                                                                                        {error ? <p style={{ color: "#F87171", fontSize: "13px", marginBottom: "16px", textAlign: "center" }}>{error}</p> : null}
                                                                                                                                                                                                                  <button type="submit" disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: "8px", border: "none", background: loading ? "#334155" : "#3B82F6", color: "#FFF", fontSize: "14px", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
                                                                                                                                                                                                                              {loading ? "Signing in..." : "Sign In"}
                                                                                                                                                                                                                                        </button>
                                                                                                                                                                                                                                                </form>
                                                                                                                                                                                                                                                      </div>
                                                                                                                                                                                                                                                          </div>
                                                                                                                                                                                                                                                            );
                                                                                                                                                                                                                                                            }
                                                                                                                                                                                                                                                            