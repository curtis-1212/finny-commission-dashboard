// SERVER-ONLY -- Verification cycle & approval state management via Upstash Redis.

import { Redis } from "@upstash/redis";
import { getActiveAEs } from "@/lib/commission-config";
import type { DealDetail } from "@/lib/deals";

// ─── Redis Client ────────────────────────────────────────────────────────────

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error("Missing KV_REST_API_URL or KV_REST_API_TOKEN env vars");
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ApprovalRecord {
  approved: boolean;
  approvedAt: string | null;
  dealSnapshot: DealDetail[];
  netARR: number;
  commission: number;
}

export interface VerificationCycle {
  startedAt: string;
  startedBy: string; // "cron" or exec email
  allApprovedAt: string | null;
  notifiedExec: boolean;
}

// ─── Key Helpers ─────────────────────────────────────────────────────────────

const cycleKey = (month: string) => `verification-cycle:${month}`;
const approvalKey = (month: string, repId: string) => `approval:${month}:${repId}`;

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

// ─── Cycle Management ────────────────────────────────────────────────────────

export async function getVerificationCycle(month: string): Promise<VerificationCycle | null> {
  const data = await getRedis().get<VerificationCycle>(cycleKey(month));
  return data ?? null;
}

/**
 * Start a verification cycle for the given month. Idempotent — if a cycle
 * already exists, returns it without resetting approvals.
 */
export async function startVerificationCycle(
  month: string,
  startedBy: string
): Promise<{ cycle: VerificationCycle; aeIds: string[]; alreadyExists: boolean }> {
  const existing = await getVerificationCycle(month);
  const activeAEs = getActiveAEs(month);
  const aeIds = activeAEs.map((ae) => ae.id);

  if (existing) {
    return { cycle: existing, aeIds, alreadyExists: true };
  }

  const cycle: VerificationCycle = {
    startedAt: new Date().toISOString(),
    startedBy,
    allApprovedAt: null,
    notifiedExec: false,
  };

  const r = getRedis();
  const pipeline = r.pipeline();

  pipeline.set(cycleKey(month), cycle, { ex: TTL_SECONDS });

  for (const aeId of aeIds) {
    const record: ApprovalRecord = {
      approved: false,
      approvedAt: null,
      dealSnapshot: [],
      netARR: 0,
      commission: 0,
    };
    pipeline.set(approvalKey(month, aeId), record, { ex: TTL_SECONDS });
  }

  await pipeline.exec();
  return { cycle, aeIds, alreadyExists: false };
}

// ─── Approval State ──────────────────────────────────────────────────────────

export async function getApprovalState(month: string, repId: string): Promise<ApprovalRecord | null> {
  const data = await getRedis().get<ApprovalRecord>(approvalKey(month, repId));
  return data ?? null;
}

export async function getAllApprovalStates(
  month: string
): Promise<{ repId: string; name: string; record: ApprovalRecord | null }[]> {
  const activeAEs = getActiveAEs(month);
  if (activeAEs.length === 0) return [];

  const r = getRedis();
  const pipeline = r.pipeline();
  for (const ae of activeAEs) {
    pipeline.get(approvalKey(month, ae.id));
  }
  const results = await pipeline.exec();

  return activeAEs.map((ae, i) => ({
    repId: ae.id,
    name: ae.name,
    record: (results[i] as ApprovalRecord) ?? null,
  }));
}

/**
 * Mark an AE as approved and freeze their deal snapshot.
 * Returns { allComplete: true } if every active AE is now approved.
 */
export async function submitApproval(
  month: string,
  repId: string,
  dealSnapshot: DealDetail[],
  netARR: number,
  commission: number
): Promise<{ allComplete: boolean }> {
  const r = getRedis();

  const record: ApprovalRecord = {
    approved: true,
    approvedAt: new Date().toISOString(),
    dealSnapshot,
    netARR,
    commission,
  };
  await r.set(approvalKey(month, repId), record, { ex: TTL_SECONDS });

  // Check if all AEs are now approved
  const allStates = await getAllApprovalStates(month);
  const allComplete = allStates.every((s) => s.record?.approved === true);

  if (allComplete) {
    const cycle = await getVerificationCycle(month);
    if (cycle && !cycle.allApprovedAt) {
      cycle.allApprovedAt = new Date().toISOString();
      await r.set(cycleKey(month), cycle, { ex: TTL_SECONDS });
    }
  }

  return { allComplete };
}

/**
 * Revoke an AE's approval. Only allowed if exec hasn't been notified yet.
 */
export async function revokeApproval(month: string, repId: string): Promise<{ success: boolean; reason?: string }> {
  const cycle = await getVerificationCycle(month);
  if (!cycle) return { success: false, reason: "No verification cycle found" };
  if (cycle.notifiedExec) return { success: false, reason: "Exec has already been notified" };

  const r = getRedis();

  // Reset this AE's approval
  const record: ApprovalRecord = {
    approved: false,
    approvedAt: null,
    dealSnapshot: [],
    netARR: 0,
    commission: 0,
  };
  await r.set(approvalKey(month, repId), record, { ex: TTL_SECONDS });

  // Clear allApprovedAt on cycle if it was set
  if (cycle.allApprovedAt) {
    cycle.allApprovedAt = null;
    await r.set(cycleKey(month), cycle, { ex: TTL_SECONDS });
  }

  return { success: true };
}

/**
 * Mark the cycle as exec-notified (after Slack notification sent).
 */
export async function markExecNotified(month: string): Promise<void> {
  const r = getRedis();
  const cycle = await getVerificationCycle(month);
  if (cycle) {
    cycle.notifiedExec = true;
    await r.set(cycleKey(month), cycle, { ex: TTL_SECONDS });
  }
}
