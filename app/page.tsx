"use client";
import { useState, useEffect } from "react";
import { AE_DATA, BDR_DATA, calcAECommission, calcBDRCommission, fmt, fmtPct } from "./commission-config";

type AEIn = { grossDeals: number; churnARR: number; nonConverting: number; dealCount: number; excludedCount: number };
type BDRIn = { totalMeetings: number; disqualified: number; existingCustomers: number; dealsCreated: number };

function Ring({ pct, color, size = 88 }: { pct: number; color: string; size?: number }) {
  const s = 5, r = (size - s * 2) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={s} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={s}
        strokeDasharray={c} strokeDashoffset={c - Math.min(pct, 1.5) * c} strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }} />
    </svg>
  );
}

function Inp({ label, value, onChange, prefix = "$", small }: { label: string; value: number; onChange: (v: number) => void; prefix?: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11, color: "#94A3B8", fontFamily: "var(--sans)", letterSpacing: "0.02em" }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 10px", gap: 4 }}>
        {prefix && <span style={{ fontSize: 13, color: "#64748B", fontFamily: "var(--mono)" }}>{prefix}</span>}
        <input type="number" value={value} onChange={e => onChange(Number(e.target.value) || 0)}
          style={{ background: "transparent", border: "none", outline: "none", color: "#F1F5F9", fontSize: small ? 14 : 16, fontFamily: "var(--mono)", width: "100%" }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div>
    <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600, color: "#CBD5E1", fontFamily: "var(--mono)" }}>{value}</div>
  </div>;
}

function AECard({ ae, inp, set }: { ae: typeof AE_DATA[0]; inp: AEIn; set: (v: AEIn) => void }) {
  const net = inp.grossDeals - inp.churnARR - inp.nonConverting;
  const { commission, attainment, tierBreakdown } = calcAECommission(ae.monthlyQuota, ae.tiers, net);
  const vs = commission - ae.variable / 12;
  return (
    <div style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", gap: 24, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: ae.color, opacity: 0.05, filter: "blur(40px)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${ae.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: ae.color, fontFamily: "var(--sans)", border: `1px solid ${ae.color}30` }}>{ae.initials}</div>
          <div><div style={{ fontSize: 17, fontWeight: 600, color: "#F1F5F9", fontFamily: "var(--sans)" }}>{ae.name}</div><div style={{ fontSize: 12, color: "#64748B" }}>{ae.role}</div></div>
        </div>
        <div style={{ textAlign: "center", position: "relative" }}>
          <Ring pct={attainment} color={ae.color} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 16, fontWeight: 700, color: attainment >= 1 ? "#10B981" : "#F1F5F9", fontFamily: "var(--mono)" }}>{fmtPct(attainment)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)" }}>
        <Stat label="Monthly Quota" value={fmt(ae.monthlyQuota)} />
        <Stat label="OTE" value={fmt(ae.ote)} />
        <Stat label="Base / Variable" value={`${fmt(ae.baseSalary/1000)}K/${fmt(ae.variable/1000)}K`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Inp label="Gross Closed/Won ARR" value={inp.grossDeals} onChange={v => set({ ...inp, grossDeals: v })} />
        <Inp label="Less: Churned/Opted-Out" value={inp.churnARR} onChange={v => set({ ...inp, churnARR: v })} />
        <Inp label="Less: Non-Converting" value={inp.nonConverting} onChange={v => set({ ...inp, nonConverting: v })} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: `${ae.color}08`, borderRadius: 10, border: `1px solid ${ae.color}15` }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Net Commissionable ARR</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: ae.color, fontFamily: "var(--mono)" }}>{fmt(net)}</div>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <Inp label="Deals" value={inp.dealCount} onChange={v => set({ ...inp, dealCount: v })} prefix="" small />
          <Inp label="Excluded" value={inp.excludedCount} onChange={v => set({ ...inp, excludedCount: v })} prefix="" small />
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Commission Breakdown</div>
        {tierBreakdown.map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: t.amount > 0 ? "rgba(255,255,255,0.03)" : "transparent", borderRadius: 8, border: t.amount > 0 ? "1px solid rgba(255,255,255,0.05)" : "1px solid transparent" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: t.amount > 0 ? ae.color : "#475569", fontFamily: "var(--mono)", fontWeight: 600, minWidth: 42 }}>{(t.rate * 100).toFixed(0)}%</span>
              <span style={{ fontSize: 13, color: t.amount > 0 ? "#CBD5E1" : "#475569", fontFamily: "var(--sans)" }}>{t.label}</span>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: t.amount > 0 ? "#F1F5F9" : "#334155", fontFamily: "var(--mono)" }}>{fmt(t.amount)}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: attainment >= 1 ? "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))" : "rgba(255,255,255,0.03)", borderRadius: 12, border: attainment >= 1 ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>February Total Commission</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "var(--mono)" }}>{fmt(commission)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>vs. Monthly Target</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: vs >= 0 ? "#10B981" : "#EF4444" }}>{vs >= 0 ? "+" : ""}{fmt(vs)}</div>
        </div>
      </div>
    </div>
  );
}

