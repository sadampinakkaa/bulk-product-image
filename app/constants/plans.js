// ============================================================================
// CENTRAL PLAN CONFIGURATION & ARCHITECTURE (PHASE 1 & PHASE 2)
// ============================================================================
// Defines tier configurations, pricing, limits, feature matrices, and upgrade paths.
// In Phase 2, this powers authoritative feature gating and monthly usage enforcement.
// ============================================================================

export const PLAN_IDS = {
  STARTER: "starter",
  GROWTH: "growth",
  PRO: "pro",
};

export const PLANS = {
  [PLAN_IDS.STARTER]: {
    id: "starter",
    name: "Starter",
    tierLabel: "Starter Tier",
    tagline: "For boutique merchants syncing essential catalog collections",
    price: 4.99,
    displayPrice: "$4.99",
    period: "month",
    displayPeriod: "/month",
    badge: "STARTER",
    badgeColor: "neutral",
    recommended: false,
    monthlyImageLimit: 1000,
    displayLimit: "1,000 variant images / mo",
    description: "Automated Google Drive to variant matching for essential catalog volume.",
    features: [
      { id: "gdrive_sync", name: "Google Drive Folder Batch Ingestion", included: true },
      { id: "sku_matching", name: "Automated SKU Exact & Trimmed Matching", included: true },
      { id: "staged_upload", name: "Shopify GraphQL Staged Upload API", included: true },
      { id: "image_limit", name: "Up to 1,000 Variant Syncs / Month", included: true },
      { id: "file_size", name: "Up to 20 MB File Size per Image", included: true },
      { id: "concurrency", name: "Standard Queue Concurrency (1 Worker)", included: true },
      { id: "priority_queue", name: "Accelerated / Priority Processing", included: false, tag: "Growth / Pro" },
      { id: "vip_support", name: "Dedicated 24/7 Technical Support", included: false, tag: "Pro Only" },
    ],
    upgradeTarget: "growth",
    upgradeLabel: "Upgrade to Growth ($10.99/mo)",
  },
  [PLAN_IDS.GROWTH]: {
    id: "growth",
    name: "Growth",
    tierLabel: "Growth Tier",
    tagline: "Best for growing stores and seasonal catalog refreshes",
    price: 10.99,
    displayPrice: "$10.99",
    period: "month",
    displayPeriod: "/month",
    badge: "MOST POPULAR",
    badgeColor: "gold",
    recommended: true,
    monthlyImageLimit: 5000,
    displayLimit: "5,000 variant images / mo",
    description: "Expanded capacity with accelerated queue priority for active ecommerce stores.",
    features: [
      { id: "gdrive_sync", name: "Google Drive Folder Batch Ingestion", included: true },
      { id: "sku_matching", name: "Automated SKU Exact & Trimmed Matching", included: true },
      { id: "staged_upload", name: "Shopify GraphQL Staged Upload API", included: true },
      { id: "image_limit", name: "Up to 5,000 Variant Syncs / Month", included: true },
      { id: "file_size", name: "Up to 20 MB File Size per Image", included: true },
      { id: "concurrency", name: "Accelerated Queue Concurrency (3 Workers)", included: true },
      { id: "priority_queue", name: "Priority Processing Queue", included: true },
      { id: "vip_support", name: "Dedicated 24/7 Technical Support", included: false, tag: "Pro Only" },
    ],
    upgradeTarget: "pro",
    upgradeLabel: "Upgrade to Pro ($19.99/mo)",
  },
  [PLAN_IDS.PRO]: {
    id: "pro",
    name: "Pro",
    tierLabel: "Pro Enterprise",
    tagline: "Uncapped volume for high-velocity catalogs and agencies",
    price: 19.99,
    displayPrice: "$19.99",
    period: "month",
    displayPeriod: "/month",
    badge: "ENTERPRISE",
    badgeColor: "purple",
    recommended: false,
    monthlyImageLimit: null, // Unlimited
    displayLimit: "Unlimited variant images",
    description: "Uncapped variant image matching with maximum priority and dedicated throughput.",
    features: [
      { id: "gdrive_sync", name: "Google Drive Folder Batch Ingestion", included: true },
      { id: "sku_matching", name: "Automated SKU Exact & Trimmed Matching", included: true },
      { id: "staged_upload", name: "Shopify GraphQL Staged Upload API", included: true },
      { id: "image_limit", name: "Unlimited Variant Syncs / Month", included: true },
      { id: "file_size", name: "Up to 20 MB File Size per Image", included: true },
      { id: "concurrency", name: "Maximum Concurrent Pipeline Workers (5 Workers)", included: true },
      { id: "priority_queue", name: "Top Priority VIP Processing Queue", included: true },
      { id: "vip_support", name: "Dedicated 24/7 Technical Support", included: true },
    ],
    upgradeTarget: null,
    upgradeLabel: "Current Top Tier",
  },
};

