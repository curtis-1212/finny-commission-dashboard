"use client";
import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface AEResult {
  id: string; name: string; role: string; initials: string; color: string; type: "ae";
  monthlyQuota: number; annualQuota: number;
  grossARR?: number; churnARR?: number; netARR?: number;
  dealCount?: number; churnCount?: number; excludedCount?: number;
  demoCount?: number;
    cwRate?: number | null;
  attainment?: number; commission?: number;
  tierBreakdown?: { label: string; amount: number }[];
}
interface BDRResult {
  id: string; name: string; role: string; initials: string; color: string; type: "bdr";
  monthlyQuota: number;
  totalMeetings?: number; netMeetings?: number;
  attainment?: number; commission?: number;
}
type RepResult = AEResult | BDRResult;
interface MonthOption { value: string; label: string }

// ─── Brand: Institutional Exec ──────────────────────────────────────────────
const C = {
  bg: "#080E1C",
  surface: "#0C1324",
  card: "#101829",
  cardHover: "#141D30",
  border: "rgba(255,255,255,0.05)",
  borderMed: "rgba(255,255,255,0.08)",
  primary: "#6366F1",
  primaryMuted: "#4F46E5",
  accent: "#10B981",
  accentMuted: "#059669",
  warn: "#F59E0B",
  warnMuted: "#D97706",
  danger: "#EF4444",
  dangerMuted: "#DC2626",
  text: "#E2E8F0",
  textSec: "#94A3B8",
  textDim: "#64748B",
  textGhost: "#475569",
};
const F = {
  d: "'Instrument Sans', 'DM Sans', system-ui, sans-serif",
  b: "'DM Sans', system-ui, sans-serif",
  m: "'JetBrains Mono', 'SF Mono', monospace",
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtK = (n: number) => {
  if (Math.abs(n) >= 1000000) return "$" + (n / 1000000).toFixed(1) + "M";
  if (Math.abs(n) >= 1000) return "$" + Math.round(n / 1000) + "k";
  return "$" + Math.round(n);
};
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";
const fmtPct0 = (n: number) => (n * 100).toFixed(0) + "%";

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─── Attainment color logic ─────────────────────────────────────────────────
function attColor(att: number): string {
  if (att >= 1.2) return C.accent;
  if (att >= 1.0) return C.accent;
  if (att >= 0.8) return C.text;
  if (att >= 0.6) return C.warn;
  return C.danger;
}
function attBg(att: number): string {
  if (att >= 1.2) return `${C.accent}15`;
  if (att >= 1.0) return `${C.accent}10`;
  if (att >= 0.8) return "transparent";
  if (att >= 0.6) return `${C.warn}10`;
  return `${C.danger}10`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KPI TILE
// ═══════════════════════════════════════════════════════════════════════════════
function KPI({ label, value, sub, accent, large }: {
  label: string; value: string; sub?: string; accent?: boolean; large?: boolean;
}) {
  return (
    <div style={{
      padding: large ? "20px 0" : "16px 0",
      borderRight: `1px solid ${C.border}`,
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 500, color: C.textDim,
        fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
        marginBottom: large ? 8 : 6,
      }}>{label}</div>
      <div style={{
        fontSize: large ? 28 : 20, fontWeight: 700,
        fontFamily: F.m, letterSpacing: "-0.03em",
        color: accent ? C.accent : C.text,
        lineHeight: 1,
      }}>{value}</div>
      {sub && (
        <div style={{
          fontSize: 11, color: C.textDim, fontFamily: F.b,
          marginTop: 4,
        }}>{sub}</div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAN VS ACTUAL BAR
// ═══════════════════════════════════════════════════════════════════════════════
function PlanBar({ name, initials, actual, quota, att, commission, churn, deals, type, demoCount, excludedCount, cwRate }: {
  name: string; initials: string; actual: number; quota: number;
  att: number; commission: number; churn: number; deals: number; type: string;
  demoCount?: number; excludedCount?: number; cwRate?: number | null;
}) {
  const pct = Math.min(att, 1.5);
  const barColor = att >= 1.0
    ? `linear-gradient(90deg, ${C.primary}, ${C.accent})`
    : att >= 0.8
      ? `linear-gradient(90deg, ${C.primary}, ${C.primaryMuted})`
      : att >= 0.6
        ? `linear-gradient(90deg, ${C.warn}, ${C.warnMuted})`
        : `linear-gradient(90deg, ${C.danger}, ${C.dangerMuted})`;

  const isBDR = type === "bdr";

  return (
    <div style={{
      padding: "16px 20px",
      borderBottom: `1px solid ${C.border}`,
      transition: "background 0.15s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.cardHover)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {/* Row 1: Name + metrics */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        {/* Initials badge */}
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${C.primary}15`, border: `1px solid ${C.primary}25`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 700, color: C.primary, fontFamily: F.b,
          flexShrink: 0,
        }}>{initials}</div>

        {/* Name */}
        <div style={{ flex: "0 0 120px", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, fontFamily: F.d, letterSpacing: "-0.01em", whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        </div>

        {/* Metrics row */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 0 }}>
          {/* Net ARR / Meetings */}
          <div style={{ flex: 1, textAlign: "right" as const }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{isBDR ? "Mtgs" : "Net ARR"}</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: F.m, color: C.text, letterSpacing: "-0.02em" }}>
              {isBDR ? actual : fmtK(actual)}
            </div>
          </div>

          {/* Attainment */}
          <div style={{ flex: 1, textAlign: "right" as const }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Attain.</div>
            <div style={{
              fontSize: 15, fontWeight: 700, fontFamily: F.m,
              color: attColor(att), letterSpacing: "-0.02em",
            }}>
              {fmtPct0(att)}
            </div>
          </div>

          {/* Deals */}
          <div style={{ flex: 0.7, textAlign: "right" as const }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{isBDR ? "Target" : "Deals"}</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: F.m, color: C.textSec }}>{isBDR ? quota : deals}</div>
          </div>


          {/* CW Rate */}
          {!isBDR && (
            <div style={{ flex: 0.7, textAlign: "right" as const }}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", marginBottom: 2 }}>CW RATE</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: F.m, color: C.textSec }}>
                {cwRate != null ? fmtPct0(cwRate) : "—"}
              </div>
            </div>
          )}

          {/* Churns # */}
          {!isBDR && (
            <div style={{ flex: 0.5, textAlign: "right" as const }}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", marginBottom: 2 }}>CHURNS</div>
              <div style={{
                fontSize: 15, fontWeight: 600, fontFamily: F.m,
                color: excludedCount && excludedCount > 0 ? C.danger : C.textGhost,
              }}>
                {excludedCount && excludedCount > 0 ? excludedCount : "—"}
              </div>
            </div>
          )}

          {/* Churn */}
          {!isBDR && (
            <div style={{ flex: 0.8, textAlign: "right" as const }}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Churn</div>
              <div style={{
                fontSize: 15, fontWeight: 600, fontFamily: F.m,
                color: churn > 0 ? C.danger : C.textGhost,
              }}>
                {churn > 0 ? `-${fmtK(churn)}` : "—"}
              </div>
            </div>
          )}

          {/* Commission */}
          <div style={{ flex: 1, textAlign: "right" as const }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Comm.</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: F.m, color: C.accent, letterSpacing: "-0.02em" }}>
              {fmtK(commission)}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Plan vs Actual bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 44 }}>
        <div style={{
          flex: 1, height: 6, background: "rgba(255,255,255,0.04)",
          borderRadius: 100, position: "relative", overflow: "visible",
        }}>
          {/* Quota marker */}
          <div style={{
            position: "absolute",
            left: `${Math.min(100 / Math.max(pct, 1), 100)}%`,
            top: -2, width: 1, height: 10,
            background: "rgba(255,255,255,0.2)",
            zIndex: 2,
          }} />
          {/* Fill */}
          <div style={{
            height: "100%", borderRadius: 100,
            width: `${Math.min(pct * 100 / Math.max(pct, 1), 100)}%`,
            background: barColor,
            transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
            minWidth: att > 0 ? 6 : 0,
          }} />
        </div>
        {/* Quota label */}
        <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.m, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
          {isBDR ? `${quota} mtgs` : fmtK(quota)}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXEC DASHBOARD — REVENUE COMMAND CENTER
// ═══════════════════════════════════════════════════════════════════════════════
export default function ExecDashboard() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState("");
  const [monthLabel, setMonthLabel] = useState("");
  const [warning, setWarning] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue());
  const [availableMonths, setAvailableMonths] = useState<MonthOption[]>([]);
  const [isLive, setIsLive] = useState(false);

  const [aeResults, setAeResults] = useState<AEResult[]>([]);
  const [bdrResult, setBdrResult] = useState<BDRResult | null>(null);

  const [token, setToken] = useState("");
  useEffect(() => { setToken(new URLSearchParams(window.location.search).get("token") || ""); }, []);

  const fetchLive = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/commissions?live=true&month=${selectedMonth}&token=${token}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setAeResults(data.ae || []);
      setBdrResult(data.bdr || null);
      setFetchedAt(data.meta?.fetchedAt || "");
      setMonthLabel(data.meta?.monthLabel || "");
      setWarning(data.meta?.warning || "");
      if (data.availableMonths) setAvailableMonths(data.availableMonths);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [token, selectedMonth]);

  useEffect(() => { if (isLive) fetchLive(); }, [isLive, fetchLive]);
  useEffect(() => { if (!isLive) return; const i = setInterval(fetchLive, 60000); return () => clearInterval(i); }, [isLive, fetchLive]);

  // ─── Computed KPIs ──────────────────────────────────────────────────────
  const totalNetARR = aeResults.reduce((s, r) => s + (r.netARR || 0), 0);
  const totalGrossARR = aeResults.reduce((s, r) => s + (r.grossARR || 0), 0);
  const totalChurnARR = aeResults.reduce((s, r) => s + (r.churnARR || 0), 0);
  const totalQuota = aeResults.reduce((s, r) => s + r.monthlyQuota, 0);
  const totalDeals = aeResults.reduce((s, r) => s + (r.dealCount || 0), 0);
  const teamAttainment = totalQuota > 0 ? totalNetARR / totalQuota : 0;
  const totalComm = aeResults.reduce((s, r) => s + (r.commission || 0), 0) + (bdrResult?.commission || 0);
  const churnRate = totalGrossARR > 0 ? totalChurnARR / totalGrossARR : 0;
  const commAsPercent = totalNetARR > 0 ? totalComm / totalNetARR : 0;

  // Sort AEs by attainment descending
  const sortedAEs = [...aeResults].sort((a, b) => (b.attainment || 0) - (a.attainment || 0));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: F.b }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

      {/* ─── HEADER ──────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: `1px solid ${C.border}`,
        padding: "0 32px",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          {/* Top row */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "18px 0 14px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <img src="/logo.png" alt="FINNY" style={{ width: 28, height: 28, borderRadius: 6 }} />
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 600, color: C.textDim,
                  fontFamily: F.b, letterSpacing: "0.1em", textTransform: "uppercase" as const,
                }}>Revenue Command Center</div>
                <div style={{
                  fontSize: 16, fontWeight: 700, color: C.text,
                  fontFamily: F.d, letterSpacing: "-0.02em", marginTop: 1,
                }}>
                  {monthLabel || "Performance Overview"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isLive && availableMonths.length > 0 && (
                <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                  style={{
                    padding: "6px 10px", borderRadius: 6,
                    border: `1px solid ${C.borderMed}`, background: C.card,
                    color: C.textSec, fontSize: 11, fontFamily: F.b, fontWeight: 500,
                    cursor: "pointer", outline: "none",
                  }}>
                  {availableMonths.map((m) => <option key={m.value} value={m.value} style={{ background: C.card, color: C.text }}>{m.label}</option>)}
                </select>
              )}

              {fetchedAt && isLive && (
                <div style={{ fontSize: 11, color: C.textGhost, fontFamily: F.b }}>
                  {new Date(fetchedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET
                </div>
              )}

              <button onClick={() => setIsLive(!isLive)} style={{
                padding: "6px 14px", borderRadius: 6,
                border: isLive ? `1px solid ${C.accent}40` : `1px solid ${C.borderMed}`,
                background: isLive ? `${C.accent}12` : C.card,
                color: isLive ? C.accent : C.textDim,
                cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: F.b,
                transition: "all 0.2s", display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: isLive ? C.accent : C.textGhost,
                  display: "inline-block",
                }} />
                {loading ? "Loading…" : isLive ? "LIVE" : "CONNECT"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Warnings */}
      {(warning || error) && (
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px" }}>
          {warning && <div style={{ padding: "10px 14px", marginTop: 12, borderRadius: 6, background: `${C.warn}10`, border: `1px solid ${C.warn}20`, color: C.warn, fontSize: 12, fontFamily: F.b }}>⚠ {warning}</div>}
          {error && <div style={{ padding: "10px 14px", marginTop: 12, borderRadius: 6, background: `${C.danger}10`, border: `1px solid ${C.danger}20`, color: C.danger, fontSize: 12, fontFamily: F.b }}>Error: {error}</div>}
        </div>
      )}

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 32px" }}>

        {/* ─── KPI COCKPIT ──────────────────────────────────────────── */}
        {isLive && aeResults.length > 0 && (
          <div style={{
            display: "flex", gap: 0,
            padding: "0 20px",
            marginTop: 20,
            background: C.card,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
          }}>
            <KPI label="Net New ARR" value={fmt(totalNetARR)} large />
            <div style={{ padding: "0 20px" }}>
              <KPI label="% to Plan" value={fmtPct0(teamAttainment)}
                sub={teamAttainment >= 1 ? "On track" : `${fmtK(Math.max(0, totalQuota - totalNetARR))} remaining`}
                accent={teamAttainment >= 1} large />
            </div>
            <div style={{ padding: "0 20px" }}>
              <KPI label="Total Commission" value={fmt(totalComm)} accent large />
            </div>
            <div style={{ padding: "0 20px" }}>
              <KPI label="Gross Churn" value={fmtPct(churnRate)}
                sub={totalChurnARR > 0 ? fmtK(totalChurnARR) : "Clean"} large />
            </div>
            <div style={{ padding: "0 20px", borderRight: "none" }}>
              <KPI label="Deals Closed" value={String(totalDeals)} large />
            </div>
          </div>
        )}

        {/* ─── "Connect to see data" state ──────────────────────────── */}
        {!isLive && (
          <div style={{
            display: "flex", flexDirection: "column" as const, alignItems: "center",
            justifyContent: "center", padding: "80px 0",
            gap: 16,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: `${C.primary}10`, border: `1px solid ${C.primary}20`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20,
            }}>📡</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, fontFamily: F.d }}>
              Connect to Attio
            </div>
            <div style={{ fontSize: 13, color: C.textDim, fontFamily: F.b, textAlign: "center", maxWidth: 280, lineHeight: 1.5 }}>
              Click CONNECT above to pull live commission data from your CRM.
            </div>
          </div>
        )}

        {/* ─── LEVERAGE INDICATORS ──────────────────────────────────── */}
        {isLive && aeResults.length > 0 && (
          <div style={{
            display: "flex", gap: 10, marginTop: 12,
          }}>
            {[
              {
                label: "Revenue / AE",
                value: fmtK(aeResults.length > 0 ? totalNetARR / aeResults.length : 0),
                desc: "avg net ARR per rep",
              },
              {
                label: "Comm. as % ARR",
                value: fmtPct(commAsPercent),
                desc: "blended commission rate",
              },
              {
                label: "Accelerator Exposure",
                value: aeResults.filter(r => (r.attainment || 0) >= 1.0).length + " / " + aeResults.length,
                desc: "reps in accelerator tiers",
              },
            ].map((item, i) => (
              <div key={i} style={{
                flex: 1, padding: "14px 16px",
                background: C.card, borderRadius: 10,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 6 }}>{item.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: F.m, color: C.text, letterSpacing: "-0.02em" }}>{item.value}</div>
                <div style={{ fontSize: 11, color: C.textGhost, fontFamily: F.b, marginTop: 2 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* ─── TEAM PLAN VS ACTUAL ──────────────────────────────────── */}
        {isLive && aeResults.length > 0 && (
          <div style={{
            marginTop: 12,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            overflow: "hidden",
            background: C.card,
          }}>
            {/* Header row */}
            <div style={{
              display: "flex", alignItems: "center",
              padding: "14px 20px",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.textDim,
                fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                Rep Performance
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>
                Ranked by attainment
              </div>
            </div>

            {/* AE rows */}
            {sortedAEs.map((ae) => (
              <PlanBar
                key={ae.id}
                name={ae.name}
                initials={ae.initials}
                actual={ae.netARR || 0}
                quota={ae.monthlyQuota}
                att={ae.attainment || 0}
                commission={ae.commission || 0}
                churn={ae.churnARR || 0}
                deals={ae.dealCount || 0}
                demoCount={ae.demoCount || 0}
                                    cwRate={ae.cwRate}
                excludedCount={ae.churnCount ?? ae.excludedCount ?? 0}
                type="ae"
              />
            ))}

            {/* BDR row */}
            {bdrResult && (
              <PlanBar
                name={bdrResult.name}
                initials={bdrResult.initials}
                actual={bdrResult.netMeetings || 0}
                quota={bdrResult.monthlyQuota}
                att={bdrResult.attainment || 0}
                commission={bdrResult.commission || 0}
                churn={0}
                deals={0}
                type="bdr"
              />
            )}

            {/* Team total row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              background: "rgba(255,255,255,0.02)",
              borderTop: `1px solid ${C.borderMed}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(255,255,255,0.04)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: C.textDim, fontFamily: F.b,
                }}>Σ</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: F.d }}>Team Total</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Net ARR</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F.m, color: C.text }}>{fmt(totalNetARR)}</div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>% to Plan</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F.m, color: attColor(teamAttainment) }}>{fmtPct0(teamAttainment)}</div>
                </div>
                <div style={{ textAlign: "right" as const }}>
                  <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Commission</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F.m, color: C.accent }}>{fmt(totalComm)}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── PLAN VS ACTUAL VISUAL ────────────────────────────────── */}
        {isLive && aeResults.length > 0 && (
          <div style={{
            marginTop: 12,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            background: C.card,
            padding: "18px 20px",
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: C.textDim,
              fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
              marginBottom: 16,
            }}>
              Plan vs Actual — Team
            </div>

            {/* Quota bar */}
            <div style={{ position: "relative", height: 40, background: "rgba(255,255,255,0.03)", borderRadius: 8, overflow: "hidden" }}>
              {/* Quota fill (background) */}
              <div style={{
                position: "absolute", top: 0, left: 0, height: "100%",
                width: "100%",
                background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 20%)`,
                borderRadius: 8,
              }} />
              {/* Actual fill */}
              <div style={{
                position: "absolute", top: 0, left: 0, height: "100%",
                width: `${Math.min(teamAttainment * 100, 150) / 1.5}%`,
                background: teamAttainment >= 1.0
                  ? `linear-gradient(90deg, ${C.primary}, ${C.accent})`
                  : `linear-gradient(90deg, ${C.primary}, ${C.primaryMuted})`,
                borderRadius: 8,
                transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
                display: "flex", alignItems: "center", justifyContent: "flex-end",
                paddingRight: 12,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, fontFamily: F.m, color: "#fff" }}>
                  {fmt(totalNetARR)}
                </span>
              </div>
              {/* Quota marker line */}
              <div style={{
                position: "absolute",
                left: `${100 / 1.5}%`,
                top: 0, width: 2, height: "100%",
                background: "rgba(255,255,255,0.25)",
                zIndex: 2,
              }} />
              {/* Quota label */}
              <div style={{
                position: "absolute",
                left: `${100 / 1.5}%`,
                top: -2,
                transform: "translateX(-100%)",
                fontSize: 10, color: C.textDim, fontFamily: F.m,
                paddingRight: 6,
                lineHeight: "40px",
              }}>
                {fmt(totalQuota)} quota
              </div>
            </div>

            {/* Legend */}
            <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 3, borderRadius: 2, background: C.primary }} />
                <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>Actual</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 10, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.25)" }} />
                <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>Quota</span>
              </div>
              {totalChurnARR > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 10, height: 3, borderRadius: 2, background: C.danger }} />
                  <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>Churn: {fmtK(totalChurnARR)}</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ─── Footer ────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 8, padding: "40px 0 48px",
      }}>
        <img src="/logo.png" alt="" style={{ width: 12, height: 12, borderRadius: 2, opacity: 0.15 }} />
        <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>Powered by FINNY</span>
      </div>
    </div>
  );
}

