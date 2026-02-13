import { NextResponse } from "next/server";
import { AE_DATA, calcAECommission, calcBDRCommission } from "@/app/commission-config";

export const revalidate = 60;

const ATTIO = "https://api.attio.com/v2";

const OWNER_MAP: Record<string, string> = {
    [process.env.ATTIO_JASON_UUID || ""]: "jason",
    [process.env.ATTIO_AUSTIN_UUID || ""]: "austin",
    [process.env.ATTIO_KELCY_UUID || ""]: "kelcy",
    [process.env.ATTIO_MAX_UUID || ""]: "max",
};

async function query(obj: string, body: object) {
    const r = await fetch(`${ATTIO}/objects/${obj}/records/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.ATTIO_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          next: { revalidate: 60 },
    });
    if (!r.ok) {
          const errBody = await r.text();
          console.error(`Attio ${obj} query failed: ${r.status}`, errBody);
          throw new Error(`Attio ${obj} query failed: ${r.status} - ${errBody}`);
    }
    return r.json();
}

function val(record: any, slug: string): any {
    const v = record.values?.[slug];
    if (!v?.length) return null;
    const f = v[0];
    if (f.attribute_type === "currency") return f.currency_value || 0;
    if (f.attribute_type === "number") return f.value || 0;
    if (f.attribute_type === "text") return f.value || "";
    if (f.attribute_type === "status") return f.status?.title || "";
    if (f.attribute_type === "actor-reference") return f.referenced_actor_id || "";
    if (f.attribute_type === "record-reference") return v.map((x: any) => x.target_record_id);
    return f.value ?? f;
}

export async function GET() {
    try {
          // Query deals by stage only (standard Attio deal attributes).
      // NOTE: Update the stage values below to match YOUR workspace's configured statuses.
      // Default Attio stages: "Lead", "In Progress", "Won", "Lost"
      // Run: GET /v2/objects/deals/attributes  to see your workspace's actual attribute slugs.
      const { data: deals } = await query("deals", {
              filter: {
                        "$or": [
                          { stage: "Won" },
                          { stage: "To Be Onboarded" },
                          { stage: "Onboarded" },
                          { stage: "Closed Won" },
                                  ],
              },
              limit: 500,
      });

      // Filter deals client-side for February 2026
      const febStart = new Date("2026-02-01T00:00:00Z").getTime();
          const marStart = new Date("2026-03-01T00:00:00Z").getTime();
          const febDeals = (deals || []).filter((d: any) => {
                  const created = new Date(d.created_at).getTime();
                  return created >= febStart && created < marStart;
          });

      const personIds: string[] = [];
          for (const d of febDeals) {
                  const p = val(d, "associated_people");
                  if (Array.isArray(p)) personIds.push(...p);
          }

      const churned = new Set<string>();
          // Note: churn_reason is a custom attribute. If your workspace doesn't have it,
      // remove the churn_reason filter below and churned will remain empty.
      if (personIds.length > 0) {
              try {
                        const { data: cp } = await query("people", {
                                    filter: { $and: [{ record_id: { $in: [...new Set(personIds)] } }] },
                                    limit: 500,
                        });
                        // If you have a custom "churn_reason" attribute on people, uncomment below:
                // for (const p of cp || []) {
                //   if (val(p, "churn_reason")) churned.add(p.id.record_id);
                // }
              } catch (e) {
                        console.error("People query failed (non-fatal):", e);
              }
      }

      const agg: Record<string, { grossARR: number; churnARR: number; dealCount: number; excludedCount: number }> = {};
          for (const ae of AE_DATA) agg[ae.id] = { grossARR: 0, churnARR: 0, dealCount: 0, excludedCount: 0 };

      for (const d of febDeals) {
              const aeId = OWNER_MAP[val(d, "owner")];
              if (!aeId || !agg[aeId]) continue;
              const v = val(d, "value") || 0;
              const ppl = val(d, "associated_people") || [];
              const isChurned = Array.isArray(ppl) && ppl.some((id: string) => churned.has(id));
              if (isChurned) { agg[aeId].churnARR += v; agg[aeId].excludedCount += 1; }
              else { agg[aeId].grossARR += v; agg[aeId].dealCount += 1; }
      }

      const ae = AE_DATA.map((a) => {
              const g = agg[a.id];
              const { commission, attainment } = calcAECommission(a.monthlyQuota, a.tiers, g.grossARR);
              return { id: a.id, name: a.name, grossARR: g.grossARR + g.churnARR, churnARR: g.churnARR, netARR: g.grossARR, dealCount: g.dealCount, excludedCount: g.excludedCount, attainment, commission };
      });

      let maxMeetings = 0;
          for (const d of febDeals) {
                  if (val(d, "lead_owner") === process.env.ATTIO_MAX_UUID) maxMeetings++;
          }

      const { commission: bdrComm, attainment: bdrAtt } = calcBDRCommission(maxMeetings);

      return NextResponse.json({
              ae,
              bdr: { id: "max", name: "Max Zajec", totalMeetings: maxMeetings, netMeetings: maxMeetings, attainment: bdrAtt, commission: bdrComm },
              meta: { fetchedAt: new Date().toISOString(), dealCount: (febDeals || []).length },
      }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } });
    } catch (err: any) {
          console.error("Commission API error:", err);
          return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
