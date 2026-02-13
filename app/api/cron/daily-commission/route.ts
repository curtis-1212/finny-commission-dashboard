import { NextResponse } from "next/server";

// ─── AE / BDR Compensation Config ───────────────────────────────────────────
const AE_CONFIG = [
  {
    id: "jason",
    name: "Jason Vigilante",
    emoji: "🔵",
    monthlyQuota: 166666.67,
    tiers: [
      { ceiling: 1.0, rate: 0.09 },
      { ceiling: 1.2, rate: 0.11 },
      { ceiling: Infinity, rate: 0.13 },
    ],
    variable: 120000,
  },
  {
    id: "austin",
    name: "Austin Guest",
    emoji: "🟢",
    monthlyQuota: 166666.67,
    tiers: [
      { ceiling: 1.0, rate: 0.09 },
      { ceiling: 1.2, rate: 0.11 },
      { ceiling: Infinity, rate: 0.13 },
    ],
    variable: 120000,
  },
  {
    id: "kelcy",
    name: "Kelcy Koenig",
    emoji: "🟡",
    monthlyQuota: 150000,
    tiers: [
      { ceiling: 1.0, rate: 0.04 },
      { ceiling: 1.2, rate: 0.05 },
      { ceiling: Infinity, rate: 0.06 },
    ],
    variable: 72000,
  },
];

const BDR_CONFIG = {
  id: "max",
  name: "Max Zajec",
  emoji: "🟣",
  monthlyQuota: 15,
  perMeetingRate: 33,
  acceleratorRate: 40,
  acceleratorThreshold: 1.25,
  variable: 10000,
};

// ─── Attio API Helpers ──────────────────────────────────────────────────────
const ATTIO_BASE = "https://api.attio.com/v2";

async function attioQuery(objectSlug: string, body: object) {
  const res = await fetch(`${ATTIO_BASE}/objects/${objectSlug}/records/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ATTIO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Attio ${objectSlug} query failed (${res.status}): ${err}`);
  }
  return res.json();
}

// ─── Fetch February Deals from Attio ────────────────────────────────────────
// IMPORTANT: Update these attribute slugs to match YOUR Attio workspace.
// Run `GET /v2/objects/deals/attributes` to see your exact slugs.

async function fetchFebruaryDeals() {
  // Fetch all deals with a close date in February 2026 that are Closed Won or To Be Onboarded
  // Adjust the attribute slugs below to match your Attio workspace:
  //   - "close_date" → your close date attribute slug
  //   - "stage" → usually "stage" (system attribute)
  //   - "value" → usually "value" (system attribute)
  //   - "owner" → usually "owner" (system attribute)
  //   - "churn_reason" or similar → your churn tracking attribute on People

  const data = await attioQuery("deals", {
    filter: {
      $and: [
        { close_date: { $gte: "2026-02-01T00:00:00Z" } },
        { close_date: { $lt: "2026-03-01T00:00:00Z" } },
        {
          $or: [
            { stage: "Closed Won" },
            { stage: "To Be Onboarded" },
            { stage: "Onboarded" },
          ],
        },
      ],
    },
    limit: 500,
  });

  return data.data || [];
}

// ─── Fetch People with Churn Status ─────────────────────────────────────────

async function fetchChurnedPeople(personIds: string[]) {
  if (personIds.length === 0) return new Set<string>();

  // Query people who have a churn reason set
  // Adjust "churn_reason" to your actual attribute slug
  const data = await attioQuery("people", {
    filter: {
      $and: [
        { record_id: { $in: personIds } },
        { churn_reason: { $not_empty: true } },
      ],
    },
    limit: 500,
  });

  const churned = new Set<string>();
  for (const person of data.data || []) {
    churned.add(person.id.record_id);
  }
  return churned;
}

// ─── Extract Values from Attio Record ───────────────────────────────────────

function getAttrValue(record: any, slug: string): any {
  const vals = record.values?.[slug];
  if (!vals || vals.length === 0) return null;
  const v = vals[0];

  // Handle different attribute types
  if (v.attribute_type === "currency") return v.currency_value || 0;
  if (v.attribute_type === "number") return v.value || 0;
  if (v.attribute_type === "text") return v.value || "";
  if (v.attribute_type === "status") return v.status?.title || "";
  if (v.attribute_type === "actor-reference") return v.referenced_actor_id || "";
  if (v.attribute_type === "record-reference")
    return vals.map((r: any) => r.target_record_id);
  if (v.attribute_type === "date" || v.attribute_type === "timestamp")
    return v.value || v.original_date_value || "";

  return v.value ?? v;
}

// ─── Commission Calculation ─────────────────────────────────────────────────