export const DEFAULT_PLAN_ID = PLAN_IDS.STARTER;

// Safe environment variable accessor (safe across Node SSR and client bundles)
const getEnvVar = (name, fallback) => {
  if (typeof process !== "undefined" && process?.env && process.env[name]) {
    return process.env[name];
  }
  return fallback;
};

// ============================================================================
// SHOPIFY APP PRICING INTEGRATION & PLAN HANDLE MAPPING (PHASE 3)
// ============================================================================
// Maps internal plan IDs to external Shopify Partner Dashboard plan handles.
// Configured centrally via environment variables or safe defaults.
// ============================================================================

export const SHOPIFY_PLAN_HANDLES = {
  [PLAN_IDS.STARTER]: getEnvVar("SHOPIFY_PLAN_HANDLE_STARTER", "starter"),
  [PLAN_IDS.GROWTH]: getEnvVar("SHOPIFY_PLAN_HANDLE_GROWTH", "growth"),
  [PLAN_IDS.PRO]: getEnvVar("SHOPIFY_PLAN_HANDLE_PRO", "pro"),
};

/**
 * Maps a Shopify plan handle, title, or line item identifier to an internal PLAN_ID.
 * Case-insensitive and resilient to suffix variations (e.g. 'starter_monthly', 'growth-tier').
 * Returns null if the handle cannot be safely mapped.
 */
export function mapShopifyHandleToPlanId(rawHandle) {
  if (!rawHandle || typeof rawHandle !== "string") return null;
  const normalized = rawHandle.trim().toLowerCase();

  const starterConfig = getEnvVar("SHOPIFY_PLAN_HANDLE_STARTER", "starter").toLowerCase();
  const growthConfig = getEnvVar("SHOPIFY_PLAN_HANDLE_GROWTH", "growth").toLowerCase();
  const proConfig = getEnvVar("SHOPIFY_PLAN_HANDLE_PRO", "pro").toLowerCase();

  // 1. Exact configured handle match
  if (normalized === starterConfig) return PLAN_IDS.STARTER;
  if (normalized === growthConfig) return PLAN_IDS.GROWTH;
  if (normalized === proConfig) return PLAN_IDS.PRO;

  // 2. Resilient token matching for standard plan naming conventions
  if (/(^|[-_])(pro|professional)([-_]|$)/i.test(normalized)) {
    return PLAN_IDS.PRO;
  }
  if (/(^|[-_])(growth)([-_]|$)/i.test(normalized)) {
    return PLAN_IDS.GROWTH;
  }
  if (/(^|[-_])(starter|basic)([-_]|$)/i.test(normalized)) {
    return PLAN_IDS.STARTER;
  }

  return null;
}

/**
 * Dynamically constructs the official Shopify-hosted App Pricing selection URL.
 * Pattern: https://admin.shopify.com/store/:store_handle/charges/:app_handle/pricing_plans
 *
 * @param {Object} options
 * @param {string} options.shop - The merchant shop domain (e.g. 'my-store.myshopify.com' or admin URL)
 * @param {string} [options.appHandle] - The app's public listing handle from Partner Dashboard
 * @returns {string|null} The fully-qualified Shopify Admin URL
 */
