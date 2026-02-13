"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";

// ─── Types ──────────────────────────────────────────────────────────────────
interface RepInfo { id: string; name: string; role: string; initials: string; color: string; type: string }
interface StageCount { count: number; arr: number }
interface AEMetrics {
  netARR: number; monthlyQuota: number; attainment: number;
  introCallsScheduled: number;
  toBeOnboarded: StageCount; closedWon: StageCount;
  closedLost: StageCount; churned: StageCount;
}
interface BDRMetrics {
  netMeetings: number; monthlyTarget: number; attainment: number;
  introCallsScheduled: number;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtPct = (n: number) => (n * 100).toFixed(0) + "%";

// ─── Encouragement ──────────────────────────────────────────────────────────
function getMessage(att: number, daysLeft: number): { headline: string; sub: string; emoji: string } {
  if (att >= 1.2) return { headline: "You're on fire", sub: `Accelerators unlocked. ${daysLeft} days left to widen the gap.`, emoji: "🔥" };
  if (att >= 1.0) return { headline: "Quota crushed", sub: "Everything from here is upside. Keep the momentum going.", emoji: "⚡" };
  if (att >= 0.8) return { headline: "Almost there", sub: `${fmtPct(1 - att)} to go — you've got ${daysLeft} days to close the gap.`, emoji: "🎯" };
  if (att >= 0.5) return { headline: "Solid progress", sub: `Halfway mark cleared. ${daysLeft} days to make it count.`, emoji: "📈" };
  if (att > 0) return { headline: "Building momentum", sub: `Every deal gets you closer. ${daysLeft} days left this month.`, emoji: "💪" };
  return { headline: "Let's get after it", sub: `Fresh month, clean slate. ${daysLeft} days to make your mark.`, emoji: "🚀" };
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

// ─── Fonts ──────────────────────────────────────────────────────────────────
const DISPLAY = "'Outfit', system-ui, sans-serif";
const BODY = "'DM Sans', system-ui, sans-serif";
const MONO = "'JetBrains Mono', monospace";

// ─── Shared mini-components ─────────────────────────────────────────────────
function PipelineRow({ icon, label, count, arr, color, accent }: {
  icon: string; label: string; count: number; arr?: number; color: string; accent?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "11px 0",
      borderBottom: "1px solid #F1F5F9",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, width: 24, textAlign: "center" as const }}>{icon}</span>
        <span style={{ fontSize: 13, fontFamily: BODY, color: "#475569", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {arr !== undefined && arr > 0 && (
          <span style={{ fontSize: 12, fontFamily: MONO, color: "#94A3B8", fontWeight: 500 }}>
            {fmt(arr)}
          </span>
        )}
        <span style={{
          fontSize: 14, fontFamily: MONO, fontWeight: 700,
          color: accent ? color : "#1E293B",
          background: accent ? `${color}12` : "#F8FAFC",
          padding: "2px 10px", borderRadius: 6,
          minWidth: 32, textAlign: "center" as const,
        }}>
          {count}
        </span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function RepDashboard() {
  const params = useParams();
  const searchParams = useSearchParams();
  const repId = params.rep as string;
  const token = searchParams.get("token") || "";

  const [rep, setRep] = useState<RepInfo | null>(null);
  const [metrics, setMetrics] = useState<AEMetrics | BDRMetrics | null>(null);
  const [monthLabel, setMonthLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [animReady, setAnimReady] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/commissions/rep/${repId}?token=${token}`);
      if (!res.ok) {
        if (res.status === 401) throw new Error("unauthorized");
        throw new Error("load_failed");
      }
      const data = await res.json();
      setRep(data.rep);
      setMetrics(data.metrics);
      setMonthLabel(data.meta?.monthLabel || "");
      setError("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [repId, token]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    if (!loading && !error && metrics) {
      const t = setTimeout(() => setAnimReady(true), 100);
      return () => clearTimeout(t);
    }
  }, [loading, error, metrics]);

  // ─── Loading ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{KEYFRAMES}</style>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#CBD5E1", animation: "pulse 1.4s ease-in-out infinite" }} />
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────────────────
  if (error || !rep || !metrics) {
    return (
      <div style={{ minHeight: "100vh", background: "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <style>{KEYFRAMES}</style>
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ fontSize: 44, marginBottom: 20 }}>🔒</div>
          <div style={{ fontSize: 19, fontWeight: 600, color: "#1E293B", fontFamily: DISPLAY, letterSpacing: "-0.02em" }}>
            {error === "unauthorized" ? "Link expired or invalid" : "Something went wrong"}
          </div>
          <div style={{ fontSize: 14, color: "#94A3B8", marginTop: 10, fontFamily: BODY, lineHeight: 1.5 }}>
            Ask Curtis for a fresh dashboard link.
          </div>
        </div>
      </div>
    );
  }

  const isAE = rep.type === "ae";
  const aeM = metrics as AEMetrics;
  const bdrM = metrics as BDRMetrics;
  const attainment = isAE ? aeM.attainment : bdrM.attainment;
  const firstName = rep.name.split(" ")[0];
  const daysLeft = getDaysLeft();
  const totalDays = getDaysInMonth();
  const todayDate = new Date().getDate();
  const msg = getMessage(attainment, daysLeft);

  const current = isAE ? aeM.netARR : bdrM.netMeetings;
  const target = isAE ? aeM.monthlyQuota : bdrM.monthlyTarget;
  const remaining = Math.max(0, target - current);

  // Ring
  const ringSize = 220;
  const strokeW = 14;
  const r = (ringSize - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(animReady ? attainment : 0, 1.5));

  // Anim helper
  const anim = (delay: string) => ({
    opacity: animReady ? 1 : 0,
    transform: animReady ? "translateY(0)" : "translateY(14px)",
    transition: `all 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${delay}`,
  });
  const animScale = (delay: string) => ({
    opacity: animReady ? 1 : 0,
    transform: animReady ? "scale(1)" : "scale(0.9)",
    transition: `all 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}`,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#FAFBFC", position: "relative", overflow: "hidden" }}>
      <style>{KEYFRAMES}</style>

      {/* Background glow */}
      <div style={{
        position: "fixed", top: -300, right: -200, width: 700, height: 700,
        background: `radial-gradient(circle, ${rep.color}08 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "48px 24px 40px", position: "relative", zIndex: 1 }}>

        {/* ─── Month pill ──────────────────────────────────────────── */}
        <div style={anim("0s")}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            fontSize: 12, fontWeight: 500, color: "#64748B", fontFamily: BODY,
            background: "#fff", border: "1px solid #E8ECF0", borderRadius: 100,
            padding: "5px 14px 5px 10px", boxShadow: "0 1px 3px rgba(0,0,0,.03)",
          }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block", animation: "pulse 2s ease-in-out infinite" }} />
            {monthLabel || getMonthName()}
          </div>
        </div>

        {/* ─── Greeting ────────────────────────────────────────────── */}
        <div style={anim("0.06s")}>
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 15, color: "#94A3B8", fontFamily: BODY }}>Hey {firstName} {msg.emoji}</div>
            <h1 style={{ fontSize: 34, fontWeight: 700, color: "#0F172A", fontFamily: DISPLAY, letterSpacing: "-0.035em", lineHeight: 1.05, margin: "6px 0 0" }}>{msg.headline}</h1>
            <p style={{ fontSize: 15, color: "#64748B", fontFamily: BODY, lineHeight: 1.55, margin: "10px 0 0" }}>{msg.sub}</p>
          </div>
        </div>

