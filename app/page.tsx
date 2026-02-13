"use client";
import { useState, useEffect, useCallback } from "react";

// ─── Types (only what the API returns — no salary/OTE/rates) ────────────────
interface AEResult {
  id: string; name: string; role: string; initials: string; color: string; type: "ae";
  monthlyQuota: number; annualQuota: number;
  grossARR?: number; churnARR?: number; netARR?: number;
  dealCount?: number; excludedCount?: number;
  attainment?: number; commission?: number;
  tierBreakdown?: { label: string; amount: number }[];
  tierLabels?: string[];
}
interface BDRResult {
  id: string; name: string; role: string; initials: string; color: string; type: "bdr";
  monthlyQuota: number;
  totalMeetings?: number; netMeetings?: number;
  attainment?: number; commission?: number;
}
type RepResult = AEResult | BDRResult;

interface ManualAE { grossDeals: number; churnARR: number; nonConverting: number; dealCount: number; excludedCount: number }
interface ManualBDR { totalMeetings: number; disqualified: number; existingCustomers: number; dealsCreated: number }

// ─── Helpers ────────────────────────────────────────────────────────────────
const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";
const SANS = "'DM Sans', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

// ─── ProgressRing ───────────────────────────────────────────────────────────
function ProgressRing({ pct, color, size = 88 }: { pct: number; color: string; size?: number }) {
  const stroke = 5, r = (size - stroke * 2) / 2, circ = 2 * Math.PI * r;
  const offset = circ - Math.min(pct, 1.5) * circ;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
    </svg>
  );
}

// ─── InputField ─────────────────────────────────────────────────────────────
function InputField({ label, value, onChange, prefix = "$", small = false }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; small?: boolean;
}) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 4, fontFamily: SANS }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px" }}>
        <span style={{ color: "#475569", fontSize: small ? 12 : 13, fontFamily: MONO, marginRight: 4 }}>{prefix}</span>
        <input type="number" value={value || ""} onChange={(e) => onChange(Number(e.target.value) || 0)}
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: "#CBD5E1", fontSize: small ? 13 : 14, fontFamily: MONO, width: "100%" }} />
      </div>
    </div>
  );
}

// ─── AECard ─────────────────────────────────────────────────────────────────
function AECard({ rep, manual, setManual, isLive }: {
  rep: AEResult; manual: ManualAE; setManual: (v: ManualAE) => void; isLive: boolean;
}) {
  // In manual mode, compute from inputs; in live mode, use API data
  const netARR = isLive ? (rep.netARR || 0) : manual.grossDeals - manual.churnARR - manual.nonConverting;
  const attainment = rep.monthlyQuota > 0 ? netARR / rep.monthlyQuota : 0;
  const commission = isLive ? (rep.commission || 0) : netARR * 0.09; // Simplified for manual
  const actualAttainment = isLive ? (rep.attainment || 0) : attainment;

  return (
    <div style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column" as const, gap: 24, position: "relative" as const, overflow: "hidden" }}>
      <div style={{ position: "absolute" as const, top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: rep.color, opacity: 0.05, filter: "blur(40px)" }} />
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${rep.color}22`, border: `1px solid ${rep.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: rep.color, fontFamily: SANS }}>{rep.initials}</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#E2E8F0", fontFamily: SANS }}>{rep.name}</div>
            <div style={{ fontSize: 12, color: "#64748B", fontFamily: SANS }}>{rep.role}</div>
          </div>
        </div>
        <div style={{ textAlign: "center" as const, position: "relative" as const }}>
          <ProgressRing pct={actualAttainment} color={rep.color} />
          <div style={{ position: "absolute" as const, top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 16, fontWeight: 700, fontFamily: MONO, color: "#E2E8F0" }}>
            {fmtPct(actualAttainment)}
          </div>
        </div>
      </div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)" }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Net ARR</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#CBD5E1", fontFamily: MONO }}>{fmt(netARR)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Monthly Quota</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#CBD5E1", fontFamily: MONO }}>{fmt(rep.monthlyQuota)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Commission</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#10B981", fontFamily: MONO }}>{fmt(isLive ? (rep.commission || 0) : commission)}</div>
        </div>
      </div>
      {/* Deal count */}
      {isLive && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)" }}>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Deals</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#CBD5E1", fontFamily: MONO }}>{rep.dealCount || 0}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Gross ARR</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#CBD5E1", fontFamily: MONO }}>{fmt(rep.grossARR || 0)}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Churn</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#EF4444", fontFamily: MONO }}>-{fmt(rep.churnARR || 0)}</div>
          </div>
        </div>
      )}
      {/* Manual inputs (only in manual mode) */}
      {!isLive && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <InputField label="Gross Closed Won" value={manual.grossDeals} onChange={(v) => setManual({ ...manual, grossDeals: v })} />
          <InputField label="Churn ARR" value={manual.churnARR} onChange={(v) => setManual({ ...manual, churnARR: v })} />
          <InputField label="Non-Converting" value={manual.nonConverting} onChange={(v) => setManual({ ...manual, nonConverting: v })} />
          <InputField label="Deal Count" value={manual.dealCount} onChange={(v) => setManual({ ...manual, dealCount: v })} prefix="#" />
        </div>
      )}
    </div>
  );
}

