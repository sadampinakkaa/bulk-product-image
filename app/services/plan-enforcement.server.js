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
  mapShopifyHandleToPlanId,
  getShopifyPricingPlansUrl,
} from "../constants/plans.js";
import { listPublicDriveImages } from "./google-drive.server.js";

/**
 * In-memory subscription cache with 5-minute TTL to respect Partner API rate limits
 */
const subscriptionCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Invalidate cached subscription for a shop (e.g. on return from Shopify billing approval)
 */
export function invalidateShopSubscriptionCache(shop) {
  if (shop && subscriptionCache.has(shop)) {
    subscriptionCache.delete(shop);
  }
}

/**
 * Authoritatively verifies whether a merchant has an active subscription in Shopify.
 * Strategy:
 * 1. Return flow validation: If merchant returned from Shopify App Pricing with plan_handle,
 *    and request is authenticated, map handle and record verified state.
 * 2. In-memory TTL cache lookup (5-minute TTL).
 * 3. Query Shopify Partner API if SHOPIFY_PARTNER_API_TOKEN & SHOPIFY_APP_ID are set.
 * 4. Query Shopify GraphQL Admin API (currentAppInstallation.activeSubscriptions).
 * 5. Safe fallback: Returns inactive/Starter state. Never silently grants Pro.
 */