        {/* ─── Progress ring ───────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0 32px", ...animScale("0.12s") }}>
          <div style={{ position: "relative", width: ringSize, height: ringSize }}>
            <svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke="#F1F5F9" strokeWidth={strokeW} />
              <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke={rep.color} strokeWidth={strokeW}
                strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                style={{
                  transition: "stroke-dashoffset 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  filter: attainment >= 1.0 ? `drop-shadow(0 0 10px ${rep.color}50)` : "none",
                }} />
              {attainment >= 1.0 && (
                <circle cx={ringSize / 2} cy={ringSize / 2} r={r} fill="none" stroke={rep.color} strokeWidth={strokeW}
                  strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
                  opacity={0.2} style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34, 1.56, 0.64, 1)", filter: "blur(8px)" }} />
              )}
            </svg>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <div style={{ fontSize: 46, fontWeight: 800, fontFamily: DISPLAY, color: "#0F172A", letterSpacing: "-0.04em", lineHeight: 1 }}>
                {fmtPct(animReady ? attainment : 0)}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", fontFamily: BODY, marginTop: 4, letterSpacing: "0.06em", textTransform: "uppercase" as const, fontWeight: 500 }}>of target</div>
            </div>
          </div>
        </div>

        {/* ─── Current / Remaining / Target ────────────────────────── */}
        <div style={{ ...CARD, ...anim("0.2s") }}>
          {/* Mini bar */}
          <div style={{ width: "100%", height: 6, background: "#F1F5F9", borderRadius: 100, position: "relative", overflow: "visible", marginBottom: 24 }}>
            <div style={{
              height: "100%", borderRadius: 100, minWidth: attainment > 0 ? 6 : 0,
              width: `${Math.min(attainment * 100, 100)}%`,
              background: `linear-gradient(90deg, ${rep.color}, ${rep.color}DD)`,
              transition: "width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s",
            }} />
            <div style={{ position: "absolute", right: 0, top: -3, width: 1, height: 12, background: "#CBD5E1" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={NUM_LABEL}>Current</div>
              <div style={{ ...NUM_VAL, color: rep.color }}>{isAE ? fmt(current) : current}</div>
            </div>
            <div style={{ textAlign: "center" as const }}>
              <div style={NUM_LABEL}>Remaining</div>
              <div style={NUM_VAL}>
                {isAE ? fmt(remaining) : Math.max(0, Math.ceil(remaining))}
                <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 400, marginLeft: 3 }}>{isAE ? "ARR" : "mtgs"}</span>
              </div>
            </div>
            <div style={{ textAlign: "right" as const }}>
              <div style={NUM_LABEL}>Target</div>
              <div style={NUM_VAL}>{isAE ? fmt(target) : target}</div>
            </div>
          </div>
        </div>

