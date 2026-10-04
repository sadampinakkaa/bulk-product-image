// ============================================================================
// TEST SUITE: PHASE 3 SHOPIFY APP PRICING & SUBSCRIPTION INTEGRATION
// ============================================================================
// Tests all requirements from Phase 3:
// 1. Safe fallback to Starter ($4.99/mo) when no subscription exists
// 2. Verified Starter plan handle mapping
// 3. Verified Growth plan handle mapping ($10.99/mo, 5,000 images, accelerated queue)
// 4. Verified Pro plan handle mapping ($19.99/mo, unmetered images, VIP queue)
// 5. Unknown/malformed handle fallback to Starter (never grants Pro)
// 6. Production security: x-simulate-plan and STORE_PLAN are STRICTLY IGNORED in production
// 7. Dynamic Shopify App Pricing URL generation (https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans)
// 8. Welcome / Return flow plan activation and cache refresh
// 9. In-memory TTL caching and explicit cache invalidation
// 10. Central PLANS configuration pricing verification ($4.99, $10.99, $19.99)
process.env.DATABASE_URL = process.env.DATABASE_URL || "file:./dev.sqlite";

import assert from "node:assert/strict";
import {
  PLAN_IDS,
  PLANS,
  SHOPIFY_PLAN_HANDLES,
  mapShopifyHandleToPlanId,
  getShopifyPricingPlansUrl,
  canUseFeature,
} from "../app/constants/plans.js";

import {
  verifyShopifySubscription,
  getShopPlan,
  invalidateShopSubscriptionCache,
  getStorePlanStatus,
} from "../app/services/plan-enforcement.server.js";

console.log("🧪 RUNNING PHASE 3 SHOPIFY APP PRICING INTEGRATION TESTS...\n");

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ----------------------------------------------------------------------------
// 1. CENTRAL PLANS PRICING & HANDLE CONFIGURATION
// ----------------------------------------------------------------------------
console.log("--- 1. CENTRAL PLAN CONFIGURATION TESTS ---");

await test("Plans pricing: Starter=$4.99, Growth=$10.99, Pro=$19.99", () => {
  assert.equal(PLANS[PLAN_IDS.STARTER].displayPrice, "$4.99");
  assert.equal(PLANS[PLAN_IDS.GROWTH].displayPrice, "$10.99");
  assert.equal(PLANS[PLAN_IDS.PRO].displayPrice, "$19.99");

  assert.equal(PLANS[PLAN_IDS.STARTER].price, 4.99);
  assert.equal(PLANS[PLAN_IDS.GROWTH].price, 10.99);
  assert.equal(PLANS[PLAN_IDS.PRO].price, 19.99);

  assert.equal(PLANS[PLAN_IDS.STARTER].monthlyImageLimit, 1000);
  assert.equal(PLANS[PLAN_IDS.GROWTH].monthlyImageLimit, 5000);
  assert.equal(PLANS[PLAN_IDS.PRO].monthlyImageLimit, null);
});

await test("Shopify plan handles defaults configured correctly", () => {
  assert.equal(SHOPIFY_PLAN_HANDLES.starter, "starter");
  assert.equal(SHOPIFY_PLAN_HANDLES.growth, "growth");
  assert.equal(SHOPIFY_PLAN_HANDLES.pro, "pro");
});

// ----------------------------------------------------------------------------
// 2. SHOPIFY PLAN HANDLE MAPPING TESTS
// ----------------------------------------------------------------------------
console.log("--- 2. PLAN HANDLE MAPPING TESTS ---");

await test("Maps exact handles: 'starter', 'growth', 'pro'", () => {
  assert.equal(mapShopifyHandleToPlanId("starter"), PLAN_IDS.STARTER);
  assert.equal(mapShopifyHandleToPlanId("growth"), PLAN_IDS.GROWTH);
  assert.equal(mapShopifyHandleToPlanId("pro"), PLAN_IDS.PRO);
});