export function getShopifyPricingPlansUrl({ shop, appHandle = null }) {
  if (!shop || typeof shop !== "string") return null;

  // Clean and extract store handle
  let cleanShop = shop.trim();
  cleanShop = cleanShop.replace(/^https?:\/\//i, "");
  cleanShop = cleanShop.replace(/^admin\.shopify\.com\/store\//i, "");
  cleanShop = cleanShop.replace(/\.myshopify\.com.*$/i, "");
  cleanShop = cleanShop.replace(/\/.*$/, "");

  const effectiveAppHandle =
    appHandle ||
    getEnvVar("SHOPIFY_APP_HANDLE", "variant-image-sync");

  return `https://admin.shopify.com/store/${encodeURIComponent(cleanShop)}/charges/${encodeURIComponent(effectiveAppHandle)}/pricing_plans`;
}

// ============================================================================
// FEATURE IDENTIFIERS & PERMISSIONS MATRIX
// ============================================================================

export const FEATURES = {
  GDRIVE_SYNC: "gdrive_sync",
  SKU_MATCHING: "sku_matching",
  STAGED_UPLOAD: "staged_upload",
  SUFFIX_STRIPPING: "suffix_stripping",
  ACCELERATED_QUEUE: "accelerated_queue",
  PRIORITY_QUEUE: "priority_queue",
  UNLIMITED_QUOTA: "unlimited_quota",
  UNLIMITED_HISTORY: "unlimited_history",
  EXPORT_LOGS: "export_logs",
};

export const PLAN_FEATURES = {
  [PLAN_IDS.STARTER]: {
    [FEATURES.GDRIVE_SYNC]: true,
    [FEATURES.SKU_MATCHING]: true,
    [FEATURES.STAGED_UPLOAD]: true,
    [FEATURES.SUFFIX_STRIPPING]: true,
    [FEATURES.ACCELERATED_QUEUE]: false,
    [FEATURES.PRIORITY_QUEUE]: false,
    [FEATURES.UNLIMITED_QUOTA]: false,
    [FEATURES.UNLIMITED_HISTORY]: false,
    [FEATURES.EXPORT_LOGS]: true,
  },
  [PLAN_IDS.GROWTH]: {
    [FEATURES.GDRIVE_SYNC]: true,
    [FEATURES.SKU_MATCHING]: true,
    [FEATURES.STAGED_UPLOAD]: true,
    [FEATURES.SUFFIX_STRIPPING]: true,
    [FEATURES.ACCELERATED_QUEUE]: true,
    [FEATURES.PRIORITY_QUEUE]: false,
    [FEATURES.UNLIMITED_QUOTA]: false,
    [FEATURES.UNLIMITED_HISTORY]: false,
    [FEATURES.EXPORT_LOGS]: true,
  },
  [PLAN_IDS.PRO]: {
    [FEATURES.GDRIVE_SYNC]: true,
    [FEATURES.SKU_MATCHING]: true,
    [FEATURES.STAGED_UPLOAD]: true,
    [FEATURES.SUFFIX_STRIPPING]: true,
    [FEATURES.ACCELERATED_QUEUE]: true,
    [FEATURES.PRIORITY_QUEUE]: true,
    [FEATURES.UNLIMITED_QUOTA]: true,
    [FEATURES.UNLIMITED_HISTORY]: true,
    [FEATURES.EXPORT_LOGS]: true,
  },
};

/**
 * Checks whether a feature is permitted on a given plan ID.
 */
export function canUseFeature(planId, featureId) {
  const planPerms = PLAN_FEATURES[planId] || PLAN_FEATURES[DEFAULT_PLAN_ID];
  return Boolean(planPerms[featureId]);
}

/**
 * Gets the monthly image limit for a plan ID (null represents unlimited).
 */
export function getPlanLimit(planId) {
  const plan = PLANS[planId] || PLANS[DEFAULT_PLAN_ID];
  return plan.monthlyImageLimit;
}

/**
 * Pure function: Evaluates whether a requested import amount is allowed
 * based on the plan limit and current monthly usage.
 */
export function evaluateQuotaDecision({ planId, used = 0, requestedCount = 0 }) {
  const safePlanId = PLANS[planId] ? planId : DEFAULT_PLAN_ID;
  const plan = PLANS[safePlanId];
  const limit = plan.monthlyImageLimit; // 1000 for starter, 5000 for growth, null for pro

  const safeUsed = Math.max(0, Number(used) || 0);
  const safeRequested = Math.max(0, Number(requestedCount) || 0);

  // Pro is completely unmetered / unlimited
  if (limit === null) {
    return {
      allowed: true,
      planId: safePlanId,
      planName: plan.name,
      limit: null,
      used: safeUsed,
      remaining: null,
      requestedCount: safeRequested,
      isUnlimited: true,
      message: "Pro tier provides unmetered sync volume. Import is approved.",
    };
  }

  const remaining = Math.max(0, limit - safeUsed);
  const fits = safeUsed + safeRequested <= limit;

  if (fits) {
    return {
      allowed: true,
      planId: safePlanId,
      planName: plan.name,
      limit,
      used: safeUsed,
      remaining,
      requestedCount: safeRequested,
      isUnlimited: false,
      message: `${safeRequested.toLocaleString()} images requested. You have ${remaining.toLocaleString()} images remaining in your ${plan.name} allowance.`,
    };
  }

  // Blocked
  const upgradeTarget = safePlanId === PLAN_IDS.STARTER ? PLANS[PLAN_IDS.GROWTH] : PLANS[PLAN_IDS.PRO];
  const blockedMessage = `Your ${plan.name} plan has ${remaining.toLocaleString()} images remaining this month. This import requires ${safeRequested.toLocaleString()} images. Upgrade your plan to continue.`;

  return {
    allowed: false,
    planId: safePlanId,
    planName: plan.name,
    limit,
    used: safeUsed,
    remaining,
    requestedCount: safeRequested,
    isUnlimited: false,
    upgradeTarget: upgradeTarget.name,
    upgradePrice: upgradeTarget.displayPrice,
    message: blockedMessage,
  };
}

// ============================================================================
// FEATURE COMPARISON MATRIX (SETTINGS & DASHBOARD TABLE)
// ============================================================================

export const FEATURE_COMPARISON_MATRIX = [
  {
    category: "Core Synchronization",
    items: [
      { name: "Public Google Drive Folder Ingestion", starter: true, growth: true, pro: true },
      { name: "Automated SKU Exact & Trimmed Matching", starter: true, growth: true, pro: true },
      { name: "Shopify Staged Uploads (GraphQL API)", starter: true, growth: true, pro: true },
      { name: "Non-Destructive Metadata Protection", starter: true, growth: true, pro: true },
      { name: "Filename Suffix Parsing (_front, -1, _alt)", starter: true, growth: true, pro: true },
    ],
  },
  {
    category: "Monthly Quota & Limits",
    items: [
      { name: "Monthly Variant Sync Allowance", starter: "1,000 images", growth: "5,000 images", pro: "Unlimited" },
      { name: "Max Single Image File Size", starter: "20 MB", growth: "20 MB", pro: "20 MB" },
      { name: "Total Products in Store", starter: "Unlimited", growth: "Unlimited", pro: "Unlimited" },
      { name: "Batch History Log Retention", starter: "100 batches", growth: "100 batches", pro: "Unlimited" },
    ],
  },
  {
    category: "Performance & Queue Priority",
    items: [
      { name: "Processing Queue Priority", starter: "Standard", growth: "High Priority", pro: "Maximum VIP" },
      { name: "Concurrent Pipeline Workers", starter: "1 Worker", growth: "3 Workers", pro: "5 Workers" },
      { name: "Detailed Execution Logs & Error Traces", starter: true, growth: true, pro: true },
      { name: "Support Response Window", starter: "Standard (24h)", growth: "Priority (6h)", pro: "Dedicated 24/7" },
    ],
  },
];
