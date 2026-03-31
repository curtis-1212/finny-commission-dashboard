"use client";
import { useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────
interface DealDetail { name: string; value: number; closeDate: string; recordId?: string }
interface TranscriptMetrics {
  avgTalkRatio: number | null;
  avgDurationMinutes: number | null;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  wonMetrics: { avgTalkRatio: number | null; avgDuration: number | null; avgSentimentScore: number | null } | null;
  lostMetrics: { avgTalkRatio: number | null; avgDuration: number | null; avgSentimentScore: number | null } | null;
  totalAnalyzed: number;
}
interface AEResult {
  id: string; name: string; role: string; initials: string; color: string; type: "ae";
  monthlyQuota: number; annualQuota: number;
  fullQuota?: number;
  rampFactor?: number;
  rampMonth?: number | null;
  isRamping?: boolean;
  grossARR?: number; churnARR?: number; netARR?: number;
  dealCount?: number; churnCount?: number; excludedCount?: number;
  demoCount?: number;
  introCallCount?: number;
  optOutARR?: number; optOutCount?: number;
  cwRate?: number | null;
  tboRate?: number | null;
  priorCwRate?: number | null;
  priorTboRate?: number | null;
  priorDemoCount?: number;
  attainment?: number; commission?: number;
  tierBreakdown?: { label: string; amount: number }[];
  closedWonDeals?: DealDetail[];
  optOutDeals?: DealDetail[];
  transcriptInsights?: TranscriptMetrics;
  uncapturedDemos?: VerifiedDemo[];
}
interface VerifiedDemo {
  date: string; title: string; source: "attio" | "fireflies" | "both"; durationMinutes?: number;
}
interface BDRResult {
  id: string; name: string; role: string; initials: string; color: string; type: "bdr";
  monthlyQuota: number;
  totalMeetings?: number; netMeetings?: number;
  attainment?: number; commission?: number;
  demoDetails?: { name: string; date: string }[];
}
type RepResult = AEResult | BDRResult;
interface MonthOption { value: string; label: string }
interface ApprovalEntry { repId: string; name: string; approved: boolean; approvedAt: string | null }
interface VerificationStatus { month: string; cycleStarted: boolean; startedAt?: string; approvals: ApprovalEntry[]; allApproved: boolean }
interface AEForecast {
  scheduledDemos: number;
  trailing60DayCwRate: number | null;
  avgFunnelDays: number | null;
  avgDealSize: number;
  projectedARR: { low: number; mid: number; high: number };
}
interface ForecastData {
  perAE: Record<string, AEForecast>;
  team: {
    totalScheduledDemos: number;
    blendedCwRate: number | null;
    avgFunnelDays: number | null;
    projectedARR: { low: number; mid: number; high: number };
    totalQuota: number;
  };
}
interface FunnelLeaderboardEntry {
  id: string; name: string; initials: string; color: string;
  rank: number; demosInWindow: number; closedWonCount: number; tboCount: number;
  cwRate: number | null; tboRate: number | null;
  avgDaysToClose: number | null; speedScore: number; compositeScore: number;
}
interface FunnelLeaderboard {
  entries: FunnelLeaderboardEntry[];
  windowStart: string; windowEnd: string;
}

// ─── Brand: FINNY Style Guide (Light Mode) ──────────────────────────────────
const C = {
  bg: "#FAFBFD",
  surface: "#FFFFFF",
  card: "#FFFFFF",
  cardHover: "#F5F6FA",
  border: "rgba(0,0,0,0.06)",
  borderMed: "rgba(0,0,0,0.10)",
  primary: "#6665E1",        // FINNY Purple
  primaryMuted: "#5554C8",
  primaryLight: "#8584E8",
  primaryFaint: "#EEEEFF",
  accent: "#10B981",         // Green for light mode (lime doesn't work well)
  accentMuted: "#059669",
  accentDark: "#047857",
  warn: "#F59E0B",
  warnMuted: "#D97706",
  danger: "#EF4444",
  dangerMuted: "#DC2626",
  text: "#1B1B1B",           // Off Black
  textSec: "#4A4A5A",
  textDim: "#6E6E80",
  textGhost: "#9A9AAA",
  white: "#FCFCFC",
};
const F = {
  d: "'Inter', system-ui, sans-serif",
  b: "'Inter', system-ui, sans-serif",
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

/**
 * Calculate expected pace through the month for color thresholds.
 * Returns null for past/future months (use absolute thresholds).
 * For the current month, returns a value between 0–1 with cubic convergence
 * toward 1.0 at month end so colors approach absolute thresholds naturally.
 */
function getExpectedPace(selectedMonth: string): number | null {
  const currentMonthValue = getCurrentMonthValue();
  if (selectedMonth !== currentMonthValue) return null;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const dayOfMonth = now.getUTCDate();
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const rawPace = dayOfMonth / totalDays;
  // Cubic convergence: gentle early in month, steep near end
  const convergence = Math.pow(rawPace, 3);
  return rawPace + (1.0 - rawPace) * convergence;
}

// ─── Attainment color logic (pace-relative) ─────────────────────────────────
// When pace is null (past month), uses absolute thresholds (100%/80%/60%).
// When pace is provided (current month), compares attainment to expected pace.
function attColor(att: number, pace?: number | null): string {
  const threshold = pace ?? 1.0;
  const ratio = att / threshold;
  if (ratio >= 0.67)  return C.accent;   // green — on track
  if (ratio >= 0.33)  return C.warn;     // yellow — getting there
  return C.danger;                       // red — needs attention
}
function attBg(att: number, pace?: number | null): string {
  const threshold = pace ?? 1.0;
  const ratio = att / threshold;
  if (ratio >= 0.67)  return `${C.accent}18`;
  if (ratio >= 0.33)  return `${C.warn}12`;
  return `${C.danger}12`;
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
      flex: "1 1 140px",
      minWidth: 140,
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
function PlanBar({ name, initials, actual, grossARR, quota, att, commission, deals, type, demoCount, introCallCount, cwRate, tboRate, priorCwRate, priorTboRate, cwRateLabel, optOutARR, optOutCount, pace, onClick, forecastARR }: {
  name: string; initials: string; actual: number; grossARR?: number; quota: number;
  att: number; commission: number; deals: number; type: string;
  demoCount?: number; introCallCount?: number; cwRate?: number | null; tboRate?: number | null;
  priorCwRate?: number | null; priorTboRate?: number | null;
  cwRateLabel?: string;
  optOutARR?: number; optOutCount?: number;
  pace?: number | null;
  onClick?: () => void;
  forecastARR?: { low: number; mid: number; high: number } | null;
}) {
  const pct = Math.min(att, 1.5);
  const threshold = pace ?? 1.0;
  const ratio = att / threshold; // how far toward pace
  const barColor = ratio >= 0.67
    ? `linear-gradient(90deg, ${C.primary}, ${C.accent})`   // green — on track
    : ratio >= 0.33
      ? `linear-gradient(90deg, ${C.warn}, ${C.warnMuted})` // yellow — getting there
      : `linear-gradient(90deg, ${C.danger}, ${C.dangerMuted})`; // red — needs attention

  const isBDR = type === "bdr";

  return (
    <div style={{
      padding: "16px 20px",
      borderBottom: `1px solid ${C.border}`,
      transition: "background 0.15s",
      cursor: onClick ? "pointer" : undefined,
    }}
      onClick={onClick}
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
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0, overflow: "hidden" }}>
          {/* Net ARR / Meetings */}
          <div style={{ flex: "1 1 60px", textAlign: "right" as const, minWidth: 50, position: "relative" }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{isBDR ? "Mtgs" : "Net ARR"}</div>
            <div style={{
              fontSize: 15, fontWeight: 700, fontFamily: F.m, color: C.text, letterSpacing: "-0.02em",
            }}>
              {isBDR ? actual : fmtK(actual)}
            </div>
          </div>

          {/* Gross ARR */}
          {!isBDR && (
            <div style={{ flex: "1 1 60px", textAlign: "right" as const, minWidth: 50 }}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Gross ARR</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: F.m, color: C.textSec, letterSpacing: "-0.02em" }}>
                {fmtK(grossARR ?? 0)}
              </div>
            </div>
          )}

          {/* Attainment */}
          <div style={{ flex: "1 1 60px", textAlign: "right" as const, minWidth: 50 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Attain.</div>
            <div style={{
              fontSize: 15, fontWeight: 700, fontFamily: F.m,
              color: attColor(att, pace), letterSpacing: "-0.02em",
            }}>
              {fmtPct0(att)}
            </div>
          </div>

          {/* Deals */}
          <div style={{ flex: "0.7 1 45px", textAlign: "right" as const, minWidth: 40 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>{isBDR ? "Target" : "Deals"}</div>
            <div style={{ fontSize: 15, fontWeight: 600, fontFamily: F.m, color: C.textSec }}>{isBDR ? quota : deals}</div>
          </div>

          {/* Calls / Close */}
          {!isBDR && (
            <div style={{ flex: "0.8 1 55px", textAlign: "right" as const, minWidth: 45 }}
              title={introCallCount != null ? `${introCallCount} intro calls, ${deals} closes` : ""}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Calls/Close</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: F.m, color: C.textSec }}>
                {deals > 0 && introCallCount != null ? (introCallCount / deals).toFixed(1) : "—"}
              </div>
              {introCallCount != null && introCallCount > 0 && (
                <div style={{ fontSize: 9, color: C.textGhost, fontFamily: F.m, marginTop: 1 }}>
                  {introCallCount} call{introCallCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {/* TBO Rate */}
          {!isBDR && (
            <div style={{ flex: "0.8 1 50px", textAlign: "right" as const, minWidth: 45 }}
              title={priorTboRate != null ? `Prior month: ${fmtPct0(priorTboRate)}` : "No prior month data"}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", marginBottom: 2 }}>TBO RATE</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: F.m, color: C.textSec }}>
                {tboRate != null ? fmtPct0(tboRate) : "—"}
              </div>
              {demoCount != null && demoCount > 0 && (
                <div style={{ fontSize: 9, color: C.textGhost, fontFamily: F.m, marginTop: 1 }}>
                  {demoCount} demo{demoCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {/* CW Rate */}
          {!isBDR && (
            <div style={{ flex: "0.8 1 50px", textAlign: "right" as const, minWidth: 45 }}
              title={priorCwRate != null ? `Prior month: ${fmtPct0(priorCwRate)}` : "No prior month data"}>
              <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", marginBottom: 2 }}>{cwRateLabel || "CW RATE"}</div>
              <div style={{ fontSize: 15, fontWeight: 600, fontFamily: F.m, color: C.textSec }}>
                {cwRate != null ? fmtPct0(cwRate) : "—"}
              </div>
              {demoCount != null && demoCount > 0 && (
                <div style={{ fontSize: 9, color: C.textGhost, fontFamily: F.m, marginTop: 1 }}>
                  {demoCount} demo{demoCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}

          {/* Prior Mo. CW Opt-Outs (deals where user cancelled within 30 days of close) */}
          {!isBDR && (
            <div style={{ flex: "1 1 75px", textAlign: "right" as const, minWidth: 55 }}>
              <div style={{ fontSize: 9, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const, lineHeight: 1.2 }}>Prior Mo.<br/>CW Opt-Outs</div>
              <div style={{
                fontSize: 15, fontWeight: 600, fontFamily: F.m,
                color: optOutCount && optOutCount > 0 ? C.warn : C.textGhost,
              }}>
                {optOutCount && optOutCount > 0 ? optOutCount : "—"}
              </div>
            </div>
          )}

          {/* Commission */}
          <div style={{ flex: "1 1 60px", textAlign: "right" as const, minWidth: 50 }}>
            <div style={{ fontSize: 10, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Comm.</div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: F.m, color: C.accent, letterSpacing: "-0.02em" }}>
              {fmtK(commission)}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Quota label above bar */}
      {!isBDR && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 44, marginBottom: 4 }}>
          <div style={{ fontSize: 11, color: C.textSec, fontFamily: F.b, letterSpacing: "0.04em", fontWeight: 600 }}>
            QUOTA: {fmtK(quota)}
          </div>
        </div>
      )}

      {/* Row 3: Plan vs Actual bar */}
      {(() => {
        const hasForecast = !isBDR && forecastARR && forecastARR.mid > 0;
        const projectedTotal = hasForecast ? actual + forecastARR!.mid : actual;
        const projAtt = quota > 0 ? projectedTotal / quota : 0;
        const projPct = Math.min(projAtt, 1.5);
        const barMax = Math.max(pct, projPct, 1);

        return (
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 44 }}>
            <div style={{
              flex: 1, height: 6, background: "rgba(0,0,0,0.08)",
              borderRadius: 100, position: "relative", overflow: "visible",
            }}>
              {/* Quota marker */}
              <div style={{
                position: "absolute",
                left: `${Math.min(100 / barMax, 100)}%`,
                top: -2, width: 1, height: 10,
                background: "rgba(0,0,0,0.2)",
                zIndex: 2,
              }} />
              {/* Forecast striped extension */}
              {hasForecast && (
                <div style={{
                  position: "absolute", top: 0,
                  left: `${Math.min(pct * 100 / barMax, 100)}%`,
                  height: "100%",
                  width: `${Math.max(Math.min(projPct * 100 / barMax, 100) - Math.min(pct * 100 / barMax, 100), 0)}%`,
                  background: `repeating-linear-gradient(
                    -45deg,
                    ${C.primary}30,
                    ${C.primary}30 2px,
                    ${C.primary}10 2px,
                    ${C.primary}10 4px
                  )`,
                  borderRadius: "0 100px 100px 0",
                  transition: "width 0.8s cubic-bezier(0.4,0,0.2,1), left 0.8s cubic-bezier(0.4,0,0.2,1)",
                }} />
              )}
              {/* Actual fill */}
              <div style={{
                height: "100%", borderRadius: 100,
                width: `${Math.min(pct * 100 / barMax, 100)}%`,
                background: barColor,
                transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                minWidth: att > 0 ? 6 : 0,
              }} />
            </div>
            {/* ARR and deals label */}
            <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.m, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
              {isBDR
                ? `${quota} mtgs`
                : hasForecast
                  ? `${fmtK(actual)} + ${fmtK(forecastARR!.mid)} proj`
                  : `${fmtK(grossARR ?? actual)} (${deals} deal${deals !== 1 ? "s" : ""})`
              }
            </div>
          </div>
        );
      })()}

      {/* Row 3: Opt-out ARR bar (only shown if there are opt-outs) */}
      {!isBDR && optOutARR != null && optOutARR > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 44, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
            <div style={{ fontSize: 10, color: C.warn, fontFamily: F.b, letterSpacing: "0.04em", whiteSpace: "nowrap" as const }}>
              PRIOR MO. OPT-OUT
            </div>
            <div style={{
              flex: 1, height: 4, background: "rgba(0,0,0,0.08)",
              borderRadius: 100, overflow: "hidden",
            }}>
              {/* Opt-out fill - proportional to quota */}
              <div style={{
                height: "100%", borderRadius: 100,
                width: `${Math.min((optOutARR / quota) * 100, 100)}%`,
                background: `linear-gradient(90deg, ${C.warn}, ${C.warnMuted})`,
                transition: "width 0.8s cubic-bezier(0.4,0,0.2,1)",
                minWidth: 4,
              }} />
            </div>
          </div>
          {/* Opt-out value */}
          <div style={{ fontSize: 10, color: C.warn, fontFamily: F.m, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
            {fmtK(optOutARR)} ({optOutCount} deal{optOutCount !== 1 ? "s" : ""})
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// BDR PLANBAR WITH DEMO TOOLTIP
// ═══════════════════════════════════════════════════════════════════════════════
function BDRPlanBarWithTooltip({ bdrResult, pace }: {
  bdrResult: BDRResult;
  pace?: number | null;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const demos = bdrResult.demoDetails || [];
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <PlanBar
        name={bdrResult.name}
        initials={bdrResult.initials}
        actual={bdrResult.netMeetings || 0}
        quota={bdrResult.monthlyQuota}
        att={bdrResult.attainment || 0}
        commission={bdrResult.commission || 0}
        deals={0}
        type="bdr"
        pace={pace}
      />
      {showTooltip && demos.length > 0 && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 20,
          zIndex: 50,
          background: C.card,
          border: `1px solid ${C.borderMed}`,
          borderRadius: 10,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
          padding: "12px 16px",
          minWidth: 280,
          maxWidth: 380,
          maxHeight: 300,
          overflowY: "auto" as const,
        }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: C.textDim,
            fontFamily: F.b, letterSpacing: "0.06em",
            textTransform: "uppercase" as const, marginBottom: 8,
          }}>
            Demos Held ({demos.length})
          </div>
          {demos.map((d, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 0",
              borderBottom: i < demos.length - 1 ? `1px solid ${C.border}` : "none",
            }}>
              <div style={{
                fontSize: 12, fontWeight: 500, color: C.text, fontFamily: F.b,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                flex: 1, marginRight: 12,
              }}>
                {d.name}
              </div>
              <div style={{
                fontSize: 11, color: C.textGhost, fontFamily: F.m, flexShrink: 0,
              }}>
                {d.date}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORECAST CARD
// ═══════════════════════════════════════════════════════════════════════════════
function ForecastCard({ forecast, totalNetARR, totalQuota }: {
  forecast: ForecastData; totalNetARR: number; totalQuota: number;
}) {
  const team = forecast.team;
  const projLow = totalNetARR + team.projectedARR.low;
  const projMid = totalNetARR + team.projectedARR.mid;
  const projHigh = totalNetARR + team.projectedARR.high;
  const projAttLow = totalQuota > 0 ? projLow / totalQuota : 0;
  const projAttMid = totalQuota > 0 ? projMid / totalQuota : 0;
  const projAttHigh = totalQuota > 0 ? projHigh / totalQuota : 0;

  // Gauge: show range from 0 to max(150% quota, projHigh)
  const gaugeMax = Math.max(totalQuota * 1.5, projHigh);
  const actualPct = Math.min((totalNetARR / gaugeMax) * 100, 100);
  const projLowPct = Math.min((projLow / gaugeMax) * 100, 100);
  const projHighPct = Math.min((projHigh / gaugeMax) * 100, 100);
  const quotaPct = Math.min((totalQuota / gaugeMax) * 100, 100);

  return (
    <div style={{
      marginTop: 12,
      borderRadius: 12,
      border: `1px solid ${C.primary}25`,
      background: C.card,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: `1px solid ${C.border}`,
        background: `${C.primary}06`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, color: C.primary,
            fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
          }}>
            Month-End Forecast
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>
          Based on 60-day trailing rates
        </div>
      </div>

      {/* Gauge */}
      <div style={{ padding: "18px 20px 12px" }}>
        <div style={{ position: "relative", height: 32, background: "rgba(0,0,0,0.05)", borderRadius: 8, overflow: "visible" }}>
          {/* Projected range (low to high) */}
          <div style={{
            position: "absolute", top: 0, left: `${actualPct}%`, height: "100%",
            width: `${Math.max(projHighPct - actualPct, 0)}%`,
            background: `repeating-linear-gradient(
              -45deg,
              ${C.primary}18,
              ${C.primary}18 4px,
              ${C.primary}08 4px,
              ${C.primary}08 8px
            )`,
            borderRadius: "0 8px 8px 0",
            transition: "all 0.8s cubic-bezier(0.4,0,0.2,1)",
          }} />
          {/* Actual fill */}
          <div style={{
            position: "absolute", top: 0, left: 0, height: "100%",
            width: `${actualPct}%`,
            background: `linear-gradient(90deg, ${C.primary}, ${C.primaryMuted})`,
            borderRadius: actualPct >= projHighPct ? 8 : "8px 0 0 8px",
            transition: "width 1s cubic-bezier(0.4,0,0.2,1)",
          }} />
          {/* Quota marker */}
          <div style={{
            position: "absolute", left: `${quotaPct}%`,
            top: -4, width: 2, height: 40,
            background: "rgba(0,0,0,0.25)", zIndex: 2,
          }} />
          {/* Mid projection marker */}
          <div style={{
            position: "absolute", left: `${Math.min((projMid / gaugeMax) * 100, 100)}%`,
            top: -2, width: 2, height: 36,
            background: C.primary,
            zIndex: 3,
            opacity: 0.6,
          }} />
        </div>

        {/* Labels below gauge */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.m }}>
            Actual: {fmtK(totalNetARR)}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ fontSize: 10, color: C.textDim, fontFamily: F.m }}>
              Low: {fmtK(projLow)} ({fmtPct0(projAttLow)})
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, color: C.primary, fontFamily: F.m }}>
              Expected: {fmtK(projMid)} ({fmtPct0(projAttMid)})
            </span>
            <span style={{ fontSize: 10, color: C.textDim, fontFamily: F.m }}>
              High: {fmtK(projHigh)} ({fmtPct0(projAttHigh)})
            </span>
          </div>
        </div>
      </div>

      {/* Key metrics row */}
      <div style={{
        display: "flex", borderTop: `1px solid ${C.border}`,
      }}>
        {[
          { label: "Scheduled Demos", value: String(team.totalScheduledDemos), sub: "remaining this month" },
          { label: "60-Day CW Rate", value: team.blendedCwRate != null ? fmtPct(team.blendedCwRate) : "—", sub: "intro → closed/won" },
          { label: "Avg Funnel Days", value: team.avgFunnelDays != null ? `${team.avgFunnelDays}d` : "—", sub: "demo → close" },
          { label: "Projected Add'l", value: fmtK(team.projectedARR.mid), sub: "expected from pipeline" },
        ].map((m, i) => (
          <div key={i} style={{
            flex: 1, padding: "14px 16px",
            borderRight: i < 3 ? `1px solid ${C.border}` : "none",
          }}>
            <div style={{ fontSize: 9, fontWeight: 500, color: C.textDim, fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F.m, color: C.text, letterSpacing: "-0.02em" }}>{m.value}</div>
            <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b, marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FUNNEL PROGRESSION LEADERBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function FunnelLeaderboardCard({ leaderboard }: { leaderboard: FunnelLeaderboard }) {
  const entries = leaderboard.entries;
  const colLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 500, color: C.textDim, fontFamily: F.b,
    letterSpacing: "0.08em", textTransform: "uppercase",
  };
  return (
    <div style={{
      marginTop: 12, borderRadius: 12,
      border: `1px solid ${C.accent}25`,
      background: C.card, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
        background: `${C.accent}06`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: C.accentDark,
          fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          Funnel Progression
        </div>
        <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>
          Trailing 30 days
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr 72px 72px 64px 56px 64px",
        alignItems: "center", gap: 0,
        padding: "10px 20px 6px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={colLabel}>#</div>
        <div style={colLabel}>Name</div>
        <div style={{ ...colLabel, textAlign: "right" }}>TBO %</div>
        <div style={{ ...colLabel, textAlign: "right" }}>CW %</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Avg Days</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Demos</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Score</div>
      </div>

      {/* Rows */}
      {entries.map((e, i) => {
        const hasData = e.demosInWindow > 0;
        return (
          <div key={e.id} style={{
            display: "grid",
            gridTemplateColumns: "36px 1fr 72px 72px 64px 56px 64px",
            alignItems: "center", gap: 0,
            padding: "10px 20px",
            borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : "none",
            background: i === 0 && hasData ? `${C.accent}06` : "transparent",
          }}>
            {/* Rank */}
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: i === 0 && hasData ? C.accent : `${C.textGhost}20`,
              color: i === 0 && hasData ? C.white : C.textDim,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, fontFamily: F.m,
            }}>
              {e.rank}
            </div>

            {/* Name */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: `${e.color}18`, border: `1.5px solid ${e.color}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, color: e.color, fontFamily: F.b,
                flexShrink: 0,
              }}>
                {e.initials}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 500, color: C.text, fontFamily: F.b,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {e.name}
              </div>
            </div>

            {/* TBO Rate */}
            <div style={{
              fontSize: 13, fontWeight: 600, fontFamily: F.m,
              color: hasData ? C.text : C.textGhost, textAlign: "right",
            }}>
              {hasData && e.tboRate != null ? `${Math.round(e.tboRate * 100)}%` : "—"}
            </div>

            {/* CW Rate */}
            <div style={{
              fontSize: 13, fontWeight: 600, fontFamily: F.m,
              color: hasData && e.cwRate != null && e.cwRate > 0 ? C.accentDark : hasData ? C.text : C.textGhost,
              textAlign: "right",
            }}>
              {hasData && e.cwRate != null ? `${Math.round(e.cwRate * 100)}%` : "—"}
            </div>

            {/* Avg Days */}
            <div style={{
              fontSize: 13, fontWeight: 500, fontFamily: F.m,
              color: hasData ? C.textSec : C.textGhost, textAlign: "right",
            }}>
              {hasData && e.avgDaysToClose != null ? `${e.avgDaysToClose}d` : "—"}
            </div>

            {/* Demos */}
            <div style={{
              fontSize: 13, fontWeight: 500, fontFamily: F.m,
              color: hasData ? C.textSec : C.textGhost, textAlign: "right",
            }}>
              {e.demosInWindow}
            </div>

            {/* Composite Score */}
            <div style={{ textAlign: "right" }}>
              <span style={{
                display: "inline-block",
                padding: "2px 8px", borderRadius: 10,
                fontSize: 11, fontWeight: 700, fontFamily: F.m,
                background: hasData ? `${C.accent}15` : `${C.textGhost}12`,
                color: hasData ? C.accentDark : C.textGhost,
              }}>
                {hasData ? e.compositeScore.toFixed(2) : "—"}
              </span>
            </div>
          </div>
        );
      })}

      {/* Scoring footnote */}
      <div style={{
        padding: "10px 20px 14px",
        borderTop: `1px solid ${C.border}`,
        background: "rgba(0,0,0,0.02)",
        fontSize: 10, color: C.textGhost, fontFamily: F.b,
        fontStyle: "italic",
        lineHeight: 1.6,
      }}>
        Score = CW% x 0.45 + TBO% x 0.20 + Speed x 0.35 — where Speed = max(0, 1 - AvgDays/60). Higher is better.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO QUALITY INSIGHTS
// ═══════════════════════════════════════════════════════════════════════════════
function DemoQualityCard({ aeResults }: { aeResults: AEResult[] }) {
  const aesWithInsights = aeResults.filter((ae) => ae.transcriptInsights && ae.transcriptInsights.totalAnalyzed > 0);
  if (aesWithInsights.length === 0) return null;

  const colLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 500, color: C.textDim, fontFamily: F.b,
    letterSpacing: "0.08em", textTransform: "uppercase",
  };

  function talkColor(ratio: number | null): string {
    if (ratio == null) return C.textGhost;
    const pct = ratio * 100;
    if (pct <= 50) return C.accent;
    if (pct <= 60) return C.warn;
    return C.danger;
  }

  function sentLabel(ti: TranscriptMetrics): string {
    const total = ti.sentimentBreakdown.positive + ti.sentimentBreakdown.neutral + ti.sentimentBreakdown.negative;
    if (total === 0) return "—";
    const pctPos = Math.round((ti.sentimentBreakdown.positive / total) * 100);
    return `${pctPos}% pos`;
  }

  return (
    <div style={{
      marginTop: 12, borderRadius: 12,
      border: `1px solid ${C.primary}25`,
      background: C.card, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
        background: `${C.primary}06`,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: C.primary,
          fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase",
        }}>
          Demo Quality Insights
        </div>
        <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>
          Based on Fireflies transcripts
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "36px 1fr 72px 72px 72px 80px 80px",
        alignItems: "center", gap: 0,
        padding: "10px 20px 6px",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={colLabel}>#</div>
        <div style={colLabel}>Name</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Talk %</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Avg Dur.</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Sentiment</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Won Avg</div>
        <div style={{ ...colLabel, textAlign: "right" }}>Lost Avg</div>
      </div>

      {/* Rows */}
      {aesWithInsights.map((ae, i) => {
        const ti = ae.transcriptInsights!;
        return (
          <div key={ae.id} style={{
            display: "grid",
            gridTemplateColumns: "36px 1fr 72px 72px 72px 80px 80px",
            alignItems: "center", gap: 0,
            padding: "10px 20px",
            borderBottom: i < aesWithInsights.length - 1 ? `1px solid ${C.border}` : "none",
          }}>
            {/* Rank */}
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: `${C.textGhost}20`, color: C.textDim,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 700, fontFamily: F.m,
            }}>
              {i + 1}
            </div>

            {/* Name */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <div style={{
                width: 26, height: 26, borderRadius: "50%",
                background: `${ae.color}18`, border: `1.5px solid ${ae.color}40`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 700, color: ae.color, fontFamily: F.b,
                flexShrink: 0,
              }}>
                {ae.initials}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 500, color: C.text, fontFamily: F.b,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {ae.name}
              </div>
            </div>

            {/* Talk Ratio */}
            <div style={{
              fontSize: 13, fontWeight: 600, fontFamily: F.m,
              color: talkColor(ti.avgTalkRatio), textAlign: "right",
            }}>
              {ti.avgTalkRatio != null ? `${Math.round(ti.avgTalkRatio * 100)}%` : "—"}
            </div>

            {/* Avg Duration */}
            <div style={{
              fontSize: 13, fontWeight: 500, fontFamily: F.m,
              color: C.textSec, textAlign: "right",
            }}>
              {ti.avgDurationMinutes != null ? `${Math.round(ti.avgDurationMinutes)}m` : "—"}
            </div>

            {/* Sentiment */}
            <div style={{
              fontSize: 13, fontWeight: 500, fontFamily: F.m,
              color: C.textSec, textAlign: "right",
            }}>
              {sentLabel(ti)}
            </div>

            {/* Won Avg (talk ratio) */}
            <div style={{
              fontSize: 13, fontWeight: 600, fontFamily: F.m,
              color: ti.wonMetrics ? C.accentDark : C.textGhost, textAlign: "right",
            }}>
              {ti.wonMetrics?.avgTalkRatio != null
                ? `${Math.round(ti.wonMetrics.avgTalkRatio * 100)}% · ${ti.wonMetrics.avgDuration != null ? Math.round(ti.wonMetrics.avgDuration) + "m" : "—"}`
                : "—"}
            </div>

            {/* Lost Avg (talk ratio) */}
            <div style={{
              fontSize: 13, fontWeight: 600, fontFamily: F.m,
              color: ti.lostMetrics ? C.dangerMuted : C.textGhost, textAlign: "right",
            }}>
              {ti.lostMetrics?.avgTalkRatio != null
                ? `${Math.round(ti.lostMetrics.avgTalkRatio * 100)}% · ${ti.lostMetrics.avgDuration != null ? Math.round(ti.lostMetrics.avgDuration) + "m" : "—"}`
                : "—"}
            </div>
          </div>
        );
      })}

      {/* Summary footer */}
      <div style={{
        padding: "12px 20px",
        borderTop: `1px solid ${C.border}`,
        background: "rgba(0,0,0,0.02)",
        fontSize: 10, color: C.textGhost, fontFamily: F.b,
      }}>
        {aesWithInsights.reduce((s, ae) => s + (ae.transcriptInsights?.totalAnalyzed || 0), 0)} total calls analyzed across {aesWithInsights.length} rep{aesWithInsights.length !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEAL LIST MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function ExecDealListModal({ repName, closedWonDeals, optOutDeals, onClose }: {
  repName: string; closedWonDeals: DealDetail[]; optOutDeals: DealDetail[]; onClose: () => void;
}) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      backdropFilter: "blur(4px)",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
        boxShadow: "0 8px 40px rgba(0,0,0,.12)", width: "100%", maxWidth: 640,
        maxHeight: "80vh", display: "flex", flexDirection: "column" as const,
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px 14px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, fontFamily: F.d, letterSpacing: "-0.02em" }}>
            {repName} — Deal Breakdown
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.textGhost, padding: 4, lineHeight: 1 }}>×</button>
        </div>
        {/* Body - two columns */}
        <div style={{ overflow: "auto", padding: "16px 24px 24px", display: "flex", gap: 24 }}>
          {/* Closed Won column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 12 }}>
              Closed Won
            </div>
            {closedWonDeals.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textGhost, fontFamily: F.b, padding: "8px 0" }}>No deals</div>
            ) : (
              closedWonDeals.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: i < closedWonDeals.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, fontFamily: F.b, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {d.recordId ? (
                        <a href={`https://app.attio.com/finnyai-com/objects/deals/${d.recordId}`} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: C.text, textDecoration: "none", borderBottom: `1px dotted ${C.textGhost}` }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = C.primary)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = C.text)}
                        >{d.name}</a>
                      ) : d.name}
                    </div>
                    <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.m, marginTop: 2 }}>{d.closeDate}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, fontFamily: F.m, marginLeft: 8, flexShrink: 0 }}>{fmtK(d.value)}</div>
                </div>
              ))
            )}
            {closedWonDeals.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, borderTop: `1px solid ${C.borderMed}`, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, fontFamily: F.m }}>{fmt(closedWonDeals.reduce((s, d) => s + d.value, 0))}</span>
              </div>
            )}
          </div>
          {/* Divider */}
          <div style={{ width: 1, background: C.border, flexShrink: 0 }} />
          {/* Opt-Out column */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 12 }}>
              Prior Month Opt-Outs
            </div>
            {optOutDeals.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textGhost, fontFamily: F.b, padding: "8px 0" }}>None</div>
            ) : (
              optOutDeals.map((d, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "8px 0", borderBottom: i < optOutDeals.length - 1 ? `1px solid ${C.border}` : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: C.text, fontFamily: F.b, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                      {d.recordId ? (
                        <a href={`https://app.attio.com/finnyai-com/objects/deals/${d.recordId}`} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: C.text, textDecoration: "none", borderBottom: `1px dotted ${C.textGhost}` }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = C.primary)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = C.text)}
                        >{d.name}</a>
                      ) : d.name}
                    </div>
                    <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.m, marginTop: 2 }}>{d.closeDate}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.danger, fontFamily: F.m, marginLeft: 8, flexShrink: 0 }}>-{fmtK(d.value)}</div>
                </div>
              ))
            )}
            {optOutDeals.length > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 8, borderTop: `1px solid ${C.borderMed}`, marginTop: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.danger, fontFamily: F.m }}>-{fmt(optOutDeals.reduce((s, d) => s + d.value, 0))}</span>
              </div>
            )}
          </div>
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
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [funnelLeaderboard, setFunnelLeaderboard] = useState<FunnelLeaderboard | null>(null);
  const [dealModalAE, setDealModalAE] = useState<AEResult | null>(null);

  const [verification, setVerification] = useState<VerificationStatus | null>(null);
  const [startingVerification, setStartingVerification] = useState(false);

  const fetchVerification = useCallback(async (month: string) => {
    try {
      const res = await fetch(`/api/approval/status?month=${month}`);
      if (res.ok) setVerification(await res.json());
    } catch {}
  }, []);

  const handleStartVerification = useCallback(async () => {
    setStartingVerification(true);
    try {
      const res = await fetch("/api/approval/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: selectedMonth }),
      });
      if (res.ok) await fetchVerification(selectedMonth);
    } catch {}
    setStartingVerification(false);
  }, [selectedMonth, fetchVerification]);

  const fetchLive = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/commissions?live=true&month=${selectedMonth}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setAeResults(data.ae || []);
      setBdrResult(data.bdr || null);
      setForecast(data.forecast || null);
      setFunnelLeaderboard(data.funnelLeaderboard || null);
      setFetchedAt(data.meta?.fetchedAt || "");
      setMonthLabel(data.meta?.monthLabel || "");
      setWarning(data.meta?.warning || "");
      if (data.availableMonths) setAvailableMonths(data.availableMonths);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [selectedMonth]);

  useEffect(() => { if (isLive) { fetchLive(); fetchVerification(selectedMonth); } }, [isLive, fetchLive, fetchVerification, selectedMonth]);
  useEffect(() => { if (!isLive) return; const i = setInterval(fetchLive, 60000); return () => clearInterval(i); }, [isLive, fetchLive]);

  // ─── Computed KPIs ──────────────────────────────────────────────────────
  const totalNetARR = aeResults.reduce((s, r) => s + (r.netARR || 0), 0);
  const totalGrossARR = aeResults.reduce((s, r) => s + (r.grossARR || 0), 0);
  const totalOptOutARR = aeResults.reduce((s, r) => s + (r.optOutARR || 0), 0);
  const totalOptOutCount = aeResults.reduce((s, r) => s + (r.optOutCount || 0), 0);
  const totalQuota = aeResults.reduce((s, r) => s + r.monthlyQuota, 0);
  const totalDeals = aeResults.reduce((s, r) => s + (r.dealCount || 0), 0);
  const teamAttainment = totalQuota > 0 ? totalNetARR / totalQuota : 0;
  const totalComm = aeResults.reduce((s, r) => s + (r.commission || 0), 0) + (bdrResult?.commission || 0);
  const optOutRate = totalGrossARR > 0 ? totalOptOutARR / totalGrossARR : 0;
  const commAsPercent = totalNetARR > 0 ? totalComm / totalNetARR : 0;

  const sortedAEs = [...aeResults].sort((a, b) => (b.netARR || 0) - (a.netARR || 0));
  const pace = getExpectedPace(selectedMonth);

  const cwRateLabel = "CW RATE";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: F.b }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" />

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
              {/* FINNY Logo */}
              <img src="/logo.png" alt="FINNY" style={{ width: 36, height: 36, borderRadius: 8 }} />
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
            display: "flex", flexWrap: "wrap" as const, gap: 0,
            marginTop: 20,
            background: C.card,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
          }}>
            {[
              { label: "Net New ARR", value: fmt(totalNetARR) },
              { label: "% to Plan", value: fmtPct0(teamAttainment),
                sub: teamAttainment >= 1 ? "On track" : `${fmtK(Math.max(0, totalQuota - totalNetARR))} remaining`,
                accent: teamAttainment >= 1 },
              { label: "Total Commission", value: fmt(totalComm), accent: true },
              { label: "Prior Mo. CW Opt-Outs", value: fmtPct(optOutRate),
                sub: totalOptOutCount > 0 ? `${totalOptOutCount} deals · ${fmtK(totalOptOutARR)}` : "None" },
              { label: "Deals Closed", value: String(totalDeals) },
            ].map((kpi, i, arr) => (
              <div key={i} style={{
                flex: "1 1 0",
                padding: "20px 16px",
                borderRight: i < arr.length - 1 ? `1px solid ${C.border}` : "none",
                textAlign: "center" as const,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 500, color: C.textDim,
                  fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                  marginBottom: 8,
                }}>{kpi.label}</div>
                <div style={{
                  fontSize: 28, fontWeight: 700,
                  fontFamily: F.m, letterSpacing: "-0.03em",
                  color: kpi.accent ? C.accent : C.text,
                  lineHeight: 1,
                }}>{kpi.value}</div>
                {kpi.sub && (
                  <div style={{
                    fontSize: 11, color: C.textDim, fontFamily: F.b,
                    marginTop: 4,
                  }}>{kpi.sub}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ─── MONTH-END FORECAST ─────────────────────────────────── */}
        {isLive && forecast && aeResults.length > 0 && (
          <ForecastCard
            forecast={forecast}
            totalNetARR={totalNetARR}
            totalQuota={totalQuota}
          />
        )}

        {/* ─── UNCAPTURED DEMOS ALERT ────────────────────────────────── */}
        {isLive && (() => {
          const uncaptured = aeResults.flatMap((ae) =>
            (ae.uncapturedDemos || []).map((d) => ({ ...d, aeName: ae.name })),
          );
          if (uncaptured.length === 0) return null;
          return (
            <div style={{
              marginTop: 12, borderRadius: 12,
              border: `1px solid ${C.warn}30`,
              background: `${C.warn}08`,
              padding: "14px 20px",
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.warnMuted,
                fontFamily: F.b, letterSpacing: "0.06em", textTransform: "uppercase" as const,
                marginBottom: 8,
              }}>
                Uncaptured Demos — {uncaptured.length} meeting{uncaptured.length !== 1 ? "s" : ""} found in Fireflies but missing from Attio
              </div>
              <div style={{ fontSize: 11, color: C.textSec, fontFamily: F.b, lineHeight: 1.7 }}>
                {uncaptured.map((d, i) => (
                  <div key={i}>
                    <span style={{ fontWeight: 600 }}>{d.aeName}</span>
                    {" — "}
                    {d.date}: {d.title}
                    {d.durationMinutes != null && (
                      <span style={{ color: C.textGhost }}> ({d.durationMinutes}min)</span>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b, marginTop: 8 }}>
                These are Fireflies transcripts of 12+ minutes that have no matching demo_held_date in Attio. Update Attio to ensure accurate tracking.
              </div>
            </div>
          );
        })()}

        {/* ─── FUNNEL PROGRESSION LEADERBOARD ────────────────────────── */}
        {isLive && funnelLeaderboard && funnelLeaderboard.entries.length > 0 && (
          <FunnelLeaderboardCard leaderboard={funnelLeaderboard} />
        )}

        {/* ─── DEMO QUALITY INSIGHTS ─────────────────────────────────── */}
        {isLive && aeResults.length > 0 && (
          <DemoQualityCard aeResults={aeResults} />
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

        {/* ─── VERIFICATION STATUS ─────────────────────────────────── */}
        {isLive && (
          <div style={{
            marginTop: 12,
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            background: C.card,
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: C.textDim,
                fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                Deal Verification
              </div>
              {verification?.allApproved && (
                <div style={{
                  fontSize: 11, fontWeight: 600, color: C.accent,
                  fontFamily: F.b, display: "flex", alignItems: "center", gap: 4,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.accent, display: "inline-block" }} />
                  All Approved
                </div>
              )}
            </div>

            {!verification?.cycleStarted ? (
              <div style={{ padding: "20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, color: C.textSec, fontFamily: F.b }}>
                    No verification cycle for {monthLabel || selectedMonth}
                  </div>
                  <div style={{ fontSize: 11, color: C.textGhost, fontFamily: F.b, marginTop: 2 }}>
                    Start a cycle to have AEs review and approve their deal lists.
                  </div>
                </div>
                <button
                  onClick={handleStartVerification}
                  disabled={startingVerification}
                  style={{
                    padding: "8px 16px", borderRadius: 8,
                    border: `1px solid ${C.primary}40`,
                    background: C.primaryFaint,
                    color: C.primary,
                    cursor: startingVerification ? "not-allowed" : "pointer",
                    fontSize: 12, fontWeight: 600, fontFamily: F.b,
                    opacity: startingVerification ? 0.6 : 1,
                    whiteSpace: "nowrap" as const,
                  }}
                >
                  {startingVerification ? "Starting…" : "Start Verification"}
                </button>
              </div>
            ) : (
              <div style={{ padding: "16px 20px" }}>
                {/* Progress summary */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{
                    fontSize: 12, color: C.textSec, fontFamily: F.b,
                  }}>
                    {verification.approvals.filter((a) => a.approved).length} of {verification.approvals.length} AEs approved
                  </div>
                  <div style={{
                    flex: 1, height: 4, background: "rgba(0,0,0,0.06)",
                    borderRadius: 100, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 100,
                      width: `${verification.approvals.length > 0 ? (verification.approvals.filter((a) => a.approved).length / verification.approvals.length) * 100 : 0}%`,
                      background: verification.allApproved
                        ? C.accent
                        : `linear-gradient(90deg, ${C.primary}, ${C.primaryLight})`,
                      transition: "width 0.5s ease",
                    }} />
                  </div>
                </div>

                {/* Per-AE status */}
                {verification.approvals.map((a) => (
                  <div key={a.repId} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 0",
                    borderBottom: `1px solid ${C.border}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: 6,
                        background: a.approved ? `${C.accent}15` : "rgba(0,0,0,0.04)",
                        border: `1px solid ${a.approved ? `${C.accent}30` : "rgba(0,0,0,0.08)"}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, color: a.approved ? C.accent : C.textGhost,
                      }}>
                        {a.approved ? "✓" : "·"}
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 500, fontFamily: F.b,
                        color: a.approved ? C.text : C.textDim,
                      }}>{a.name}</span>
                    </div>
                    <span style={{
                      fontSize: 11, fontFamily: F.b,
                      color: a.approved ? C.accent : C.textGhost,
                    }}>
                      {a.approved && a.approvedAt
                        ? `Approved ${new Date(a.approvedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : "Pending"}
                    </span>
                  </div>
                ))}

                {/* Started at */}
                {verification.startedAt && (
                  <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b, marginTop: 10 }}>
                    Cycle started {new Date(verification.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </div>
                )}
              </div>
            )}
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
                Ranked by New ARR
              </div>
            </div>

            {/* ── AEs Subheader ── */}
            <div style={{
              display: "flex", alignItems: "center",
              padding: "10px 20px",
              background: "rgba(0,0,0,0.02)",
              borderBottom: `1px solid ${C.border}`,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: C.textDim,
                fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
              }}>
                Account Executives
              </div>
              <div style={{ flex: 1 }} />
              <div style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>
                {sortedAEs.length} rep{sortedAEs.length !== 1 ? "s" : ""}
              </div>
            </div>

            {/* AE rows */}
            {sortedAEs.map((ae) => (
              <div key={ae.id}>
                <PlanBar
                  name={ae.name}
                  initials={ae.initials}
                  actual={ae.netARR || 0}
                  grossARR={ae.grossARR || 0}
                  quota={ae.monthlyQuota}
                  att={ae.attainment || 0}
                  commission={ae.commission || 0}
                  deals={ae.dealCount || 0}
                  demoCount={ae.demoCount || 0}
                  introCallCount={ae.introCallCount || 0}
                  cwRate={ae.cwRate}
                  tboRate={ae.tboRate}
                  priorCwRate={ae.priorCwRate}
                  priorTboRate={ae.priorTboRate}
                  cwRateLabel={cwRateLabel}
                  optOutARR={ae.optOutARR}
                  optOutCount={ae.optOutCount}
                  type="ae"
                  pace={pace}
                  onClick={() => setDealModalAE(ae)}
                  forecastARR={forecast?.perAE[ae.id]?.projectedARR ?? null}
                />
                {ae.isRamping && ae.rampMonth != null && (
                  <div style={{
                    padding: "4px 20px 8px 64px",
                    marginTop: -8,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, fontFamily: F.b,
                      color: C.primary, background: C.primaryFaint,
                      padding: "2px 8px", borderRadius: 6,
                    }}>
                      Ramp Month {ae.rampMonth}/3
                    </span>
                    <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>
                      {Math.round((ae.rampFactor || 1) * 100)}% quota target ({fmtK(ae.monthlyQuota)} of {fmtK(ae.fullQuota || ae.monthlyQuota)})
                    </span>
                  </div>
                )}
              </div>
            ))}

            {/* Ramp footnote (if any AEs are ramping) */}
            {sortedAEs.some((ae) => ae.isRamping) && (
              <div style={{
                padding: "8px 20px 10px",
                fontSize: 10,
                color: C.textGhost,
                fontFamily: F.b,
                fontStyle: "italic",
                borderTop: `1px solid ${C.border}`,
              }}>
                New AE ramp schedule: Month 1 = 50% quota, Month 2 = 75% quota, Month 3+ = 100% quota. Commission tiers scale proportionally.
              </div>
            )}

            {/* ── BDRs Subheader + Row ── */}
            {bdrResult && (
              <>
                <div style={{
                  display: "flex", alignItems: "center",
                  padding: "10px 20px",
                  background: "rgba(0,0,0,0.02)",
                  borderBottom: `1px solid ${C.border}`,
                  borderTop: `1px solid ${C.borderMed}`,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 600, color: C.textDim,
                    fontFamily: F.b, letterSpacing: "0.08em", textTransform: "uppercase" as const,
                  }}>
                    Business Development
                  </div>
                </div>

                <BDRPlanBarWithTooltip
                  bdrResult={bdrResult}
                  pace={pace}
                />
              </>
            )}

            {/* Team total row */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 20px",
              background: "rgba(0,0,0,0.02)",
              borderTop: `1px solid ${C.borderMed}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: "rgba(0,0,0,0.05)",
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
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: F.m, color: attColor(teamAttainment, pace) }}>{fmtPct0(teamAttainment)}</div>
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
            {(() => {
              const teamProjMid = forecast ? totalNetARR + forecast.team.projectedARR.mid : totalNetARR;
              const teamProjHigh = forecast ? totalNetARR + forecast.team.projectedARR.high : totalNetARR;
              const barScale = 1.5; // bar shows up to 150% of quota
              const actualFillPct = Math.min(teamAttainment * 100, 150) / barScale;
              const projMidPct = forecast ? Math.min((teamProjMid / totalQuota) * 100, 150) / barScale : actualFillPct;
              const projHighPct = forecast ? Math.min((teamProjHigh / totalQuota) * 100, 150) / barScale : actualFillPct;

              return (
                <>
                  <div style={{ position: "relative", height: 40, background: "rgba(0,0,0,0.06)", borderRadius: 8, overflow: "hidden" }}>
                    {/* Quota fill (background) */}
                    <div style={{
                      position: "absolute", top: 0, left: 0, height: "100%",
                      width: "100%",
                      background: `repeating-linear-gradient(90deg, rgba(0,0,0,0.03) 0px, rgba(0,0,0,0.03) 1px, transparent 1px, transparent 20%)`,
                      borderRadius: 8,
                    }} />
                    {/* Forecast striped extension */}
                    {forecast && forecast.team.projectedARR.mid > 0 && (
                      <div style={{
                        position: "absolute", top: 0,
                        left: `${actualFillPct}%`,
                        height: "100%",
                        width: `${Math.max(projHighPct - actualFillPct, 0)}%`,
                        background: `repeating-linear-gradient(
                          -45deg,
                          ${C.primary}20,
                          ${C.primary}20 4px,
                          ${C.primary}08 4px,
                          ${C.primary}08 8px
                        )`,
                        borderRadius: "0 8px 8px 0",
                        transition: "all 0.8s cubic-bezier(0.4,0,0.2,1)",
                      }} />
                    )}
                    {/* Actual fill */}
                    <div style={{
                      position: "absolute", top: 0, left: 0, height: "100%",
                      width: `${actualFillPct}%`,
                      background: teamAttainment >= 1.0
                        ? `linear-gradient(90deg, ${C.primary}, ${C.accent})`
                        : `linear-gradient(90deg, ${C.primary}, ${C.primaryMuted})`,
                      borderRadius: actualFillPct >= projHighPct ? 8 : "8px 0 0 8px",
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
                      left: `${100 / barScale}%`,
                      top: 0, width: 2, height: "100%",
                      background: "rgba(0,0,0,0.2)",
                      zIndex: 2,
                    }} />
                    {/* Quota label */}
                    <div style={{
                      position: "absolute",
                      left: `${100 / barScale}%`,
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
                    {forecast && forecast.team.projectedARR.mid > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{
                          width: 10, height: 3, borderRadius: 2,
                          background: `repeating-linear-gradient(-45deg, ${C.primary}30, ${C.primary}30 2px, ${C.primary}10 2px, ${C.primary}10 4px)`,
                        }} />
                        <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>Projected: {fmtK(teamProjMid)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 10, height: 3, borderRadius: 2, background: "rgba(0,0,0,0.2)" }} />
                      <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>Quota</span>
                    </div>
                    {totalOptOutARR > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 10, height: 3, borderRadius: 2, background: C.warn }} />
                        <span style={{ fontSize: 10, color: C.textGhost, fontFamily: F.b }}>Opt-outs: {fmtK(totalOptOutARR)}</span>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

      </div>

      {/* ─── Deal list modal ────────────────────────────────────────── */}
      {dealModalAE && (
        <ExecDealListModal
          repName={dealModalAE.name}
          closedWonDeals={dealModalAE.closedWonDeals || []}
          optOutDeals={dealModalAE.optOutDeals || []}
          onClose={() => setDealModalAE(null)}
        />
      )}

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