await test("Maps case-insensitive and variant handles", () => {
  assert.equal(mapShopifyHandleToPlanId("STARTER"), PLAN_IDS.STARTER);
  assert.equal(mapShopifyHandleToPlanId("growth_monthly"), PLAN_IDS.GROWTH);
  assert.equal(mapShopifyHandleToPlanId("Growth-Tier"), PLAN_IDS.GROWTH);
  assert.equal(mapShopifyHandleToPlanId("pro_enterprise"), PLAN_IDS.PRO);
  assert.equal(mapShopifyHandleToPlanId("Pro-Monthly"), PLAN_IDS.PRO);
});

await test("Unknown or invalid handles return null (never accidentally grants paid tiers)", () => {
  assert.equal(mapShopifyHandleToPlanId("enterprise_ultra"), null);
  assert.equal(mapShopifyHandleToPlanId("free_trial_special"), null);
  assert.equal(mapShopifyHandleToPlanId(""), null);
  assert.equal(mapShopifyHandleToPlanId(null), null);
  assert.equal(mapShopifyHandleToPlanId(undefined), null);
});

// ----------------------------------------------------------------------------
// 3. DYNAMIC SHOPIFY APP PRICING URL GENERATION
// ----------------------------------------------------------------------------
console.log("--- 3. SHOPIFY APP PRICING URL GENERATION TESTS ---");

await test("Generates canonical pricing plans URL from shop domain", () => {
  const url = getShopifyPricingPlansUrl({ shop: "my-cool-boutique.myshopify.com" });
  assert.equal(
    url,
    "https://admin.shopify.com/store/my-cool-boutique/charges/variant-image-sync/pricing_plans"
  );
});

await test("Supports custom store handle and app handle", () => {
  const url = getShopifyPricingPlansUrl({
    shop: "https://admin.shopify.com/store/custom-shop",
    appHandle: "custom-sync-app",
  });
  assert.equal(
    url,
    "https://admin.shopify.com/store/custom-shop/charges/custom-sync-app/pricing_plans"
  );
});

// ----------------------------------------------------------------------------
// 4. VERIFY SHOPIFY SUBSCRIPTION LOGIC & SAFE FALLBACK
// ----------------------------------------------------------------------------
console.log("--- 4. SUBSCRIPTION VERIFICATION TESTS ---");

await test("Fallback to Starter when no subscription exists", async () => {
  invalidateShopSubscriptionCache("test-store-fallback.myshopify.com");
  const res = await verifyShopifySubscription({
    shop: "test-store-fallback.myshopify.com",
    admin: null,
  });
  assert.equal(res.active, true);
  assert.equal(res.planId, PLAN_IDS.STARTER);
  assert.equal(res.source, "default_starter");
});

await test("Welcome / Return flow verifies plan handle and activates tier", async () => {
  const shop = "test-return-flow.myshopify.com";
  invalidateShopSubscriptionCache(shop);

  const res = await verifyShopifySubscription({
    shop,
    returnPlanHandle: "growth",
  });
  assert.equal(res.active, true);
  assert.equal(res.planId, PLAN_IDS.GROWTH);
  assert.equal(res.source, "shopify_return_flow");

  // Subsequent check should hit in-memory cache
  const cached = await verifyShopifySubscription({ shop });
  assert.equal(cached.planId, PLAN_IDS.GROWTH);
});

await test("Welcome / Return flow with unknown handle safely falls back to Starter", async () => {
  const shop = "test-invalid-return.myshopify.com";
  invalidateShopSubscriptionCache(shop);

  const res = await verifyShopifySubscription({
    shop,
    returnPlanHandle: "unauthorized_infinite_plan",
  });
  assert.equal(res.planId, PLAN_IDS.STARTER);
});

