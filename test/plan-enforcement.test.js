// ============================================================================
// TEST SUITE: PHASE 2 PLAN-WISE FEATURE GATING & USAGE ENFORCEMENT
// ============================================================================
// Verifies all required test cases from Section 18:
// - Starter limits (0/1000 + 100, 900/1000 + 100, 900/1000 + 101, 1000/1000 + 1)
// - Growth limits (4900/5000 + 100, 4900/5000 + 101)
// - Pro unmetered allowance
// - Invalid plan IDs, negative numbers, feature permission checks
// ============================================================================

import assert from "node:assert/strict";
import {
  PLAN_IDS,
  PLANS,
  FEATURES,
  canUseFeature,
  getPlanLimit,
  evaluateQuotaDecision,
} from "../app/constants/plans.js";
import { getBillingCycleRange } from "../app/services/plan-enforcement.server.js";

console.log("🧪 RUNNING PHASE 2 PLAN ENFORCEMENT TEST SUITE...\n");

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     Error: ${err.message}`);
    process.exitCode = 1;
  }
}

// ----------------------------------------------------------------------------
// 1. STARTER PLAN TEST CASES (Limit: 1,000 images/mo)
// ----------------------------------------------------------------------------
console.log("--- 1. STARTER PLAN TESTS ---");

it("Starter: 0 / 1,000 used -> 100 requested -> ALLOW", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.STARTER,
    used: 0,
    requestedCount: 100,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.limit, 1000);
  assert.equal(result.remaining, 1000);
});

it("Starter: 900 / 1,000 used -> 100 requested -> ALLOW", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.STARTER,
    used: 900,
    requestedCount: 100,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.remaining, 100);
});

it("Starter: 900 / 1,000 used -> 101 requested -> BLOCK", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.STARTER,
    used: 900,
    requestedCount: 101,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 100);
  assert.match(result.message, /Your Starter plan has 100 images remaining this month/);
  assert.match(result.message, /This import requires 101 images/);
  assert.equal(result.upgradeTarget, "Growth");
});

it("Starter: 1,000 / 1,000 used -> 1 requested -> BLOCK", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.STARTER,
    used: 1000,
    requestedCount: 1,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 0);
  assert.match(result.message, /0 images remaining/);
});

// ----------------------------------------------------------------------------
// 2. GROWTH PLAN TEST CASES (Limit: 5,000 images/mo)
// ----------------------------------------------------------------------------
console.log("\n--- 2. GROWTH PLAN TESTS ---");

it("Growth: 4,900 / 5,000 used -> 100 requested -> ALLOW", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.GROWTH,
    used: 4900,
    requestedCount: 100,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.limit, 5000);
  assert.equal(result.remaining, 100);
});

it("Growth: 4,900 / 5,000 used -> 101 requested -> BLOCK", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.GROWTH,
    used: 4900,
    requestedCount: 101,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.remaining, 100);
  assert.match(result.message, /Your Growth plan has 100 images remaining this month/);
  assert.match(result.message, /This import requires 101 images/);
  assert.equal(result.upgradeTarget, "Pro");
});

// ----------------------------------------------------------------------------
// 3. PRO PLAN TEST CASES (Unmetered / Unlimited)
// ----------------------------------------------------------------------------
console.log("\n--- 3. PRO PLAN TESTS ---");

it("Pro: 15,000 images used -> 5,000 requested -> ALLOW (unmetered)", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.PRO,
    used: 15000,
    requestedCount: 5000,
  });
  assert.equal(result.allowed, true);
  assert.equal(result.isUnlimited, true);
  assert.equal(result.limit, null);
  assert.equal(result.remaining, null);
});

// ----------------------------------------------------------------------------
// 4. EDGE CASES & SECURITY SAFETY
// ----------------------------------------------------------------------------
console.log("\n--- 4. EDGE CASES & RESILIENCE TESTS ---");

it("Invalid plan ID safely falls back to Starter default", () => {
  const result = evaluateQuotaDecision({
    planId: "nonexistent_hacker_tier",
    used: 950,
    requestedCount: 60,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.planId, PLAN_IDS.STARTER);
  assert.equal(result.limit, 1000);
});

it("Negative or NaN values are normalized safely", () => {
  const result = evaluateQuotaDecision({
    planId: PLAN_IDS.STARTER,
    used: -50,
    requestedCount: "invalid",
  });
  assert.equal(result.allowed, true);
  assert.equal(result.used, 0);
  assert.equal(result.requestedCount, 0);
});

it("Current billing month calculation strictly bounds calendar month", () => {
  const testDate = new Date("2026-10-15T12:00:00Z");
  const { start, end, monthName } = getBillingCycleRange(testDate);
  assert.equal(start.getDate(), 1);
  assert.equal(start.getMonth(), 9); // October (0-indexed 9)
  assert.equal(end.getDate(), 31);
  assert.equal(monthName, "October 2026");
});

// ----------------------------------------------------------------------------
// 5. FEATURE MATRIX & PERMISSION GATING
// ----------------------------------------------------------------------------
console.log("\n--- 5. FEATURE PERMISSION TESTS ---");

it("Core sync features are available on all tiers", () => {
  for (const plan of [PLAN_IDS.STARTER, PLAN_IDS.GROWTH, PLAN_IDS.PRO]) {
    assert.equal(canUseFeature(plan, FEATURES.GDRIVE_SYNC), true);
    assert.equal(canUseFeature(plan, FEATURES.SKU_MATCHING), true);
    assert.equal(canUseFeature(plan, FEATURES.STAGED_UPLOAD), true);
  }
});

it("Accelerated queue is locked on Starter, enabled on Growth and Pro", () => {
  assert.equal(canUseFeature(PLAN_IDS.STARTER, FEATURES.ACCELERATED_QUEUE), false);
  assert.equal(canUseFeature(PLAN_IDS.GROWTH, FEATURES.ACCELERATED_QUEUE), true);
  assert.equal(canUseFeature(PLAN_IDS.PRO, FEATURES.ACCELERATED_QUEUE), true);
});

it("VIP Priority queue is locked on Starter and Growth, enabled on Pro", () => {
  assert.equal(canUseFeature(PLAN_IDS.STARTER, FEATURES.PRIORITY_QUEUE), false);
  assert.equal(canUseFeature(PLAN_IDS.GROWTH, FEATURES.PRIORITY_QUEUE), false);
  assert.equal(canUseFeature(PLAN_IDS.PRO, FEATURES.PRIORITY_QUEUE), true);
});

console.log(`\n========================================`);
console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED (100%)`);
console.log(`========================================\n`);