function calcAECommission(
  quota: number,
  tiers: { ceiling: number; rate: number }[],
  netARR: number
) {
  const attainment = netARR / quota;
  let commission = 0;

  for (let i = 0; i < tiers.length; i++) {
    const prevCeiling = i === 0 ? 0 : tiers[i - 1].ceiling;
    if (attainment <= prevCeiling) continue;
    const cappedAttainment = Math.min(attainment, tiers[i].ceiling);
    commission += (cappedAttainment - prevCeiling) * quota * tiers[i].rate;
  }

  return { commission, attainment };
}

function calcBDRCommission(netMeetings: number) {
  const bdr = BDR_CONFIG;
  const attainment = netMeetings / bdr.monthlyQuota;
  let commission: number;

  if (attainment <= bdr.acceleratorThreshold) {
    commission = netMeetings * bdr.perMeetingRate;
  } else {
    const baseMeetings = Math.floor(bdr.monthlyQuota * bdr.acceleratorThreshold);
    commission =
      baseMeetings * bdr.perMeetingRate +
      (netMeetings - baseMeetings) * bdr.acceleratorRate;
  }

  return { commission, attainment };
}

// ─── Build Slack Message ────────────────────────────────────────────────────

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("en-US");
}
function pct(n: number) {
  return (n * 100).toFixed(1) + "%";
}

function buildSlackBlocks(
  aeResults: {
    name: string;
    emoji: string;
    grossARR: number;
    churnARR: number;
    netARR: number;
    dealCount: number;
    attainment: number;
    commission: number;
    monthlyTarget: number;
  }[],
  bdrResult: {
    name: string;
    emoji: string;
    totalMeetings: number;
    netMeetings: number;
    attainment: number;
    commission: number;
    monthlyTarget: number;
  }
) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const totalNetARR = aeResults.reduce((s, r) => s + r.netARR, 0);
  const totalCommission =
    aeResults.reduce((s, r) => s + r.commission, 0) + bdrResult.commission;

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `📊 February Commission Update — ${today}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Team Totals:*  Net ARR: *${fmt(totalNetARR)}*  |  Total Commission: *${fmt(totalCommission)}*`,
      },
    },
    { type: "divider" },
  ];

  // AE sections
  for (const ae of aeResults) {
    const vsTarget = ae.commission - ae.monthlyTarget;
    const bar = progressBar(ae.attainment);
    const statusEmoji =
      ae.attainment >= 1.2 ? "🔥" : ae.attainment >= 1.0 ? "✅" : ae.attainment >= 0.7 ? "📈" : "⏳";

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `${ae.emoji} *${ae.name}*  ${statusEmoji}`,
          `${bar}  *${pct(ae.attainment)}* attainment`,
          `Gross ARR: ${fmt(ae.grossARR)}  →  Net: *${fmt(ae.netARR)}*  (${ae.dealCount} deals, ${fmt(ae.churnARR)} churned)`,
          `Commission: *${fmt(ae.commission)}*  |  vs Target: ${vsTarget >= 0 ? "+" : ""}${fmt(vsTarget)}`,
        ].join("\n"),
      },
    });
  }

  blocks.push({ type: "divider" });

  // BDR section
  const bdrVsTarget = bdrResult.commission - bdrResult.monthlyTarget;
  const bdrBar = progressBar(bdrResult.attainment);
  const bdrStatus =
    bdrResult.attainment >= 1.25 ? "⚡" : bdrResult.attainment >= 1.0 ? "✅" : "⏳";

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: [
        `${bdrResult.emoji} *${bdrResult.name}* (BDR)  ${bdrStatus}`,
        `${bdrBar}  *${pct(bdrResult.attainment)}* attainment`,
        `Meetings: *${bdrResult.netMeetings}* / ${BDR_CONFIG.monthlyQuota} target`,
        `Commission: *${fmt(bdrResult.commission)}*  |  vs Target: ${bdrVsTarget >= 0 ? "+" : ""}${fmt(bdrVsTarget)}`,
      ].join("\n"),
    },
  });

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `Data pulled from Attio at ${new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York" })} ET`,
      },
    ],
  });

  return blocks;
}