function BDRCard({ inp, set }: { inp: BDRIn; set: (v: BDRIn) => void }) {
  const bdr = BDR_DATA;
  const net = inp.totalMeetings - inp.disqualified - inp.existingCustomers;
  const { commission, attainment } = calcBDRCommission(net);
  const vs = commission - bdr.monthlyTargetVariable;
  return (
    <div style={{ background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.8))", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 28, display: "flex", flexDirection: "column", gap: 24, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: bdr.color, opacity: 0.05, filter: "blur(40px)" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${bdr.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, color: bdr.color, fontFamily: "var(--sans)", border: `1px solid ${bdr.color}30` }}>{bdr.initials}</div>
          <div><div style={{ fontSize: 17, fontWeight: 600, color: "#F1F5F9", fontFamily: "var(--sans)" }}>{bdr.name}</div><div style={{ fontSize: 12, color: "#64748B" }}>{bdr.role} · Month 2 Ramp</div></div>
        </div>
        <div style={{ textAlign: "center", position: "relative" }}>
          <Ring pct={attainment} color={bdr.color} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 16, fontWeight: 700, color: attainment >= 1 ? "#10B981" : "#F1F5F9", fontFamily: "var(--mono)" }}>{fmtPct(attainment)}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, padding: "12px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.04)" }}>
        <Stat label="Monthly Target" value="15 meetings" />
        <Stat label="Per Meeting" value={fmt(bdr.perMeetingRate)} />
        <Stat label="Accelerator" value={`${fmt(bdr.acceleratorRate)} @ 125%+`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        <Inp label="Total Meetings Held" value={inp.totalMeetings} onChange={v => set({ ...inp, totalMeetings: v })} prefix="" />
        <Inp label="Less: Disqualified" value={inp.disqualified} onChange={v => set({ ...inp, disqualified: v })} prefix="" />
        <Inp label="Less: Existing Customers" value={inp.existingCustomers} onChange={v => set({ ...inp, existingCustomers: v })} prefix="" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: `${bdr.color}08`, borderRadius: 10, border: `1px solid ${bdr.color}15` }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Net Qualified Meetings</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: bdr.color, fontFamily: "var(--mono)" }}>{net}</div>
        </div>
        <Inp label="Deals Created" value={inp.dealsCreated} onChange={v => set({ ...inp, dealsCreated: v })} prefix="" small />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: attainment >= 1 ? "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))" : "rgba(255,255,255,0.03)", borderRadius: 12, border: attainment >= 1 ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(255,255,255,0.06)" }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>February Total Commission</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#F1F5F9", fontFamily: "var(--mono)" }}>{fmt(commission)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#64748B", fontFamily: "var(--sans)", letterSpacing: "0.06em", textTransform: "uppercase" }}>vs. Target Variable</div>
          <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: vs >= 0 ? "#10B981" : "#EF4444" }}>{vs >= 0 ? "+" : ""}{fmt(vs)}</div>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const allReps = [...AE_DATA, { ...BDR_DATA, tiers: [] } as any];
  const [tab, setTab] = useState("jason");
  const [inp, setInp] = useState<any>({
    jason: { grossDeals: 0, churnARR: 0, nonConverting: 0, dealCount: 0, excludedCount: 0 },
    austin: { grossDeals: 0, churnARR: 0, nonConverting: 0, dealCount: 0, excludedCount: 0 },
    kelcy: { grossDeals: 0, churnARR: 0, nonConverting: 0, dealCount: 0, excludedCount: 0 },
    max: { totalMeetings: 0, disqualified: 0, existingCustomers: 0, dealsCreated: 0 },
  });
  const [live, setLive] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    const go = async () => {
      try {
        const r = await fetch("/api/commissions");
        if (!r.ok) { setErr(`API returned ${r.status}`); return; }
        const d = await r.json();
        if (d.error) { setErr(d.error); return; }
        setErr(null);
        const n: any = { ...inp };
        for (const ae of d.ae) n[ae.id] = { grossDeals: ae.grossARR, churnARR: ae.churnARR, nonConverting: 0, dealCount: ae.dealCount, excludedCount: ae.excludedCount };
        n.max = { totalMeetings: d.bdr.totalMeetings, disqualified: 0, existingCustomers: 0, dealsCreated: 0 };
        setInp(n);
        setLastSync(new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" }));
      } catch (e: any) { setErr(e.message); }
    };
    go();
    const iv = setInterval(go, 60000);
    return () => clearInterval(iv);
  }, [live]);

  const cur = allReps.find(a => a.id === tab)!;
  const totalNet = AE_DATA.reduce((s, ae) => { const i = inp[ae.id] as AEIn; return s + i.grossDeals - i.churnARR - i.nonConverting; }, 0);
  const totalComm = AE_DATA.reduce((s, ae) => { const i = inp[ae.id] as AEIn; return s + calcAECommission(ae.monthlyQuota, ae.tiers, i.grossDeals - i.churnARR - i.nonConverting).commission; }, 0)
    + calcBDRCommission((inp.max as BDRIn).totalMeetings - (inp.max as BDRIn).disqualified - (inp.max as BDRIn).existingCustomers).commission;

  return (
    <div style={{ minHeight: "100vh", background: "#0B1120", fontFamily: "var(--sans)", color: "#F1F5F9", ["--sans" as any]: "'DM Sans', sans-serif", ["--mono" as any]: "'DM Mono', monospace" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <div style={{ padding: "28px 32px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(15,23,42,1) 0%, rgba(11,17,32,1) 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <button onClick={() => setLive(!live)} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", color: live ? "#10B981" : "#64748B", background: live ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", padding: "3px 8px", borderRadius: 4, border: live ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(255,255,255,0.08)" }}>
                {live ? "● LIVE" : "○ MANUAL"}
              </button>
              <span style={{ fontSize: 12, color: "#475569" }}>February 2026{lastSync ? ` · Synced ${lastSync} ET` : ""}</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Monthly Commission Tracker</h1>
            <p style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>FINNY · Sales Team Quota Calculator</p>
            {err && <p style={{ fontSize: 12, color: "#EF4444", marginTop: 6 }}>⚠ {err}</p>}
          </div>
          <div style={{ display: "flex", gap: 20, textAlign: "right" }}>
            <div>
              <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" }}>Total Net ARR</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)" }}>{fmt(totalNet)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#64748B", letterSpacing: "0.06em", textTransform: "uppercase" }}>Total Commission</div>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "var(--mono)", color: "#10B981" }}>{fmt(totalComm)}</div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {allReps.map(r => (
            <button key={r.id} onClick={() => setTab(r.id)} style={{ padding: "8px 18px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontSize: 13, fontWeight: tab === r.id ? 600 : 500, fontFamily: "var(--sans)", background: tab === r.id ? "rgba(255,255,255,0.06)" : "transparent", color: tab === r.id ? r.color : "#64748B", borderBottom: tab === r.id ? `2px solid ${r.color}` : "2px solid transparent" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: r.color, marginRight: 8, opacity: tab === r.id ? 1 : 0.3 }} />
              {r.name.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "24px 32px", maxWidth: 720, margin: "0 auto" }}>
        {cur.type === "ae"
          ? <AECard ae={cur as typeof AE_DATA[0]} inp={inp[cur.id] as AEIn} set={v => setInp({ ...inp, [cur.id]: v })} />
          : <BDRCard inp={inp.max as BDRIn} set={v => setInp({ ...inp, max: v })} />}
        <div style={{ marginTop: 16, padding: "14px 18px", borderRadius: 12, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", fontSize: 11, color: "#475569", fontFamily: "var(--sans)", lineHeight: 1.6 }}>
          {cur.type === "ae"
            ? <><strong style={{ color: "#64748B" }}>Rate Card:</strong> {(cur as typeof AE_DATA[0]).tiers.map((t, i) => <span key={i}>{t.label}: {(t.rate * 100).toFixed(0)}%{i < (cur as typeof AE_DATA[0]).tiers.length - 1 ? " · " : ""}</span>)} · Monthly Quota: {fmt((cur as typeof AE_DATA[0]).monthlyQuota)} · Annual: {fmt((cur as typeof AE_DATA[0]).annualQuota)}</>
            : <><strong style={{ color: "#64748B" }}>Rate Card:</strong> {fmt(BDR_DATA.perMeetingRate)}/meeting · {fmt(BDR_DATA.acceleratorRate)}/meeting at 125%+ · 15/month target</>}
        </div>
      </div>
    </div>
  );
}