        {/* ─── Pipeline activity ───────────────────────────────────── */}
        <div style={{ ...CARD, marginTop: 10, padding: "6px 20px 4px", ...anim("0.3s") }}>
          <div style={{ fontSize: 10, color: "#94A3B8", fontFamily: BODY, letterSpacing: "0.06em", textTransform: "uppercase" as const, fontWeight: 600, padding: "14px 0 4px" }}>
            {isAE ? "Pipeline This Month" : "Activity This Month"}
          </div>

          {isAE ? (
            <>
              <PipelineRow icon="📞" label="Intro Calls Scheduled" count={aeM.introCallsScheduled} color={rep.color} />
              <PipelineRow icon="🚀" label="To Be Onboarded" count={aeM.toBeOnboarded.count} arr={aeM.toBeOnboarded.arr} color={rep.color} accent />
              <PipelineRow icon="✅" label="Closed Won" count={aeM.closedWon.count} arr={aeM.closedWon.arr} color="#10B981" accent />
              <PipelineRow icon="❌" label="Closed Lost" count={aeM.closedLost.count} arr={aeM.closedLost.arr} color="#EF4444" />
              <div style={{ borderBottom: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, width: 24, textAlign: "center" as const }}>🔄</span>
                  <span style={{ fontSize: 13, fontFamily: BODY, color: "#475569", fontWeight: 500 }}>Churned</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {aeM.churned.arr > 0 && (
                    <span style={{ fontSize: 12, fontFamily: MONO, color: "#F87171", fontWeight: 500 }}>-{fmt(aeM.churned.arr)}</span>
                  )}
                  <span style={{
                    fontSize: 14, fontFamily: MONO, fontWeight: 700, color: aeM.churned.count > 0 ? "#EF4444" : "#1E293B",
                    background: aeM.churned.count > 0 ? "#FEF2F2" : "#F8FAFC",
                    padding: "2px 10px", borderRadius: 6, minWidth: 32, textAlign: "center" as const,
                  }}>
                    {aeM.churned.count}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <PipelineRow icon="📞" label="Intro Calls Scheduled" count={bdrM.introCallsScheduled} color={rep.color} accent />
              <PipelineRow icon="📋" label="Qualified Meetings" count={bdrM.netMeetings} color={rep.color} accent />
              <div style={{ padding: "11px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 15, width: 24, textAlign: "center" as const }}>🎯</span>
                  <span style={{ fontSize: 13, fontFamily: BODY, color: "#475569", fontWeight: 500 }}>Monthly Target</span>
                </div>
                <span style={{ fontSize: 14, fontFamily: MONO, fontWeight: 700, color: "#1E293B", background: "#F8FAFC", padding: "2px 10px", borderRadius: 6 }}>
                  {bdrM.monthlyTarget}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ─── Days remaining ──────────────────────────────────────── */}
        <div style={{ ...CARD, marginTop: 10, textAlign: "center" as const, padding: "18px 22px 20px", ...anim("0.38s") }}>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, justifyContent: "center" }}>
            {Array.from({ length: totalDays }, (_, i) => {
              const dayNum = i + 1;
              const isPast = dayNum < todayDate;
              const isToday = dayNum === todayDate;
              return (
                <div key={i} style={{
                  width: 9, height: 9, borderRadius: 2.5,
                  background: isToday ? rep.color : isPast ? `${rep.color}35` : "#EEF1F5",
                  boxShadow: isToday ? `0 0 8px ${rep.color}50` : "none",
                  transition: "all 0.3s",
                }} />
              );
            })}
          </div>
          <div style={{ fontSize: 13, color: "#64748B", fontFamily: BODY, marginTop: 14, lineHeight: 1.4 }}>
            <strong style={{ color: "#1E293B", fontWeight: 600 }}>{daysLeft}</strong> selling days left in {monthLabel || getMonthName()}
          </div>
        </div>

        {/* ─── Footer ──────────────────────────────────────────────── */}
        <div style={{
          textAlign: "center" as const, fontSize: 11, color: "#CBD5E1", fontFamily: BODY,
          marginTop: 36, letterSpacing: "0.01em",
          opacity: animReady ? 1 : 0, transition: "opacity 0.6s ease 0.5s",
        }}>
          Updates every 2 min · Data from Attio
        </div>
      </div>
    </div>
  );
}

// ─── Shared styles ──────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: "#fff", borderRadius: 18, padding: "22px 22px 26px",
  border: "1px solid #E8ECF0",
  boxShadow: "0 1px 4px rgba(0,0,0,.03), 0 4px 16px rgba(0,0,0,.02)",
};
const NUM_LABEL: React.CSSProperties = {
  fontSize: 10, color: "#94A3B8", fontFamily: "'DM Sans', system-ui, sans-serif",
  letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, marginBottom: 4,
};
const NUM_VAL: React.CSSProperties = {
  fontSize: 20, fontWeight: 700, color: "#1E293B",
  fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.02em",
};

const KEYFRAMES = `
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.92); }
}
`;
