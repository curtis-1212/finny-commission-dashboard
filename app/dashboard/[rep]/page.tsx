"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";

// ─── Types ──────────────────────────────────────────────────────────────────
interface RepInfo { id: string; name: string; role: string; initials: string; color: string; type: string }
interface StageCount { count: number; arr: number }
interface AEMetrics {
  grossARR: number; churnARR: number; netARR: number;
  monthlyQuota: number; attainment: number; commission: number;
  tierBreakdown?: { label: string; amount: number }[];
  introCallsScheduled: number;
  toBeOnboarded: StageCount; closedWon: StageCount;
  closedLost: StageCount; churned: StageCount;
}
interface BDRMetrics {
  netMeetings: number; monthlyTarget: number; attainment: number;
  commission: number; introCallsScheduled: number;
}
interface MonthOption { value: string; label: string }
interface LeaderboardEntry { id: string; name: string; initials: string; color: string; netARR: number; }

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtPct = (n: number) => (n * 100).toFixed(0) + "%";

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── FINNY Brand ────────────────────────────────────────────────────────────
const B = {
  primary: "#6366F1",
  primaryLight: "#818CF8",
  primaryFaint: "#EEF2FF",
  accent: "#10B981",
  danger: "#EF4444",
  bg: "#FAFBFD",
  card: "#FFFFFF",
  text: "#1E293B",
  muted: "#64748B",
  faint: "#94A3B8",
  border: "#E2E8F0",
  borderLight: "#F1F5F9",
};

// ─── Encouragement ──────────────────────────────────────────────────────────
function getMsg(att: number, left: number, isAE: boolean) {
  if (att >= 1.5) return { h: "Absolutely crushing it.", s: `Deep in accelerator territory. ${left} days to keep building your best month yet.`, e: "🏆" };
  if (att >= 1.2) return { h: "Accelerators unlocked.", s: `Top tier, every deal from here is outsized upside. ${left} days left.`, e: "🔥" };
  if (att >= 1.0) return { h: "Quota: crushed.", s: "You've hit target. Everything from here is pure upside — keep pushing.", e: "⚡" };
  if (att >= 0.85) return { h: "The finish line is right there.", s: `${fmtPct(1 - att)} to go — you've done the hardest part. ${left} days to close it out.`, e: "🎯" };
  if (att >= 0.6) return { h: "Strong momentum.", s: `Well past halfway and building. ${left} days to close the gap.`, e: "📈" };
  if (att >= 0.3) return { h: "Building nicely.", s: `Pipeline is moving. ${left} days left — every conversation is an opportunity.`, e: "💪" };
  if (att > 0) return { h: "Off and running.", s: `First ${isAE ? "deals" : "meetings"} on the board. ${left} days to build on this.`, e: "🚀" };
  return { h: "New month, new opportunity.", s: `Clean slate, full pipeline. ${left} days to make it count.`, e: "✨" };
}

function getDaysLeft() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate() - n.getDate();
}
function getDaysInMonth() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
}
function getMonthName() {
  return new Date().toLocaleString("en-US", { month: "long" });
}

const F = {
  display: "'Instrument Sans', 'DM Sans', system-ui, sans-serif",
  body: "'DM Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', monospace",
};

