// ============================================================================
// CENTRAL PLAN CONFIGURATION & ARCHITECTURE (PHASE 1)
// ============================================================================
// Defines tier configurations, pricing, limits, feature matrices, and upgrade paths.
// NOTE: Phase 1 is for UI architecture & preview only.
// Billing API and enforcement are reserved for Phases 2 & 3.
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
      { id: "concurrency", name: "Standard Queue Concurrency", included: true },
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
      { id: "concurrency", name: "Accelerated Queue Concurrency (2x)", included: true },
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
      { id: "concurrency", name: "Maximum Concurrent Pipeline Workers", included: true },
      { id: "priority_queue", name: "Top Priority Processing Queue", included: true },
      { id: "vip_support", name: "Dedicated 24/7 Technical Support", included: true },
    ],
    upgradeTarget: null,
    upgradeLabel: "Current Top Tier",
  },
};

export const DEFAULT_PLAN_ID = PLAN_IDS.STARTER;

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