// ─── BDRCard ────────────────────────────────────────────────────────────────
function BDRCard({ rep, manual, setManual, isLive }: {
  rep: BDRResult; manual: ManualBDR; setManual: (v: ManualBDR) => void; isLive: boolean;
}) {
  const meetings = isLive ? (rep.netMeetings || 0) : Math.max(0, manual.totalMeetings - manual.disqualified - manual.existingCustomers);
  const attainment = isLive ? (rep.attainment || 0) : (rep.monthlyQuota > 0 ? meetings / rep.monthlyQuota : 0);
  const commission = isLive ? (rep.commission || 0) : meetings * 33;

  return (
    <div style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column" as const, gap: 24, position: "relative" as const, overflow: "hidden" }}>
      <div style={{ position: "absolute" as const, top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: rep.color, opacity: 0.05, filter: "blur(40px)" }} />
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${rep.color}22`, border: `1px solid ${rep.color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: rep.color, fontFamily: SANS }}>{rep.initials}</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: "#E2E8F0", fontFamily: SANS }}>{rep.name}</div>
            <div style={{ fontSize: 12, color: "#64748B", fontFamily: SANS }}>{rep.role}</div>
          </div>
        </div>
        <div style={{ textAlign: "center" as const, position: "relative" as const }}>
          <ProgressRing pct={attainment} color={rep.color} />
          <div style={{ position: "absolute" as const, top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 16, fontWeight: 700, fontFamily: MONO, color: "#E2E8F0" }}>
            {fmtPct(attainment)}
          </div>
        </div>
      </div>
      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)" }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Meetings</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#CBD5E1", fontFamily: MONO }}>{meetings}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Target</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#CBD5E1", fontFamily: MONO }}>{rep.monthlyQuota}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Commission</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#10B981", fontFamily: MONO }}>{fmt(commission)}</div>
        </div>
      </div>
      {/* Manual inputs */}
      {!isLive && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <InputField label="Total Meetings" value={manual.totalMeetings} onChange={(v) => setManual({ ...manual, totalMeetings: v })} prefix="#" />
          <InputField label="Disqualified" value={manual.disqualified} onChange={(v) => setManual({ ...manual, disqualified: v })} prefix="#" />
          <InputField label="Existing Customers" value={manual.existingCustomers} onChange={(v) => setManual({ ...manual, existingCustomers: v })} prefix="#" />
          <InputField label="Deals Created" value={manual.dealsCreated} onChange={(v) => setManual({ ...manual, dealsCreated: v })} prefix="#" />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXEC DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
export default function ExecDashboard() {
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [fetchedAt, setFetchedAt] = useState<string>("");
  const [monthLabel, setMonthLabel] = useState<string>("");
  const [warning, setWarning] = useState<string>("");
  const [activeTab, setActiveTab] = useState("jason");

  // Rep data from API
  const [reps, setReps] = useState<RepResult[]>([
    { id: "jason", name: "Jason Vigilante", role: "Founding Account Executive", initials: "JV", color: "#3B82F6", type: "ae", monthlyQuota: 166666.67, annualQuota: 2000000 },
    { id: "kelcy", name: "Kelcy Koenig", role: "Founding Account Executive", initials: "KK", color: "#F59E0B", type: "ae", monthlyQuota: 150000, annualQuota: 1800000 },
    { id: "max", name: "Max Zajec", role: "Founding BDR", initials: "MZ", color: "#8B5CF6", type: "bdr", monthlyQuota: 15 },
  ]);

  // Manual mode inputs
  const [manualAE, setManualAE] = useState<Record<string, ManualAE>>({
    jason: { grossDeals: 0, churnARR: 0, nonConverting: 0, dealCount: 0, excludedCount: 0 },
    kelcy: { grossDeals: 0, churnARR: 0, nonConverting: 0, dealCount: 0, excludedCount: 0 },
  });
  const [manualBDR, setManualBDR] = useState<ManualBDR>({ totalMeetings: 0, disqualified: 0, existingCustomers: 0, dealsCreated: 0 });

  // Get token from URL
  const [token, setToken] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
  }, []);

  // Fetch live data
  const fetchLive = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/commissions?live=true&token=${token}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      const allReps: RepResult[] = [...(data.ae || []), ...(data.bdr ? [data.bdr] : [])];
      setReps(allReps);
      setFetchedAt(data.meta?.fetchedAt || "");
      setMonthLabel(data.meta?.monthLabel || "");
      setWarning(data.meta?.warning || "");
    } catch (e: any) {
      setError(e.message);
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isLive) fetchLive();
  }, [isLive, fetchLive]);

  // Auto-refresh every 60s when live
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(fetchLive, 60000);
    return () => clearInterval(interval);
  }, [isLive, fetchLive]);

  const current = reps.find((r) => r.id === activeTab) || reps[0];

  // Totals
  const totalNetARR = reps.filter((r): r is AEResult => r.type === "ae").reduce((sum, r) => {
    if (isLive) return sum + (r.netARR || 0);
    const m = manualAE[r.id];
    return sum + (m ? m.grossDeals - m.churnARR - m.nonConverting : 0);
  }, 0);
  const totalComm = reps.reduce((sum, r) => {
    if (isLive) return sum + ((r as any).commission || 0);
    if (r.type === "bdr") return sum + Math.max(0, manualBDR.totalMeetings - manualBDR.disqualified - manualBDR.existingCustomers) * 33;
    const m = manualAE[r.id];
    return sum + (m ? (m.grossDeals - m.churnARR - m.nonConverting) * 0.09 : 0);
  }, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", color: "#E2E8F0", fontFamily: SANS }}>
      {/* Header */}
      <div style={{ padding: "20px 32px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 720, margin: "0 auto" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#10B981", background: "rgba(16,185,129,0.1)", padding: "3px 8px", borderRadius: 4, border: "1px solid rgba(16,185,129,0.2)", fontFamily: SANS }}>
                {isLive ? "LIVE" : "MANUAL"}
              </span>
              <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0, fontFamily: SANS }}>Commission Dashboard</h1>
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4, fontFamily: SANS }}>
              {monthLabel || "Exec View"} {fetchedAt && isLive ? ` · Updated ${new Date(fetchedAt).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET` : ""}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Team Net ARR</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO }}>{fmt(totalNetARR)}</div>
            </div>
            <div style={{ textAlign: "right" as const }}>
              <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" as const, fontFamily: SANS }}>Total Comm.</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: MONO, color: "#10B981" }}>{fmt(totalComm)}</div>
            </div>
            <button onClick={() => setIsLive(!isLive)} style={{
              padding: "8px 16px", borderRadius: 8, border: isLive ? "1px solid rgba(16,185,129,0.4)" : "1px solid rgba(255,255,255,0.1)",
              background: isLive ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.04)", color: isLive ? "#10B981" : "#64748B",
              cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: SANS, transition: "all 0.2s",
            }}>
              {loading ? "Loading…" : isLive ? "● LIVE" : "○ LIVE"}
            </button>
          </div>
        </div>

        {/* Warning */}
        {warning && (
          <div style={{ maxWidth: 720, margin: "12px auto 0", padding: "10px 14px", borderRadius: 8, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B", fontSize: 12, fontFamily: SANS }}>
            ⚠️ {warning}
          </div>
        )}
        {error && (
          <div style={{ maxWidth: 720, margin: "12px auto 0", padding: "10px 14px", borderRadius: 8, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#EF4444", fontSize: 12, fontFamily: SANS }}>
            Error: {error}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, maxWidth: 720, margin: "16px auto 0", flexWrap: "wrap" as const }}>
          {reps.map((rep) => (
            <button key={rep.id} onClick={() => setActiveTab(rep.id)} style={{
              padding: "8px 18px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontSize: 13, fontWeight: activeTab === rep.id ? 600 : 500,
              fontFamily: SANS, background: activeTab === rep.id ? "rgba(255,255,255,0.06)" : "transparent", color: activeTab === rep.id ? rep.color : "#64748B",
              borderBottom: activeTab === rep.id ? `2px solid ${rep.color}` : "2px solid transparent", transition: "all 0.2s",
            }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: rep.color, marginRight: 8, opacity: activeTab === rep.id ? 1 : 0.3 }} />
              {rep.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Active Card */}
      <div style={{ padding: "24px 32px", maxWidth: 720, margin: "0 auto" }}>
        {current.type === "ae" ? (
          <AECard rep={current as AEResult} manual={manualAE[current.id] || { grossDeals: 0, churnARR: 0, nonConverting: 0, dealCount: 0, excludedCount: 0 }}
            setManual={(v) => setManualAE({ ...manualAE, [current.id]: v })} isLive={isLive} />
        ) : (
          <BDRCard rep={current as BDRResult} manual={manualBDR} setManual={setManualBDR} isLive={isLive} />
        )}
      </div>
    </div>
  );
}