await test("Admin GraphQL mock: active Pro subscription query resolves Pro tier", async () => {
  const shop = "test-admin-graphql-pro.myshopify.com";
  invalidateShopSubscriptionCache(shop);

  const mockAdmin = {
    graphql: async () => ({
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              {
                id: "gid://shopify/AppSubscription/998877",
                name: "pro",
                status: "ACTIVE",
                currentPeriodEnd: "2026-11-04T00:00:00Z",
                lineItems: [
                  {
                    plan: {
                      pricingDetails: {
                        price: {
                          amount: "19.99",
                          currencyCode: "USD",
                        },
                        interval: "EVERY_30_DAYS",
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      }),
    }),
  };

  const res = await verifyShopifySubscription({
    shop,
    admin: mockAdmin,
  });
  assert.equal(res.active, true);
  assert.equal(res.planId, PLAN_IDS.PRO);
  assert.equal(res.subscriptionId, "gid://shopify/AppSubscription/998877");
});

await test("Admin GraphQL mock: declined subscription falls back to Starter", async () => {
  const shop = "test-declined-sub.myshopify.com";
  invalidateShopSubscriptionCache(shop);

  const mockAdmin = {
    graphql: async () => ({
      json: async () => ({
        data: {
          currentAppInstallation: {
            activeSubscriptions: [
              {
                id: "gid://shopify/AppSubscription/112233",
                name: "pro",
                status: "DECLINED",
              },
            ],
          },
        },
      }),
    }),
  };

  const res = await verifyShopifySubscription({
    shop,
    admin: mockAdmin,
  });
  assert.equal(res.active, false);
  assert.equal(res.planId, PLAN_IDS.STARTER);
});

// ----------------------------------------------------------------------------
// 5. PRODUCTION SECURITY GUARDS
// ----------------------------------------------------------------------------
console.log("--- 5. PRODUCTION SECURITY GUARD TESTS ---");

await test("PRODUCTION SECURITY: Client headers and STORE_PLAN are strictly IGNORED in production", async () => {
  const origEnv = process.env.NODE_ENV;
  const origStorePlan = process.env.STORE_PLAN;

  try {
    process.env.NODE_ENV = "production";
    process.env.STORE_PLAN = "pro";

    const fakeReq = new Request("https://myapp.com/app", {
      headers: {
        "x-simulate-plan": "pro",
        "x-test-plan": "growth",
      },
    });

    const shop = "security-check-shop.myshopify.com";
    invalidateShopSubscriptionCache(shop);

    // In production, STORE_PLAN="pro" and x-simulate-plan="pro" MUST NOT grant Pro
    const resolvedPlan = await getShopPlan(shop, fakeReq);
    assert.equal(
      resolvedPlan,
      PLAN_IDS.STARTER,
      "CRITICAL: Production must never grant paid tier from headers or STORE_PLAN!"
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    if (origStorePlan !== undefined) {
      process.env.STORE_PLAN = origStorePlan;
    } else {
      delete process.env.STORE_PLAN;
    }
  }
});

// ----------------------------------------------------------------------------
// 6. getStorePlanStatus COMPREHENSIVE OUTPUT
// ----------------------------------------------------------------------------
console.log("--- 6. getStorePlanStatus OUTPUT TESTS ---");

await test("getStorePlanStatus returns pricingPlansUrl, quotas and features", async () => {
  const shop = "status-test-shop.myshopify.com";
  invalidateShopSubscriptionCache(shop);

  const status = await getStorePlanStatus(shop);
  assert.equal(status.actualPlanId, PLAN_IDS.STARTER);
  assert.equal(status.planName, "Starter");
  assert.equal(status.displayPrice, "$4.99");
  assert.equal(status.limit, 1000);
  assert.equal(typeof status.pricingPlansUrl, "string");
  assert.match(status.pricingPlansUrl, /charges\/variant-image-sync\/pricing_plans/);
  assert.equal(status.canUseAcceleratedQueue, false);
  assert.equal(status.canUsePriorityQueue, false);
});

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log(`\n================================================================`);
console.log(`🎉 TEST SUMMARY: ${passed} / ${total} tests passed successfully.`);
console.log(`================================================================\n`);

if (passed !== total) {
  process.exit(1);
}