// ─── PipelineRow ────────────────────────────────────────────────────────────
function PRow({ icon, label, count, arr, hl, neg }: {
  icon: string; label: string; count: number; arr?: number; hl?: boolean; neg?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${B.borderLight}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: neg ? "#FEF2F2" : hl ? B.primaryFaint : "#F8FAFC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>{icon}</div>
        <span style={{ fontSize: 14, fontFamily: F.body, color: B.text, fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {arr !== undefined && arr > 0 && (
          <span style={{ fontSize: 12, fontFamily: F.mono, fontWeight: 500, color: neg ? B.danger : B.faint }}>{neg ? "-" : ""}{fmt(arr)}</span>
        )}
        <span style={{
          fontSize: 15, fontFamily: F.mono, fontWeight: 700,
          color: neg && count > 0 ? B.danger : hl ? B.primary : B.text,
          background: neg && count > 0 ? "#FEF2F2" : hl ? B.primaryFaint : "#F1F5F9",
          padding: "3px 12px", borderRadius: 8, minWidth: 36, textAlign: "center" as const,
        }}>{count}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function RepDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const repId = params.rep as string;
  const token = searchParams.get("token") || "";

  const [rep, setRep] = useState<RepInfo | null>(null);
  const [metrics, setMetrics] = useState<AEMetrics | BDRMetrics | null>(null);
  const [monthLabel, setMonthLabel] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue());
  const [availableMonths, setAvailableMonths] = useState<MonthOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [anim, setAnim] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/commissions/rep/${repId}?token=${token}&month=${selectedMonth}`);
      if (!res.ok) { throw new Error(res.status === 401 ? "unauthorized" : "load_failed"); }
      const data = await res.json();
      setRep(data.rep); setMetrics(data.metrics); setMonthLabel(data.meta?.monthLabel || "");
      if (data.availableMonths) setAvailableMonths(data.availableMonths);
        if (data.leaderboard) setLeaderboard(data.leaderboard);
      setError("");
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [repId, token, selectedMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { const i = setInterval(fetchData, 120000); return () => clearInterval(i); }, [fetchData]);
  useEffect(() => {
    setAnim(false);
    if (!loading && !error && metrics) { const t = setTimeout(() => setAnim(true), 150); return () => clearTimeout(t); }
  }, [loading, error, metrics, selectedMonth]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: B.bg, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" as const, gap: 16 }}>
      <style>{KF}</style>
      <img src="/logo.png" alt="FINNY" style={{ width: 36, height: 36, borderRadius: 8, opacity: 0.7, animation: "breathe 2s ease-in-out infinite" }} />
      <div style={{ fontSize: 13, color: B.faint, fontFamily: F.body }}>Loading your dashboard...</div>
    </div>
  );

  if (error || !rep || !metrics) return (
    <div style={{ minHeight: "100vh", background: B.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <style>{KF}</style>
      <div style={{ textAlign: "center", maxWidth: 340 }}>
        <img src="/logo.png" alt="FINNY" style={{ width: 48, height: 48, borderRadius: 12, marginBottom: 24, opacity: 0.5 }} />
        <div style={{ fontSize: 20, fontWeight: 700, color: B.text, fontFamily: F.display, letterSpacing: "-0.03em" }}>
          {error === "unauthorized" ? "Link expired" : "Something went wrong"}
        </div>
        <div style={{ fontSize: 14, color: B.muted, marginTop: 10, fontFamily: F.body, lineHeight: 1.6 }}>
          {error === "unauthorized" ? "This dashboard link is no longer valid. Reach out for a fresh one." : "Hit a snag loading data. Try refreshing."}
        </div>
      </div>
    </div>
  );

  const isAE = rep.type === "ae";
  const aeM = metrics as AEMetrics;
  const bdrM = metrics as BDRMetrics;
  const att = isAE ? aeM.attainment : bdrM.attainment;
  const comm = isAE ? aeM.commission : bdrM.commission;
  const name1 = rep.name.split(" ")[0];
  const dLeft = getDaysLeft();
  const tDays = getDaysInMonth();
  const today = new Date().getDate();
  const isCur = selectedMonth === getCurrentMonthValue();
  const msg = getMsg(att, dLeft, isAE);
  const cur = isAE ? aeM.netARR : bdrM.netMeetings;
  const tgt = isAE ? aeM.monthlyQuota : bdrM.monthlyTarget;
  const rem = Math.max(0, tgt - cur);

  const sz = 200, sw = 12, r = (sz - sw) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(anim ? att : 0, 1.5));
  const gid = `rg-${rep.id}`;

  const an = (d: string) => ({ opacity: anim ? 1 : 0, transform: anim ? "translateY(0)" : "translateY(16px)", transition: `all 0.8s cubic-bezier(0.16,1,0.3,1) ${d}` });
  const anS = (d: string) => ({ opacity: anim ? 1 : 0, transform: anim ? "scale(1)" : "scale(0.92)", transition: `all 1s cubic-bezier(0.16,1,0.3,1) ${d}` });

  return (
    <div style={{ minHeight: "100vh", background: B.bg, position: "relative", overflow: "hidden" }}>
      <style>{KF}</style>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');`}</style>

      {/* Ambient */}
      <div style={{ position: "fixed", top: -200, left: "50%", transform: "translateX(-50%)", width: 800, height: 800, background: `radial-gradient(circle, ${B.primary}06 0%, transparent 60%)`, pointerEvents: "none" }} />

      <div style={{ maxWidth: 440, margin: "0 auto", padding: "0 20px", position: "relative", zIndex: 1 }}>

        {/* ─── Top bar ────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 0 12px", ...an("0s") }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/logo.png" alt="FINNY" style={{ width: 28, height: 28, borderRadius: 6 }} />
            <div style={{ fontSize: 11, fontWeight: 600, color: B.faint, fontFamily: F.body, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Dashboard</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isCur && <div style={{ width: 6, height: 6, borderRadius: "50%", background: B.accent, animation: "breathe 2.5s ease-in-out infinite" }} />}
            {availableMonths.length > 1 ? (
              <select value={selectedMonth} onChange={(e) => { setSelectedMonth(e.target.value); setLoading(true); }}
                style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${B.border}`, background: B.card, color: B.muted, fontSize: 12, fontFamily: F.body, fontWeight: 500, cursor: "pointer", outline: "none", boxShadow: "0 1px 2px rgba(0,0,0,.04)" }}>
                {availableMonths.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 12, fontWeight: 500, color: B.muted, fontFamily: F.body }}>{monthLabel || getMonthName()}</span>
            )}
          </div>
        </div>

        {/* ─── Hero card ──────────────────────────────────────────── */}
        <div style={{ background: B.card, borderRadius: 24, border: `1px solid ${B.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.04), 0 8px 32px rgba(0,0,0,.03)", padding: "32px 28px 36px", marginTop: 8, ...an("0.05s") }}>
          {/* Greeting */}
          <div style={{ fontSize: 14, color: B.faint, fontFamily: F.body }}>{isCur ? `Hey ${name1}` : name1}</div>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: B.text, fontFamily: F.display, letterSpacing: "-0.035em", lineHeight: 1.1, margin: "6px 0 0" }}>
            {msg.h} {msg.e}
          </h1>
          <p style={{ fontSize: 14, color: B.muted, fontFamily: F.body, lineHeight: 1.6, margin: "10px 0 0", maxWidth: 340 }}>{msg.s}</p>

          {/* Ring */}
          <div style={{ display: "flex", justifyContent: "center", padding: "36px 0 28px", ...anS("0.15s") }}>
            <div style={{ position: "relative", width: sz, height: sz }}>
              <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} style={{ transform: "rotate(-90deg)" }}>
                <defs>
                  <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={B.primary} />
                    <stop offset="100%" stopColor={att >= 1.0 ? B.accent : B.primaryLight} />
                  </linearGradient>
                </defs>
                <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={B.borderLight} strokeWidth={sw} />
                <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={sw}
                  strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.34,1.56,0.64,1)", filter: att >= 1.0 ? `drop-shadow(0 0 12px ${B.primary}40)` : "none" }} />
                {att >= 1.0 && <circle cx={sz/2} cy={sz/2} r={r} fill="none" stroke={B.primary} strokeWidth={sw}
                  strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" opacity={0.15}
                  style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(0.34,1.56,0.64,1)", filter: "blur(10px)" }} />}
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                <div style={{ fontSize: 44, fontWeight: 700, fontFamily: F.display, color: B.text, letterSpacing: "-0.04em", lineHeight: 1 }}>
                  {fmtPct(anim ? att : 0)}
                </div>
                <div style={{ fontSize: 11, color: B.faint, fontFamily: F.body, marginTop: 4, fontWeight: 500, letterSpacing: "0.05em", textTransform: "uppercase" as const }}>
                  of quota
                </div>
              </div>
            </div>
          </div>

          {/* Bar + numbers */}
          <div style={{ padding: "0 4px" }}>
            <div style={{ width: "100%", height: 8, background: B.borderLight, borderRadius: 100, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 100, minWidth: att > 0 ? 8 : 0,
                width: `${Math.min(att * 100, 100)}%`,
                background: `linear-gradient(90deg, ${B.primary}, ${att >= 1.0 ? B.accent : B.primaryLight})`,
                transition: "width 1.4s cubic-bezier(0.34,1.56,0.64,1) 0.5s",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
              <div>
                <div style={SL}>{isAE ? "Net ARR" : "Meetings"}</div>
                <div style={{ ...SV, color: B.primary }}>{isAE ? fmt(cur) : cur}</div>
              </div>
              <div style={{ textAlign: "center" as const }}>
                <div style={SL}>Remaining</div>
                <div style={SV}>{isAE ? fmt(rem) : Math.ceil(rem)}</div>
              </div>
              <div style={{ textAlign: "right" as const }}>
                <div style={SL}>{isAE ? "Monthly Quota" : "Target"}</div>
                <div style={SV}>{isAE ? fmt(tgt) : tgt}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Commission ─────────────────────────────────────────── */}
        <div style={{
          background: `linear-gradient(135deg, ${B.primary}, ${B.primaryLight})`,
          borderRadius: 20, padding: "24px 26px", marginTop: 12,
          boxShadow: `0 4px 24px ${B.primary}20`, ...an("0.22s"),
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.65)", fontFamily: F.body, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 6 }}>
                Commission Earned
              </div>
              <div style={{ fontSize: 34, fontWeight: 700, fontFamily: F.display, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1 }}>
                {fmt(comm)}
              </div>
            </div>
            {isAE && (
              <div style={{ textAlign: "right" as const, marginTop: 4 }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontFamily: F.body, letterSpacing: "0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Gross → Net</div>
                <div style={{ fontSize: 12, fontFamily: F.mono, color: "rgba(255,255,255,0.8)", fontWeight: 500 }}>
                  {fmt(aeM.grossARR)} <span style={{ color: (aeM.churnARR || 0) > 0 ? "#FCA5A5" : "rgba(255,255,255,0.5)" }}>− {fmt(aeM.churnARR || 0)}</span>
                </div>
              </div>
            )}
          </div>
          {isAE && aeM.tierBreakdown && aeM.tierBreakdown.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              {aeM.tierBreakdown.map((t, i) => (
                <div key={i} style={{ flex: 1, padding: "10px 12px", borderRadius: 12, background: t.amount > 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.06)", backdropFilter: "blur(8px)" }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: F.body, letterSpacing: "0.05em", textTransform: "uppercase" as const, marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: F.mono, color: t.amount > 0 ? "#fff" : "rgba(255,255,255,0.3)" }}>{fmt(t.amount)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Pipeline ───────────────────────────────────────────── */}
        <div style={{ background: B.card, borderRadius: 20, border: `1px solid ${B.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.03), 0 4px 16px rgba(0,0,0,.02)", padding: "8px 22px 6px", marginTop: 12, ...an("0.3s") }}>
          <div style={{ fontSize: 11, color: B.faint, fontFamily: F.body, letterSpacing: "0.06em", textTransform: "uppercase" as const, fontWeight: 600, padding: "16px 0 6px" }}>
            {isAE ? "Pipeline Breakdown" : "Activity"}
          </div>
          {isAE ? (
            <>
              <PRow icon="📞" label="Intro Calls" count={aeM.introCallsScheduled} />
              <PRow icon="🚀" label="To Be Onboarded" count={aeM.toBeOnboarded.count} arr={aeM.toBeOnboarded.arr} hl />
              <PRow icon="✅" label="Closed Won" count={aeM.closedWon.count} arr={aeM.closedWon.arr} hl />
              <PRow icon="❌" label="Closed Lost" count={aeM.closedLost.count} arr={aeM.closedLost.arr} />
              <PRow icon="🔄" label="Churned" count={aeM.churned?.count || 0} arr={aeM.churned?.arr || 0} neg />
            </>
          ) : (
            <>
              <PRow icon="📞" label="Intro Calls" count={bdrM.introCallsScheduled} hl />
              <PRow icon="📋" label="Qualified Meetings" count={bdrM.netMeetings} hl />
              <PRow icon="🎯" label="Monthly Target" count={bdrM.monthlyTarget} />
            </>
          )}
        </div>

        {/* ─── Days grid (current month only) ─────────────────────── */}
        {isCur && (
          <div style={{ background: B.card, borderRadius: 20, border: `1px solid ${B.border}`, boxShadow: "0 1px 3px rgba(0,0,0,.03)", padding: "20px 22px 24px", marginTop: 12, textAlign: "center" as const, ...an("0.38s") }}>
            <div style={{ display: "flex", gap: 3.5, flexWrap: "wrap" as const, justifyContent: "center" }}>
              {Array.from({ length: tDays }, (_, i) => {
                const d = i + 1, past = d < today, isT = d === today;
                return <div key={i} style={{ width: 10, height: 10, borderRadius: 3, background: isT ? B.primary : past ? `${B.primary}30` : B.borderLight, boxShadow: isT ? `0 0 8px ${B.primary}50` : "none", transition: "all 0.3s" }} />;
              })}
            </div>
            <div style={{ fontSize: 14, color: B.muted, fontFamily: F.body, marginTop: 16, lineHeight: 1.4 }}>
              <strong style={{ color: B.text, fontWeight: 700 }}>{dLeft}</strong> selling days left in {monthLabel || getMonthName()}
            </div>
          </div>
        )}


        {/* ─── AE Leaderboard ─── */}
        {leaderboard.length > 0 && rep?.type === "ae" && (
          <div style={{ marginTop: 32, padding: "20px 24px", background: B.card, borderRadius: 14, border: `1px solid ${B.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: B.muted, fontFamily: F.display, letterSpacing: "0.04em", marginBottom: 16, textTransform: "uppercase" as const }}>
              AE Leaderboard — New ARR
            </div>
            {leaderboard.map((entry, idx) => {
              const isMe = entry.id === rep?.id;
              return (
                <div key={entry.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 12px", borderRadius: 8,
                  background: isMe ? `${B.accent}12` : "transparent",
                  borderBottom: idx < leaderboard.length - 1 ? `1px solid ${B.border}` : "none",
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 6,
                    background: `#${entry.color}20`, border: `1px solid #${entry.color}35`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: `#${entry.color}`, fontFamily: F.display,
                  }}>{idx + 1}</div>
                  <div style={{
                    width: 28, height: 28, borderRadius: 7,
                    background: `#${entry.color}18`, border: `1px solid #${entry.color}30`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: `#${entry.color}`, fontFamily: F.display,
                  }}>{entry.initials}</div>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: isMe ? 700 : 500, color: isMe ? B.accent : B.text, fontFamily: F.body }}>
                    {entry.name}{isMe ? " (You)" : ""}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: isMe ? B.accent : B.text, fontFamily: F.mono }}>
                    {"$" + Math.round(entry.netARR).toLocaleString("en-US")}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Footer ─────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "32px 0 40px", opacity: anim ? 1 : 0, transition: "opacity 0.6s ease 0.6s" }}>
          <img src="/logo.png" alt="" style={{ width: 14, height: 14, borderRadius: 3, opacity: 0.3 }} />
          <span style={{ fontSize: 11, color: B.faint, fontFamily: F.body }}>Updates every 2 min · Powered by FINNY</span>
        </div>
      </div>
    </div>
  );
}

const SL: React.CSSProperties = { fontSize: 10, color: "#94A3B8", fontFamily: "'DM Sans', system-ui, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, marginBottom: 4 };
const SV: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#1E293B", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em" };
const KF = `@keyframes breathe { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.94); } }`;