function progressBar(attainment: number): string {
  const filled = Math.min(Math.round(attainment * 10), 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

// ─── Post to Slack ──────────────────────────────────────────────────────────

async function postToSlack(blocks: any[]) {
  const res = await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blocks }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Slack post failed (${res.status}): ${err}`);
  }
}

// ─── Main Cron Handler ──────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Verify cron secret (Vercel sends this header for cron jobs)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch February deals from Attio
    const deals = await fetchFebruaryDeals();

    // 2. Collect associated person IDs for churn lookup
    const allPersonIds: string[] = [];
    for (const deal of deals) {
      const people = getAttrValue(deal, "associated_people");
      if (Array.isArray(people)) allPersonIds.push(...people);
    }
    const churnedPeople = await fetchChurnedPeople([...new Set(allPersonIds)]);

    // 3. Map deal owners to AE names
    //    You'll need to populate this mapping with your workspace member UUIDs.
    //    Run GET /v2/workspace_members to find each person's UUID.
    const OWNER_MAP: Record<string, string> = {
      // "workspace-member-uuid": "ae-config-id"
      // Example:
      // "50cf242c-7fa3-4cad-87d0-75b1af71c57b": "jason",
      // "a1b2c3d4-e5f6-7890-abcd-ef1234567890": "austin",
      // "d4e5f6a7-b8c9-0123-4567-89abcdef0123": "kelcy",
      [process.env.ATTIO_JASON_UUID || "JASON_UUID"]: "jason",
      [process.env.ATTIO_AUSTIN_UUID || "AUSTIN_UUID"]: "austin",
      [process.env.ATTIO_KELCY_UUID || "KELCY_UUID"]: "kelcy",
    };

    // 4. Aggregate deals per AE
    const aeAgg: Record<string, { grossARR: number; churnARR: number; dealCount: number; excludedCount: number }> = {
      jason: { grossARR: 0, churnARR: 0, dealCount: 0, excludedCount: 0 },
      austin: { grossARR: 0, churnARR: 0, dealCount: 0, excludedCount: 0 },
      kelcy: { grossARR: 0, churnARR: 0, dealCount: 0, excludedCount: 0 },
    };

    for (const deal of deals) {
      const ownerUUID = getAttrValue(deal, "owner");
      const aeId = OWNER_MAP[ownerUUID];
      if (!aeId || !aeAgg[aeId]) continue;

      const dealValue = getAttrValue(deal, "value") || 0;
      const associatedPeople = getAttrValue(deal, "associated_people") || [];

      // Check if any associated person has churned
      const isChurned = Array.isArray(associatedPeople) &&
        associatedPeople.some((pid: string) => churnedPeople.has(pid));

      if (isChurned) {
        aeAgg[aeId].churnARR += dealValue;
        aeAgg[aeId].excludedCount += 1;
      } else {
        aeAgg[aeId].grossARR += dealValue;
        aeAgg[aeId].dealCount += 1;
      }
    }

    // 5. Calculate commissions
    const aeResults = AE_CONFIG.map((ae) => {
      const agg = aeAgg[ae.id];
      const netARR = agg.grossARR; // churn already excluded from gross
      const { commission, attainment } = calcAECommission(ae.monthlyQuota, ae.tiers, netARR);
      return {
        name: ae.name,
        emoji: ae.emoji,
        grossARR: agg.grossARR + agg.churnARR,
        churnARR: agg.churnARR,
        netARR,
        dealCount: agg.dealCount,
        attainment,
        commission,
        monthlyTarget: ae.variable / 12,
      };
    });

    // 6. BDR metrics for Max
    //    For Max's meetings, you'll query a different attribute — likely "Demo Held Date"
    //    on deals where Max is the Lead Owner. Adjust this logic to match your Attio setup.
    //    This is a placeholder that counts deals where Max is the lead owner.

    let maxMeetings = 0;
    // Option A: Count from deals data (if demo_held_date is on the deals object)
    // Option B: Query a separate meetings/activities object
    // For now, using a simple ENV override or counting from deals:
    for (const deal of deals) {
      // Check if "lead_owner" attribute matches Max
      // Adjust the attribute slug and UUID to your workspace
      const leadOwner = getAttrValue(deal, "lead_owner");
      if (leadOwner === process.env.ATTIO_MAX_UUID) {
        maxMeetings += 1;
      }
    }

    const { commission: bdrCommission, attainment: bdrAttainment } =
      calcBDRCommission(maxMeetings);

    const bdrResult = {
      name: BDR_CONFIG.name,
      emoji: BDR_CONFIG.emoji,
      totalMeetings: maxMeetings,
      netMeetings: maxMeetings,
      attainment: bdrAttainment,
      commission: bdrCommission,
      monthlyTarget: BDR_CONFIG.variable / 12,
    };

    // 7. Build and post Slack message
    const blocks = buildSlackBlocks(aeResults, bdrResult);
    await postToSlack(blocks);

    return NextResponse.json({
      success: true,
      summary: {
        totalNetARR: aeResults.reduce((s, r) => s + r.netARR, 0),
        totalCommission: aeResults.reduce((s, r) => s + r.commission, 0) + bdrCommission,
        aeCount: aeResults.length,
        dealCount: deals.length,
      },
    });
  } catch (error: any) {
    console.error("Commission cron error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
