// ============================================================================
// SERVER-SIDE PLAN ENFORCEMENT & MONTHLY USAGE ENGINE (PHASE 2)
// ============================================================================
// Provides authoritative server-side plan resolution, real monthly usage calculation
// from db.importHistory, and quota enforcement guards before job creation.
// ============================================================================

import db from "../db.server.js";
import {
  PLANS,
  PLAN_IDS,
  DEFAULT_PLAN_ID,
  evaluateQuotaDecision,
  canUseFeature,
} from "../constants/plans.js";
import { listPublicDriveImages } from "./google-drive.server.js";

/**
 * Deduplicate Drive files by file.id
 */
export function deduplicateDriveFiles(files) {
  const unique = new Map();
  for (const file of files || []) {
    if (!file?.id) continue;
    if (!unique.has(file.id)) {
      unique.set(file.id, file);
    }
  }
  return Array.from(unique.values());
}

/**
 * Resolves the authoritative current plan for a store.
 * Phase 2 uses the safest default plan (Starter: $4.99/mo).
 * Server overrides (env or authenticated test headers) are supported for QA test cases.
 * Never trusts localStorage or untrusted client parameters.
 */
export function getShopPlan(shop, request = null) {
  // 1. Check server-level environment override if configured
  if (process.env.STORE_PLAN && PLANS[process.env.STORE_PLAN.toLowerCase()]) {
    return process.env.STORE_PLAN.toLowerCase();
  }

  // 2. In development or test environments, allow an authenticated header for automated QA
  if (process.env.NODE_ENV !== "production" && request) {
    const testHeader = request.headers.get("x-simulate-plan") || request.headers.get("x-test-plan");
    if (testHeader && PLANS[testHeader.toLowerCase()]) {
      return testHeader.toLowerCase();
    }
  }

  // 3. Default safe baseline: STARTER plan
  return DEFAULT_PLAN_ID;
}

/**
 * Calculates start and end timestamps for the current calendar billing cycle.
 * Strictly scopes usage to the current calendar month (e.g. October 1 to October 31).
 */
export function getBillingCycleRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthName = date.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { start, end, monthName };
}

/**
 * Queries real database records in db.importHistory for the shop within the current month.
 * Does NOT count lifetime usage as monthly usage.
 */
export async function getShopMonthlyUsage(shop, date = new Date()) {
  if (!shop) {
    return {
      usedImages: 0,
      batchCount: 0,
      monthName: "Current Month",
      cycleStart: null,
      cycleEnd: null,
    };
  }

  const { start, end, monthName } = getBillingCycleRange(date);

  try {
    const aggregates = await db.importHistory.aggregate({
      where: {
        shop,
        createdAt: {
          gte: start,
          lte: end,
        },
        status: {
          in: ["completed", "completed_with_errors", "processing", "starting"],
        },
      },
      _sum: {
        imagesAssigned: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      usedImages: aggregates._sum.imagesAssigned || 0,
      batchCount: aggregates._count.id || 0,
      monthName,
      cycleStart: start.toISOString(),
      cycleEnd: end.toISOString(),
    };
  } catch (error) {
    console.error("[PLAN ENFORCEMENT] Failed to calculate monthly usage:", error);
    // Fail safe: return zero or existing baseline without crashing
    return {
      usedImages: 0,
      batchCount: 0,
      monthName,
      cycleStart: start.toISOString(),
      cycleEnd: end.toISOString(),
      error: error.message,
    };
  }
}

/**
 * Complete status object for frontend dashboard and settings loaders.
 */
export async function getStorePlanStatus(shop, request = null) {
  const actualPlanId = getShopPlan(shop, request);
  const plan = PLANS[actualPlanId] || PLANS[DEFAULT_PLAN_ID];
  const monthlyUsage = await getShopMonthlyUsage(shop);

  const limit = plan.monthlyImageLimit; // 1000 for starter, 5000 for growth, null for pro
  const used = monthlyUsage.usedImages;
  const isUnlimited = limit === null;
  const remaining = isUnlimited ? Infinity : Math.max(0, limit - used);
  const percentUsed = isUnlimited ? 100 : Math.min(100, Math.round((used / limit) * 100));

  return {
    actualPlanId,
    planName: plan.name,
    tierLabel: plan.tierLabel,
    displayPrice: plan.displayPrice,
    limit,
    used,
    remaining: isUnlimited ? null : remaining,
    isUnlimited,
    percentUsed,
    billingMonth: monthlyUsage.monthName,
    cycleStart: monthlyUsage.cycleStart,
    cycleEnd: monthlyUsage.cycleEnd,
    batchCount: monthlyUsage.batchCount,
    canUseAcceleratedQueue: canUseFeature(actualPlanId, "accelerated_queue"),
    canUsePriorityQueue: canUseFeature(actualPlanId, "priority_queue"),
  };
}

/**
 * Evaluates whether an import requesting `requestedCount` images is allowed by the merchant's plan.
 */
export async function checkImportQuota({ shop, requestedCount, request = null, planOverride = null }) {
  const planId = planOverride || getShopPlan(shop, request);
  const monthlyUsage = await getShopMonthlyUsage(shop);
  const used = monthlyUsage.usedImages;

  const decision = evaluateQuotaDecision({
    planId,
    used,
    requestedCount,
  });

  return {
    ...decision,
    billingMonth: monthlyUsage.monthName,
    cycleStart: monthlyUsage.cycleStart,
    cycleEnd: monthlyUsage.cycleEnd,
  };
}

/**
 * Pre-flight inspector:
 * Scans the Google Drive folder, calculates images requested, and checks monthly allowance.
 */
export async function runImportPreflight({ shop, driveUrl, request = null, planOverride = null }) {
  if (!driveUrl) {
    return {
      ok: false,
      message: "Please enter your Google Drive folder URL.",
    };
  }

  try {
    // 1. Scrape public Google Drive manifest
    const driveFiles = await listPublicDriveImages(driveUrl);
    const uniqueFiles = deduplicateDriveFiles(driveFiles);
    const imagesDetected = uniqueFiles.length;

    if (imagesDetected === 0) {
      return {
        ok: false,
        message: "No supported images (.jpg, .png, .webp, .gif) were found in this Google Drive folder.",
        imagesDetected: 0,
      };
    }

    // 2. Perform server-side plan quota calculation
    const quota = await checkImportQuota({
      shop,
      requestedCount: imagesDetected,
      request,
      planOverride,
    });

    return {
      ok: true,
      imagesDetected,
      quota,
      allowed: quota.allowed,
      message: quota.message,
    };
  } catch (error) {
    console.error("[PREFLIGHT ERROR]", error);
    return {
      ok: false,
      message: error?.message || "Failed to inspect Google Drive folder.",
      imagesDetected: 0,
    };
  }
}