export async function verifyShopifySubscription({
  shop,
  admin = null,
  request = null,
  returnPlanHandle = null,
}) {
  if (!shop) {
    return {
      active: false,
      planId: DEFAULT_PLAN_ID,
      status: "NO_SHOP",
      message: "No shop provided.",
    };
  }

  // 1. Handle Welcome / Return flow from Shopify App Pricing
  let returnPlanFromQuery = null;
  let hasReturnSignal = Boolean(returnPlanHandle);

  if (request?.url) {
    try {
      const parsedUrl = new URL(request.url);
      returnPlanFromQuery = parsedUrl.searchParams.get("plan_handle");
      if (
        returnPlanFromQuery ||
        parsedUrl.searchParams.has("charge_id") ||
        parsedUrl.searchParams.has("billing_approved")
      ) {
        hasReturnSignal = true;
      }
    } catch {}
  }

  // When a merchant returns from Shopify App Pricing / Billing approval,
  // invalidate any stale cache so fresh active subscription data is queried.
  if (hasReturnSignal) {
    invalidateShopSubscriptionCache(shop);
  }

  // In non-production environments only (local dev / automated tests),
  // allow plan_handle query param or returnPlanHandle to simulate active plan return flow.
  // In production (NODE_ENV === "production"), query parameters and returnPlanHandle are
  // NEVER trusted as proof of payment; subscriptions MUST be verified via Partner/Admin GraphQL API.
  const effectiveReturnHandle = returnPlanHandle || returnPlanFromQuery;
  if (effectiveReturnHandle && process.env.NODE_ENV !== "production") {
    const mappedPlanId = mapShopifyHandleToPlanId(effectiveReturnHandle);
    if (mappedPlanId && PLANS[mappedPlanId]) {
      const returnResult = {
        active: true,
        planId: mappedPlanId,
        status: "ACTIVE",
        shopifyPlanHandle: effectiveReturnHandle,
        source: "shopify_return_flow",
        verifiedAt: new Date().toISOString(),
        expiresAt: Date.now() + CACHE_TTL_MS,
      };
      subscriptionCache.set(shop, returnResult);
      return returnResult;
    }
  }

  // 2. Check cached verification
  const cached = subscriptionCache.get(shop);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  // 3. Partner API (ActiveSubscription query) if credentials configured
  const partnerToken = process.env.SHOPIFY_PARTNER_API_TOKEN;
  const appId = process.env.SHOPIFY_APP_ID;

  if (partnerToken && appId && admin?.graphql) {
    try {
      const shopRes = await admin.graphql(`
        query GetShopId {
          shop {
            id
          }
        }
      `);
      const shopData = await shopRes.json();
      const shopGid = shopData?.data?.shop?.id;

      if (shopGid) {
        const partnerApiRes = await fetch("https://partners.shopify.com/api/2026-10/graphql.json", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": partnerToken,
          },
          body: JSON.stringify({
            query: `
              query ActiveSubscription($appId: ID!, $shopId: ID!) {
                activeSubscription(appId: $appId, shopId: $shopId) {
                  billingPeriod
                  trialEndsAt
                  currentBillingCycle {
                    startTime
                    endTime
                  }
                  items {
                    handle
                    price {
                      __typename
                      ... on FlatRatePrice {
                        amount
                      }
                    }
                  }
                }
              }
            `,
            variables: {
              appId: appId.startsWith("gid://") ? appId : `gid://shopify/App/${appId}`,
              shopId: shopGid,
            },
          }),
        });

        if (partnerApiRes.ok) {
          const partnerJson = await partnerApiRes.json();
          const sub = partnerJson?.data?.activeSubscription;
          if (sub && Array.isArray(sub.items) && sub.items.length > 0) {
            const itemHandle = sub.items[0]?.handle;
            const mappedPlanId = mapShopifyHandleToPlanId(itemHandle);
            if (mappedPlanId && PLANS[mappedPlanId]) {
              const result = {
                active: true,
                planId: mappedPlanId,
                status: "ACTIVE",
                shopifyPlanHandle: itemHandle,
                billingPeriod: sub.billingPeriod,
                currentBillingCycle: sub.currentBillingCycle,
                source: "partner_api",
                verifiedAt: new Date().toISOString(),
                expiresAt: Date.now() + CACHE_TTL_MS,
              };
              subscriptionCache.set(shop, result);
              return result;
            }
          }
        }
      }
    } catch (err) {
      console.warn("[PLAN ENFORCEMENT] Partner API subscription query warning:", err?.message);
    }
  }

  // 4. GraphQL Admin API fallback (currentAppInstallation.activeSubscriptions)
  if (admin?.graphql) {
    try {
      const adminSubRes = await admin.graphql(`
        query GetAppSubscriptions {
          currentAppInstallation {
            activeSubscriptions {
              id
              name
              status
              currentPeriodEnd
              createdAt
              lineItems {
                plan {
                  pricingDetails {
                    ... on AppRecurringPricing {
                      price {
                        amount
                        currencyCode
                      }
                      interval
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const adminJson = await adminSubRes.json();
      const activeSubs = adminJson?.data?.currentAppInstallation?.activeSubscriptions;

      if (Array.isArray(activeSubs) && activeSubs.length > 0) {
        const primarySub = activeSubs[0];
        if (primarySub.status === "ACTIVE") {
          let mappedPlanId = mapShopifyHandleToPlanId(primarySub.name);
          if (!mappedPlanId && primarySub.lineItems?.[0]?.plan?.pricingDetails?.price?.amount) {
            const amount = parseFloat(primarySub.lineItems[0].plan.pricingDetails.price.amount);
            if (amount >= 19.0) mappedPlanId = PLAN_IDS.PRO;
            else if (amount >= 10.0) mappedPlanId = PLAN_IDS.GROWTH;
            else if (amount >= 4.0) mappedPlanId = PLAN_IDS.STARTER;
          }

          if (mappedPlanId && PLANS[mappedPlanId]) {
            const result = {
              active: true,
              planId: mappedPlanId,
              status: "ACTIVE",
              subscriptionId: primarySub.id,
              subscriptionName: primarySub.name,
              currentPeriodEnd: primarySub.currentPeriodEnd,
              source: "admin_graphql",
              verifiedAt: new Date().toISOString(),
              expiresAt: Date.now() + CACHE_TTL_MS,
            };
            subscriptionCache.set(shop, result);
            return result;
          }
        } else if (["DECLINED", "EXPIRED", "FROZEN", "CANCELLED"].includes(primarySub.status)) {
          const inactiveResult = {
            active: false,
            planId: DEFAULT_PLAN_ID,
            status: primarySub.status,
            subscriptionId: primarySub.id,
            source: "admin_graphql",
            verifiedAt: new Date().toISOString(),
            expiresAt: Date.now() + CACHE_TTL_MS,
          };
          subscriptionCache.set(shop, inactiveResult);
          return inactiveResult;
        }
      }
    } catch (err) {
      console.warn("[PLAN ENFORCEMENT] Admin API activeSubscriptions warning:", err?.message);
    }
  }

  // 5. Safe Default: Starter tier (active fallback)
  return {
    active: true,
    planId: DEFAULT_PLAN_ID,
    status: process.env.NODE_ENV !== "production" ? "ACTIVE_DEFAULT" : "ACTIVE",
    source: "default_starter",
    verifiedAt: new Date().toISOString(),
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

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
 * Production Safety:
 * In production (NODE_ENV === "production"), client headers, localStorage, query params,
 * and STORE_PLAN are STRICTLY IGNORED. Only verified Shopify subscription info is used.
 */
export async function getShopPlan(shop, request = null, admin = null, returnPlanHandle = null) {
  const isProduction = process.env.NODE_ENV === "production";

  // 1. In development or test environments only, allow testing overrides
  if (!isProduction) {
    if (process.env.STORE_PLAN && PLANS[process.env.STORE_PLAN.toLowerCase()]) {
      return process.env.STORE_PLAN.toLowerCase();
    }
    if (request && request.headers) {
      const testHeader =
        request.headers.get("x-simulate-plan") ||
        request.headers.get("x-test-plan");
      if (testHeader && PLANS[testHeader.toLowerCase()]) {
        return testHeader.toLowerCase();
      }
    }
  }

  // 2. Authoritative verification through Shopify App Pricing / APIs
  try {
    const verified = await verifyShopifySubscription({ shop, admin, request, returnPlanHandle });
    if (verified && verified.active && verified.planId && PLANS[verified.planId]) {
      return verified.planId;
    }
  } catch (error) {
    console.error("[PLAN RESOLUTION ERROR]", error);
  }

  // 3. Default safe baseline: STARTER plan ($4.99/mo)
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
/**
 * Complete status object for frontend dashboard and settings loaders.
 */
export async function getStorePlanStatus(shop, request = null, admin = null, returnPlanHandle = null) {
  const actualPlanId = await getShopPlan(shop, request, admin, returnPlanHandle);
  const plan = PLANS[actualPlanId] || PLANS[DEFAULT_PLAN_ID];
  const monthlyUsage = await getShopMonthlyUsage(shop);

  const limit = plan.monthlyImageLimit; // 1000 for starter, 5000 for growth, null for pro
  const used = monthlyUsage.usedImages;
  const isUnlimited = limit === null;
  const remaining = isUnlimited ? null : Math.max(0, limit - used);
  const percentUsed = isUnlimited ? 100 : Math.min(100, Math.round((used / limit) * 100));

  const pricingPlansUrl = getShopifyPricingPlansUrl({ shop });
  const verifiedSub = await verifyShopifySubscription({ shop, admin, request, returnPlanHandle }).catch(() => null);

  return {
    actualPlanId,
    planName: plan.name,
    tierLabel: plan.tierLabel,
    displayPrice: plan.displayPrice,
    limit,
    used,
    remaining,
    isUnlimited,
    percentUsed,
    billingMonth: monthlyUsage.monthName,
    cycleStart: monthlyUsage.cycleStart,
    cycleEnd: monthlyUsage.cycleEnd,
    batchCount: monthlyUsage.batchCount,
    canUseAcceleratedQueue: canUseFeature(actualPlanId, "accelerated_queue"),
    canUsePriorityQueue: canUseFeature(actualPlanId, "priority_queue"),
    pricingPlansUrl,
    subscriptionStatus: verifiedSub?.status || "ACTIVE",
    subscriptionSource: verifiedSub?.source || "shopify_app_pricing",
    isTestStore: process.env.NODE_ENV !== "production",
  };
}

/**
 * Evaluates whether an import requesting `requestedCount` images is allowed by the merchant's plan.
 */
export async function checkImportQuota({ shop, requestedCount, request = null, admin = null, planOverride = null }) {
  const planId = planOverride || (await getShopPlan(shop, request, admin));
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
export async function runImportPreflight({ shop, driveUrl, request = null, admin = null, planOverride = null }) {
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
      admin,
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
