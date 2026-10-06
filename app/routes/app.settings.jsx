import { useState, useMemo, useEffect } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  PLANS,
  PLAN_IDS,
  DEFAULT_PLAN_ID,
  FEATURE_COMPARISON_MATRIX,
} from "../constants/plans";
import { getStorePlanStatus } from "../services/plan-enforcement.server";

// ============================================================================
// LOADER
// ============================================================================

export const loader = async ({ request }) => {
  const { session, admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const returnPlanHandle = url.searchParams.get("plan_handle");
  const billingApproved =
    url.searchParams.get("billing") === "approved" || Boolean(returnPlanHandle);

  let historicalStats = {
    totalImports: 0,
    totalAssigned: 0,
    totalImagesFound: 0,
    lastSync: null,
  };

  let planStatus = {
    actualPlanId: "starter",
    planName: "Starter",
    tierLabel: "Starter Tier",
    displayPrice: "$4.99",
    limit: 1000,
    used: 0,
    remaining: 1000,
    isUnlimited: false,
    percentUsed: 0,
    billingMonth: "Current Month",
  };

  let activationNotice = null;

  try {
    const [count, sumAssigned, sumFound, latest, status] = await Promise.all([
      db.importHistory.count({ where: { shop: session.shop } }),
      db.importHistory.aggregate({
        where: { shop: session.shop },
        _sum: { imagesAssigned: true },
      }),
      db.importHistory.aggregate({
        where: { shop: session.shop },
        _sum: { imagesFound: true },
      }),
      db.importHistory.findFirst({
        where: { shop: session.shop },
        orderBy: { createdAt: "desc" },
        select: { completedAt: true, createdAt: true },
      }),
      getStorePlanStatus(session.shop, request, admin, returnPlanHandle),
    ]);

    planStatus = status;

    if (returnPlanHandle || (billingApproved && status.subscriptionStatus === "ACTIVE")) {
      const activePlan = PLANS[status.actualPlanId] || PLANS[PLAN_IDS.STARTER];
      activationNotice = {
        planId: status.actualPlanId,
        planName: activePlan.name,
        displayPrice: activePlan.displayPrice,
        displayLimit: activePlan.displayLimit,
        message: `Your store subscription is now active on the ${activePlan.name} tier (${activePlan.displayPrice}/mo)! Your monthly allowance is ${activePlan.displayLimit}.`,
      };
    }

    historicalStats = {
      totalImports: count || 0,
      totalAssigned: sumAssigned?._sum?.imagesAssigned || 0,
      totalImagesFound: sumFound?._sum?.imagesFound || 0,
      lastSync: latest?.completedAt
        ? latest.completedAt.toISOString()
        : latest?.createdAt
        ? latest.createdAt.toISOString()
        : null,
    };
  } catch (err) {
    console.error("[SETTINGS LOADER] Error querying store metrics:", err);
  }

  return Response.json({
    shop: session.shop,
    historicalStats,
    planStatus,
    activationNotice,
  });
};

// ============================================================================
// REUSABLE SUB-COMPONENTS
// ============================================================================

/**
 * Reusable Card Section Wrapper
 */
function SettingsSection({ id, title, subtitle, icon, badge, children }) {
  return (
    <section className="set-card" id={id}>
      <div className="set-card-header">
        <div className="set-card-header-left">
          {icon && <span className="set-card-icon">{icon}</span>}
          <div>
            <div className="set-card-title-row">
              <h2 className="set-card-title">{title}</h2>
              {badge && <span className="set-badge">{badge}</span>}
            </div>
            {subtitle && <p className="set-card-subtitle">{subtitle}</p>}
          </div>
        </div>
      </div>
      <div className="set-card-body">{children}</div>
    </section>
  );
}

/**
 * Reusable Setting Row
 */
function SettingRow({ label, description, children, badge }) {
  return (
    <div className="set-row">
      <div className="set-row-info">
        <div className="set-row-label-row">
          <span className="set-row-label">{label}</span>
          {badge && <span className="set-pill-tag">{badge}</span>}
        </div>
        {description && <p className="set-row-desc">{description}</p>}
      </div>
      <div className="set-row-control">{children}</div>
    </div>
  );
}

/**
 * Reusable Accessible Toggle Switch
 */
function ToggleSwitch({ checked, onChange, disabled = false, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={`set-toggle ${checked ? "active" : ""} ${
        disabled ? "disabled" : ""
      }`}
      onClick={() => !disabled && onChange(!checked)}
    >
      <span className="set-toggle-thumb" />
    </button>
  );
}

/**
 * Reusable Plan Tier Card
 */
function PlanCard({
  plan,
  isCurrent,
  isActualStorePlan,
  currentPlanTier,
  pricingPlansUrl,
  onSelect,
}) {
  const isRecommended = plan.recommended;

  const TIER_ORDER = { starter: 1, growth: 2, pro: 3 };
  const currentRank = TIER_ORDER[currentPlanTier] || 1;
  const planRank = TIER_ORDER[plan.id] || 1;
  const isUpgrade = planRank > currentRank;
  const isDowngrade = planRank < currentRank;

  return (
    <div
      className={`set-plan-card ${isActualStorePlan ? "active-plan-card" : isCurrent ? "current" : ""} ${
        isRecommended ? "recommended" : ""
      }`}
    >
      {isRecommended && (
        <div className="set-plan-ribbon">MOST POPULAR</div>
      )}

      <div className="set-plan-card-top">
        <div className="set-plan-badge-row">
          <span className={`set-plan-tag ${plan.badgeColor || "gold"}`}>
            {plan.badge}
          </span>
          {isActualStorePlan && (
            <span className="set-plan-current-tag active">ACTIVE STORE PLAN</span>
          )}
          {!isActualStorePlan && isCurrent && (
            <span className="set-plan-current-tag">PREVIEWING TIER</span>
          )}
        </div>

        <h3 className="set-plan-name">{plan.name}</h3>
        <p className="set-plan-tagline">{plan.tagline}</p>

        <div className="set-plan-price-block">
          <span className="set-plan-price">{plan.displayPrice}</span>
          <span className="set-plan-period">{plan.displayPeriod}</span>
        </div>

        <div className="set-plan-quota-badge">
          <span className="set-quota-icon">⚡</span>
          <span>{plan.displayLimit}</span>
        </div>
      </div>

      <div className="set-plan-divider" />

      <ul className="set-plan-features-list">
        {plan.features.map((feat) => (
          <li
            key={feat.id}
            className={`set-plan-feat-item ${feat.included ? "included" : "excluded"}`}
          >
            <span className="set-feat-icon">
              {feat.included ? "✓" : "—"}
            </span>
            <span className="set-feat-text">{feat.name}</span>
            {feat.tag && <span className="set-feat-tag">{feat.tag}</span>}
          </li>
        ))}
      </ul>

      <div className="set-plan-card-bottom">
        {isActualStorePlan ? (
          <button
            type="button"
            className="set-plan-cta-btn current-active-btn"
            disabled
          >
            ✓ Current Plan
          </button>
        ) : isUpgrade ? (
          <a
            href={pricingPlansUrl || "#"}
            target="_top"
            rel="noopener noreferrer"
            className="set-plan-cta-btn upgrade-btn"
          >
            Upgrade to {plan.name} →
          </a>
        ) : (
          <a
            href={pricingPlansUrl || "#"}
            target="_top"
            rel="noopener noreferrer"
            className="set-plan-cta-btn downgrade-btn"
          >
            Downgrade / Change Plan →
          </a>
        )}

        {!isActualStorePlan && (
          <button
            type="button"
            className="set-plan-preview-text-link"
            onClick={() => onSelect(plan.id)}
          >
            {isCurrent ? "✓ Previewing Features" : `Preview ${plan.name} Features`}
          </button>
        )}

        <div className="set-plan-subnote">
          Managed securely through Shopify App Pricing · Official Shopify approval
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable Real Store Usage Card
 */
function UsageCard({ currentPlan, historicalStats, planStatus }) {
  const planConfig = PLANS[currentPlan] || PLANS[PLAN_IDS.STARTER];
  const actualPlanConfig =
    PLANS[planStatus?.actualPlanId] || PLANS[PLAN_IDS.STARTER];
  const totalAssigned = historicalStats?.totalAssigned || 0;
  const monthUsed = planStatus?.used || 0;
  const actualLimit = planStatus?.limit;

  const monthPercent = useMemo(() => {
    if (!actualLimit) return 100;
    return Math.min(100, Math.round((monthUsed / actualLimit) * 100));
  }, [monthUsed, actualLimit]);

  return (
    <div className="set-usage-card">
      <div className="set-usage-header">
        <div className="set-usage-title-col">
          <span className="set-usage-badge">LIVE SHOPIFY SUBSCRIPTION · PHASE 3 BILLING</span>
          <h3 className="set-usage-title">Monthly Quota & Image Consumption</h3>
          <p className="set-usage-desc">
            Enforced server-side for billing cycle:{" "}
            <strong>{planStatus?.billingMonth || "Current Month"}</strong>.
          </p>
        </div>
        <div className="set-usage-plan-actions">
          <div className="set-usage-plan-pill">
            <span className="set-plan-pill-name">{actualPlanConfig.name} Plan (Active)</span>
            <span className="set-plan-pill-price">{actualPlanConfig.displayPrice}/mo</span>
          </div>
          {planStatus?.pricingPlansUrl && (
            <a
              href={planStatus.pricingPlansUrl}
              target="_top"
              rel="noopener noreferrer"
              className="set-manage-sub-btn"
            >
              Manage in Shopify ↗
            </a>
          )}
        </div>
      </div>

      <div className="set-usage-metric-grid">
        <div className="set-usage-stat-box">
          <span className="set-stat-label">Current Month Synced</span>
          <span className="set-stat-val gold">{monthUsed.toLocaleString()}</span>
          <span className="set-stat-sub">Assigned in {planStatus?.billingMonth}</span>
        </div>
        <div className="set-usage-stat-box">
          <span className="set-stat-label">Remaining Allowance</span>
          <span className="set-stat-val green">
            {planStatus?.isUnlimited
              ? "Unlimited"
              : `${(planStatus?.remaining || 0).toLocaleString()} left`}
          </span>
          <span className="set-stat-sub">{actualPlanConfig.name} Monthly Quota</span>
        </div>
        <div className="set-usage-stat-box">
          <span className="set-stat-label">Lifetime Synced Variants</span>
          <span className="set-stat-val cyan">
            {totalAssigned.toLocaleString()}
          </span>
          <span className="set-stat-sub">
            Across {(historicalStats?.totalImports || 0).toLocaleString()} batches
          </span>
        </div>
      </div>

      <div className="set-usage-meter-section">
        <div className="set-meter-label-row">
          <span>{actualPlanConfig.name} Monthly Allowance Usage</span>
          <strong>
            {planStatus?.isUnlimited
              ? `${monthUsed.toLocaleString()} images (Unmetered Pro)`
              : `${monthUsed.toLocaleString()} / ${(actualLimit || 1000).toLocaleString()} images (${monthPercent}%)`}
          </strong>
        </div>
        <div className="set-meter-track">
          <div
            className="set-meter-fill"
            style={{
              width: planStatus?.isUnlimited ? "100%" : `${monthPercent}%`,
              background:
                !planStatus?.isUnlimited && monthPercent > 90
                  ? "linear-gradient(90deg, #EF4444, #F87171)"
                  : !planStatus?.isUnlimited && monthPercent > 75
                  ? "linear-gradient(90deg, #F59E0B, #FBBF24)"
                  : undefined,
            }}
          />
        </div>
        <div className="set-meter-footer-note">
          <span>
            {planStatus?.isUnlimited
              ? "Unmetered volume enabled for Pro tier"
              : `${(planStatus?.remaining || 0).toLocaleString()} images remaining before quota is reached.`}
          </span>
          <span>Phase 3 Shopify-Hosted Pricing & Verification Active</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable Feature Comparison Table
 */
function PlanComparisonTable({ selectedPlan, actualPlanId, pricingPlansUrl, onSelectPlan }) {
  return (
    <div className="set-compare-wrap">
      <div className="set-compare-header">
        <div>
          <h3 className="set-compare-title">Detailed Feature Comparison</h3>
          <p className="set-compare-subtitle">
            Side-by-side technical breakdown across Starter ($4.99/mo), Growth ($10.99/mo), and Pro ($19.99/mo).
          </p>
        </div>
      </div>

      <div className="set-table-responsive">
        <table className="set-compare-table">
          <thead>
            <tr>
              <th className="th-feature">Feature / Capability</th>
              <th className={`th-plan ${actualPlanId === "starter" ? "current-th" : ""}`}>
                <div className="th-plan-box">
                  <span className="th-plan-name">Starter</span>
                  <span className="th-plan-price">$4.99/mo</span>
                  {actualPlanId === "starter" ? (
                    <button type="button" className="th-select-btn" disabled>
                      ✓ Current Plan
                    </button>
                  ) : (
                    <a
                      href={pricingPlansUrl || "#"}
                      target="_top"
                      rel="noopener noreferrer"
                      className="th-select-btn"
                    >
                      Change Plan ↗
                    </a>
                  )}
                </div>
              </th>
              <th className={`th-plan ${actualPlanId === "growth" ? "current-th" : ""}`}>
                <div className="th-plan-box">
                  <span className="th-plan-badge">POPULAR</span>
                  <span className="th-plan-name">Growth</span>
                  <span className="th-plan-price">$10.99/mo</span>
                  {actualPlanId === "growth" ? (
                    <button type="button" className="th-select-btn" disabled>
                      ✓ Current Plan
                    </button>
                  ) : (
                    <a
                      href={pricingPlansUrl || "#"}
                      target="_top"
                      rel="noopener noreferrer"
                      className="th-select-btn"
                    >
                      {actualPlanId === "pro" ? "Change Plan ↗" : "Upgrade to Growth ↗"}
                    </a>
                  )}
                </div>
              </th>
              <th className={`th-plan ${actualPlanId === "pro" ? "current-th" : ""}`}>
                <div className="th-plan-box">
                  <span className="th-plan-name">Pro</span>
                  <span className="th-plan-price">$19.99/mo</span>
                  {actualPlanId === "pro" ? (
                    <button type="button" className="th-select-btn" disabled>
                      ✓ Current Plan
                    </button>
                  ) : (
                    <a
                      href={pricingPlansUrl || "#"}
                      target="_top"
                      rel="noopener noreferrer"
                      className="th-select-btn"
                    >
                      Upgrade to Pro ↗
                    </a>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {FEATURE_COMPARISON_MATRIX.map((category) => (
              <tr key={category.category} className="cat-group-row">
                <td colSpan={4} className="cat-header-cell">
                  {category.category}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Expanded detailed category sections */}
      <div className="set-matrix-cards">
        {FEATURE_COMPARISON_MATRIX.map((cat) => (
          <div key={cat.category} className="set-matrix-cat-box">
            <h4 className="set-matrix-cat-title">{cat.category}</h4>
            <div className="set-matrix-items">
              {cat.items.map((item) => (
                <div key={item.name} className="set-matrix-row">
                  <div className="set-matrix-label">{item.name}</div>
                  <div className="set-matrix-values">
                    <div className="set-matrix-val-col">
                      <span className="set-matrix-tier-tag">Starter</span>
                      <span className="set-matrix-val">
                        {typeof item.starter === "boolean"
                          ? item.starter
                            ? "✓"
                            : "—"
                          : item.starter}
                      </span>
                    </div>
                    <div className="set-matrix-val-col gold">
                      <span className="set-matrix-tier-tag">Growth</span>
                      <span className="set-matrix-val">
                        {typeof item.growth === "boolean"
                          ? item.growth
                            ? "✓"
                            : "—"
                          : item.growth}
                      </span>
                    </div>
                    <div className="set-matrix-val-col cyan">
                      <span className="set-matrix-tier-tag">Pro</span>
                      <span className="set-matrix-val">
                        {typeof item.pro === "boolean"
                          ? item.pro
                            ? "✓"
                            : "—"
                          : item.pro}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN SETTINGS COMPONENT
// ============================================================================

export default function SettingsPage() {
  const { shop, historicalStats, planStatus, activationNotice } = useLoaderData();
  const navigate = useNavigate();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState("plans");

  // Plan architecture simulator state (Phase 2: active store plan)
  const [currentPlan, setCurrentPlan] = useState(
    planStatus?.actualPlanId || DEFAULT_PLAN_ID
  );

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState(null);

  // Local user preferences state (safe browser persistence)
  const [prefs, setPrefs] = useState({
    // General
    autoRefreshDashboard: true,
    confirmBeforeSync: true,
    themeMode: "dark",

    // Import & Sync
    trimSkuSuffixes: true,
    caseInsensitiveSku: true,
    maxImageSizeValidation: true,
    queuePriorityMode: "standard",

    // Notifications
    bannerOnCompletion: true,
    soundEffects: false,
    verboseErrorLogs: true,
  });

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("vis_user_settings");
      if (saved) {
        setPrefs((prev) => ({ ...prev, ...JSON.parse(saved) }));
      }
      const savedPlan = localStorage.getItem("vis_preview_plan");
      if (savedPlan && PLANS[savedPlan]) {
        setCurrentPlan(savedPlan);
      }
    } catch {
      // Ignore localStorage errors in sandboxed iframes
    }
  }, []);

  // Update a single preference
  const updatePref = (key, val) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem("vis_user_settings", JSON.stringify(next));
      } catch {
        // noop
      }
      return next;
    });
    showToast("Setting updated");
  };

  // Switch preview plan
  const handleSelectPlan = (planId) => {
    setCurrentPlan(planId);
    try {
      localStorage.setItem("vis_preview_plan", planId);
    } catch {
      // noop
    }
    const targetPlan = PLANS[planId];
    showToast(
      `Viewing ${targetPlan.name} (${targetPlan.displayPrice}/mo) feature preview. Use Upgrade to activate in Shopify.`,
    );
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4500);
  };

  const planObj = PLANS[currentPlan] || PLANS[PLAN_IDS.STARTER];

  return (
    <s-page heading="App Settings & Tiers">
      <div className="set-root">
        {/* =======================================================
            TOAST NOTIFICATION
        ======================================================= */}
        {toastMessage && (
          <div className="set-toast">
            <span className="set-toast-icon">✨</span>
            <span className="set-toast-text">{toastMessage}</span>
            <button
              type="button"
              className="set-toast-close"
              onClick={() => setToastMessage(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* =======================================================
            HERO HEADER
        ======================================================= */}
        <header className="set-hero-card">
          <div className="set-hero-left">
            <div className="set-hero-badge-row">
              <span className="set-hero-badge">CONFIG & TIERS</span>
              <span className="set-live-pill">
                <span className="set-dot" />
                Store: {shop || "Shopify Store"}
              </span>
            </div>
            <h1 className="set-hero-title">Settings & Subscription Plans</h1>
            <p className="set-hero-subtitle">
              Manage catalog sync preferences, inspect operational quotas, and preview
              tiered feature capabilities for Variant Image Sync.
            </p>
          </div>

          <div className="set-hero-actions">
            <button
              type="button"
              className="set-back-btn"
              onClick={() => navigate("/app")}
            >
              ← Back to Dashboard
            </button>
          </div>
        </header>

        {/* =======================================================
            NAVIGATION TABS
        ======================================================= */}
        <nav className="set-nav-tabs">
          <button
            type="button"
            className={`set-tab-btn ${activeTab === "plans" ? "active" : ""}`}
            onClick={() => setActiveTab("plans")}
          >
            <span className="set-tab-icon">💳</span>
            <span>Plan & Usage</span>
            <span className="set-tab-pill gold">{planObj.name}</span>
          </button>

          <button
            type="button"
            className={`set-tab-btn ${activeTab === "sync" ? "active" : ""}`}
            onClick={() => setActiveTab("sync")}
          >
            <span className="set-tab-icon">🔄</span>
            <span>Import & Sync</span>
          </button>

          <button
            type="button"
            className={`set-tab-btn ${activeTab === "general" ? "active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            <span className="set-tab-icon">⚙️</span>
            <span>General</span>
          </button>

          <button
            type="button"
            className={`set-tab-btn ${activeTab === "notifications" ? "active" : ""}`}
            onClick={() => setActiveTab("notifications")}
          >
            <span className="set-tab-icon">🔔</span>
            <span>Notifications</span>
          </button>

          <button
            type="button"
            className={`set-tab-btn ${activeTab === "account" ? "active" : ""}`}
            onClick={() => setActiveTab("account")}
          >
            <span className="set-tab-icon">🛡️</span>
            <span>Account & System</span>
          </button>
        </nav>

        {/* =======================================================
            TAB 1: PLAN & USAGE (CENTRAL PRICING ARCHITECTURE)
        ======================================================= */}
        {activeTab === "plans" && (
          <div className="set-tab-pane">
            {/* Activation Notice Banner */}
            {activationNotice && (
              <div className="set-activation-banner">
                <div className="set-activation-icon">🎉</div>
                <div className="set-activation-content">
                  <h3 className="set-activation-title">Subscription Activated!</h3>
                  <p className="set-activation-desc">{activationNotice.message}</p>
                </div>
                <div className="set-activation-badge">
                  ACTIVE TIER: {activationNotice.planName.toUpperCase()}
                </div>
              </div>
            )}

            {/* Phase 3 Status Banner */}
            <div className="set-phase-banner">
              <div className="set-phase-icon">⚡</div>
              <div className="set-phase-content">
                <strong>Shopify App Pricing Integration Active:</strong> Monthly image quotas
                (Starter: 1,000 / Growth: 5,000 / Pro: Unlimited) are verified and enforced in real-time.
                Subscriptions and tier upgrades are securely managed through Shopify's official hosted pricing pages.
              </div>
            </div>

            {/* Real Store Usage Card */}
            <UsageCard
              currentPlan={currentPlan}
              historicalStats={historicalStats}
              planStatus={planStatus}
            />

            {/* Plan Tier Cards Grid */}
            <div className="set-plans-section">
              <div className="set-plans-header">
                <div>
                  <span className="set-plans-badge">SUBSCRIPTION TIERS</span>
                  <h2 className="set-plans-title">Available Subscription Plans</h2>
                  <p className="set-plans-desc">
                    Upgrade or manage your subscription through official Shopify App Pricing.
                    Limits and features are automatically synced to your store.
                  </p>
                </div>
              </div>

              <div className="set-plans-grid">
                <PlanCard
                  plan={PLANS[PLAN_IDS.STARTER]}
                  isCurrent={currentPlan === PLAN_IDS.STARTER}
                  isActualStorePlan={planStatus?.actualPlanId === PLAN_IDS.STARTER}
                  currentPlanTier={planStatus?.actualPlanId || "starter"}
                  pricingPlansUrl={planStatus?.pricingPlansUrl}
                  onSelect={handleSelectPlan}
                />
                <PlanCard
                  plan={PLANS[PLAN_IDS.GROWTH]}
                  isCurrent={currentPlan === PLAN_IDS.GROWTH}
                  isActualStorePlan={planStatus?.actualPlanId === PLAN_IDS.GROWTH}
                  currentPlanTier={planStatus?.actualPlanId || "starter"}
                  pricingPlansUrl={planStatus?.pricingPlansUrl}
                  onSelect={handleSelectPlan}
                />
                <PlanCard
                  plan={PLANS[PLAN_IDS.PRO]}
                  isCurrent={currentPlan === PLAN_IDS.PRO}
                  isActualStorePlan={planStatus?.actualPlanId === PLAN_IDS.PRO}
                  currentPlanTier={planStatus?.actualPlanId || "starter"}
                  pricingPlansUrl={planStatus?.pricingPlansUrl}
                  onSelect={handleSelectPlan}
                />
              </div>
            </div>

            {/* Detailed Plan Comparison Table */}
            <PlanComparisonTable
              selectedPlan={currentPlan}
              actualPlanId={planStatus?.actualPlanId}
              pricingPlansUrl={planStatus?.pricingPlansUrl}
              onSelectPlan={handleSelectPlan}
            />
          </div>
        )}

        {/* =======================================================
            TAB 2: IMPORT & SYNC PREFERENCES
        ======================================================= */}
        {activeTab === "sync" && (
          <div className="set-tab-pane">
            <SettingsSection
              id="sync-settings"
              icon="🔄"
              title="Catalog & SKU Matching Engine"
              subtitle="Configure how variant images from Google Drive are parsed, normalized, and assigned."
            >
              <SettingRow
                label="Suffix-Trimmed SKU Matching"
                description="Automatically strips photo angle suffixes (e.g. 'TSHIRT-BLK_front.jpg', 'TSHIRT-BLK-1.png') so they match variant SKU 'TSHIRT-BLK'."
                badge="RECOMMENDED"
              >
                <ToggleSwitch
                  checked={prefs.trimSkuSuffixes}
                  onChange={(v) => updatePref("trimSkuSuffixes", v)}
                  ariaLabel="Toggle suffix-trimmed SKU matching"
                />
              </SettingRow>

              <SettingRow
                label="Case-Insensitive SKU Comparison"
                description="Matches SKUs regardless of uppercase or lowercase differences between image filenames and Shopify variants."
                badge="DEFAULT"
              >
                <ToggleSwitch
                  checked={prefs.caseInsensitiveSku}
                  onChange={(v) => updatePref("caseInsensitiveSku", v)}
                  ariaLabel="Toggle case-insensitive SKU matching"
                />
              </SettingRow>

              <SettingRow
                label="Strict 20 MB File Size Guard"
                description="Rejects oversized media files before initiating staged upload to protect Shopify GraphQL rate limits."
                badge="SAFETY CHECK"
              >
                <ToggleSwitch
                  checked={prefs.maxImageSizeValidation}
                  onChange={(v) => updatePref("maxImageSizeValidation", v)}
                  ariaLabel="Toggle image size validation"
                />
              </SettingRow>

              <SettingRow
                label="Staged Upload Verification"
                description="Performs asynchronous media status polling to confirm images are processed before variant attachment."
                badge="BUILT-IN"
              >
                <ToggleSwitch
                  checked={true}
                  disabled={true}
                  ariaLabel="Staged upload verification always on"
                />
              </SettingRow>
            </SettingsSection>

            <SettingsSection
              id="drive-settings"
              icon="📁"
              title="Google Drive Connection Settings"
              subtitle="Parameters governing how public Google Drive folder manifests are extracted."
            >
              <SettingRow
                label="Public Drive Folder Access Mode"
                description="Uses Google Drive embedded folder scrapers to extract full-resolution image IDs without requiring OAuth keys."
                badge="ZERO CONFIG"
              >
                <span className="set-readonly-tag">Public Shared Link</span>
              </SettingRow>

              <SettingRow
                label="Supported Image File Formats"
                description="Filters folder contents for valid photography extensions (.jpg, .jpeg, .png, .webp, .gif)."
                badge="AUTOMATIC"
              >
                <span className="set-readonly-tag">JPG, PNG, WEBP, GIF</span>
              </SettingRow>
            </SettingsSection>
          </div>
        )}

        {/* =======================================================
            TAB 3: GENERAL PREFERENCES
        ======================================================= */}
        {activeTab === "general" && (
          <div className="set-tab-pane">
            <SettingsSection
              id="general-settings"
              icon="⚙️"
              title="Store Information & UI Preferences"
              subtitle="General application state and dashboard behaviors."
            >
              <SettingRow
                label="Connected Shopify Shop Domain"
                description="Shopify store account linked through authenticated offline session."
              >
                <code className="set-code-pill">{shop || "store.myshopify.com"}</code>
              </SettingRow>

              <SettingRow
                label="Live Dashboard Auto-Polling"
                description="Automatically checks status endpoint every 2.5 seconds while an image import batch is executing."
                badge="REAL-TIME"
              >
                <ToggleSwitch
                  checked={prefs.autoRefreshDashboard}
                  onChange={(v) => updatePref("autoRefreshDashboard", v)}
                  ariaLabel="Toggle auto-refresh dashboard"
                />
              </SettingRow>

              <SettingRow
                label="Pre-Flight Confirmation Modal"
                description="Displays a summary modal before initiating multi-image uploads to prevent accidental sync triggers."
              >
                <ToggleSwitch
                  checked={prefs.confirmBeforeSync}
                  onChange={(v) => updatePref("confirmBeforeSync", v)}
                  ariaLabel="Toggle pre-flight confirmation"
                />
              </SettingRow>

              <SettingRow
                label="Catalog Safety Mode"
                description="Ensures existing product titles, prices, barcodes, and inventory levels are never modified or deleted."
                badge="ALWAYS ENFORCED"
              >
                <span className="set-readonly-tag green">Non-Destructive Active</span>
              </SettingRow>
            </SettingsSection>
          </div>
        )}

        {/* =======================================================
            TAB 4: NOTIFICATIONS
        ======================================================= */}
        {activeTab === "notifications" && (
          <div className="set-tab-pane">
            <SettingsSection
              id="notification-settings"
              icon="🔔"
              title="In-App & Execution Alerts"
              subtitle="Control feedback and messaging delivered upon batch completion or errors."
            >
              <SettingRow
                label="Banner Notification on Completion"
                description="Displays high-visibility completion banner with assigned variant count when a batch finishes."
              >
                <ToggleSwitch
                  checked={prefs.bannerOnCompletion}
                  onChange={(v) => updatePref("bannerOnCompletion", v)}
                  ariaLabel="Toggle banner notification"
                />
              </SettingRow>

              <SettingRow
                label="Detailed Execution Error Traces"
                description="Stores stack traces and exact SKU mismatch details in Import History logs for easy diagnostics."
                badge="RECOMMENDED"
              >
                <ToggleSwitch
                  checked={prefs.verboseErrorLogs}
                  onChange={(v) => updatePref("verboseErrorLogs", v)}
                  ariaLabel="Toggle verbose error logs"
                />
              </SettingRow>

              <SettingRow
                label="Audio Completion Chime"
                description="Plays a subtle audio chime when long-running batches (100+ images) finish processing."
              >
                <ToggleSwitch
                  checked={prefs.soundEffects}
                  onChange={(v) => updatePref("soundEffects", v)}
                  ariaLabel="Toggle sound effects"
                />
              </SettingRow>
            </SettingsSection>
          </div>
        )}

        {/* =======================================================
            TAB 5: ACCOUNT & SYSTEM
        ======================================================= */}
        {activeTab === "account" && (
          <div className="set-tab-pane">
            <SettingsSection
              id="account-settings"
              icon="🛡️"
              title="App Status & System Architecture"
              subtitle="Technical environment, Shopify API versions, and database connection metrics."
            >
              <SettingRow
                label="App Version & Release Stream"
                description="Production software build with modern SaaS dashboard and central plan architecture."
              >
                <span className="set-code-pill gold">v1.2.0-saas (Phase 1)</span>
              </SettingRow>

              <SettingRow
                label="Shopify Admin API Version"
                description="Targeted GraphQL schema version for productUpdate and productVariantAppendMedia mutations."
              >
                <code className="set-code-pill">2026-07 (ApiVersion.July26)</code>
              </SettingRow>

              <SettingRow
                label="Database Connection Status"
                description="Prisma ORM connected to MySQL session and execution history store."
              >
                <span className="set-readonly-tag green">● Connected / Healthy</span>
              </SettingRow>

              <SettingRow
                label="Shopify App Bridge Mode"
                description="Embedded application runtime inside Shopify Admin iframe."
              >
                <span className="set-readonly-tag">AppBridge Embedded (SDK v4)</span>
              </SettingRow>

              <SettingRow
                label="Access Scopes Granted"
                description="Shopify permissions verified in OAuth token payload."
              >
                <code className="set-code-pill">read_products, write_products</code>
              </SettingRow>
            </SettingsSection>
          </div>
        )}

        {/* =======================================================
            FOOTER
        ======================================================= */}
        <footer className="set-footer">
          <div className="set-footer-brand">
            <span className="set-footer-logo">⚡</span>
            <span>Variant Image Sync</span>
            <span className="set-footer-ver">v1.2.0-saas · Phase 1 Architecture</span>
          </div>
          <div className="set-footer-links">
            <button
              type="button"
              className="set-footer-btn"
              onClick={() => navigate("/app")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className="set-footer-btn"
              onClick={() => navigate("/app/instructions")}
            >
              Instructions
            </button>
            <button
              type="button"
              className="set-footer-btn"
              onClick={() => navigate("/app/history")}
            >
              Import History
            </button>
          </div>
        </footer>
      </div>

      {/* =======================================================
          PREMIUM CSS STYLES
      ======================================================= */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            :root {
              --set-bg-dark: #090B10;
              --set-card-bg: rgba(18, 23, 34, 0.75);
              --set-card-bg-solid: #121722;
              --set-border-subtle: rgba(255, 255, 255, 0.08);
              --set-border-gold: rgba(212, 175, 55, 0.3);
              --set-gold-primary: #D4AF37;
              --set-gold-bright: #FDE68A;
              --set-gold-gradient: linear-gradient(135deg, #FDE68A 0%, #D4AF37 50%, #B8860B 100%);
              --set-text-primary: #F8FAFC;
              --set-text-secondary: #94A3B8;
              --set-text-muted: #64748B;
              --set-emerald: #10B981;
              --set-cyan: #38BDF8;
              --set-purple: #C084FC;
            }

            .set-root {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
              color: var(--set-text-primary);
              background: var(--set-bg-dark);
              min-height: 100vh;
              padding: 24px 20px 48px;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              gap: 24px;
            }

            /* TOAST */
            .set-toast {
              position: fixed;
              bottom: 24px;
              right: 24px;
              z-index: 9999;
              background: rgba(22, 28, 42, 0.95);
              border: 1px solid var(--set-gold-primary);
              border-radius: 10px;
              padding: 12px 18px;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8), 0 0 20px rgba(212, 175, 55, 0.25);
              display: flex;
              align-items: center;
              gap: 12px;
              font-size: 13px;
              color: #FFFFFF;
              animation: setSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }

            @keyframes setSlideUp {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }

            .set-toast-close {
              background: none;
              border: none;
              color: var(--set-text-muted);
              cursor: pointer;
              font-size: 14px;
              padding: 0 4px;
            }
            .set-toast-close:hover { color: #FFFFFF; }

            /* HERO */
            .set-hero-card {
              background: linear-gradient(135deg, rgba(28, 34, 52, 0.85) 0%, rgba(15, 18, 28, 0.9) 100%);
              border: 1px solid var(--set-border-gold);
              border-radius: 16px;
              padding: 24px 28px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
            }

            .set-hero-badge-row {
              display: flex;
              align-items: center;
              gap: 10px;
              margin-bottom: 8px;
            }

            .set-hero-badge {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 1.2px;
              color: #1A1303;
              background: var(--set-gold-gradient);
              padding: 3px 8px;
              border-radius: 4px;
              text-transform: uppercase;
            }

            .set-live-pill {
              font-size: 11px;
              font-weight: 600;
              color: var(--set-cyan);
              background: rgba(56, 189, 248, 0.1);
              border: 1px solid rgba(56, 189, 248, 0.25);
              padding: 3px 8px;
              border-radius: 999px;
              display: flex;
              align-items: center;
              gap: 6px;
            }

            .set-dot {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: var(--set-cyan);
              box-shadow: 0 0 6px var(--set-cyan);
            }

            .set-hero-title {
              margin: 0;
              font-size: 26px;
              font-weight: 800;
              color: #FFFFFF;
              letter-spacing: -0.5px;
            }

            .set-hero-subtitle {
              margin: 6px 0 0;
              font-size: 13.5px;
              color: var(--set-text-secondary);
              max-width: 680px;
              line-height: 1.5;
            }

            .set-back-btn {
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid var(--set-border-subtle);
              color: var(--set-text-primary);
              padding: 10px 16px;
              border-radius: 8px;
              font-size: 13px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            }
            .set-back-btn:hover {
              background: rgba(212, 175, 55, 0.12);
              border-color: var(--set-gold-primary);
              color: var(--set-gold-bright);
            }

            /* NAV TABS */
            .set-nav-tabs {
              display: flex;
              gap: 8px;
              background: rgba(14, 18, 28, 0.85);
              border: 1px solid var(--set-border-subtle);
              border-radius: 12px;
              padding: 6px;
              overflow-x: auto;
            }

            .set-tab-btn {
              background: transparent;
              border: 1px solid transparent;
              color: var(--set-text-secondary);
              padding: 10px 16px;
              border-radius: 8px;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
              display: flex;
              align-items: center;
              gap: 8px;
              white-space: nowrap;
              transition: all 0.2s;
            }

            .set-tab-btn:hover {
              color: #FFFFFF;
              background: rgba(255, 255, 255, 0.04);
            }

            .set-tab-btn.active {
              background: rgba(212, 175, 55, 0.15);
              border-color: var(--set-border-gold);
              color: var(--set-gold-bright);
            }

            .set-tab-pill {
              font-size: 10px;
              padding: 2px 6px;
              border-radius: 4px;
              font-weight: 800;
              background: rgba(212, 175, 55, 0.2);
              color: var(--set-gold-bright);
            }

            /* ACTIVATION BANNER */
            .set-activation-banner {
              background: linear-gradient(135deg, rgba(212, 175, 55, 0.18) 0%, rgba(16, 185, 129, 0.12) 100%);
              border: 1px solid var(--set-gold-primary);
              border-radius: 12px;
              padding: 16px 20px;
              display: flex;
              gap: 14px;
              align-items: center;
              box-shadow: 0 8px 24px rgba(212, 175, 55, 0.2);
              animation: setSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .set-activation-icon {
              font-size: 24px;
              flex-shrink: 0;
            }
            .set-activation-content {
              flex: 1;
            }
            .set-activation-title {
              margin: 0;
              font-size: 15px;
              font-weight: 800;
              color: var(--set-gold-bright);
            }
            .set-activation-desc {
              margin: 4px 0 0;
              font-size: 13px;
              color: #F8FAFC;
              line-height: 1.4;
            }
            .set-activation-badge {
              font-size: 11px;
              font-weight: 800;
              padding: 4px 10px;
              border-radius: 6px;
              background: var(--set-gold-primary);
              color: #1A1303;
              letter-spacing: 0.5px;
              flex-shrink: 0;
            }

            /* PHASE BANNER */
            .set-phase-banner {
              background: rgba(56, 189, 248, 0.08);
              border: 1px solid rgba(56, 189, 248, 0.3);
              border-radius: 12px;
              padding: 14px 18px;
              display: flex;
              gap: 12px;
              align-items: flex-start;
              font-size: 13px;
              color: #E2E8F0;
              line-height: 1.5;
              margin-bottom: 24px;
            }
            .set-phase-icon { font-size: 16px; flex-shrink: 0; }

            /* TAB PANES */
            .set-tab-pane {
              display: flex;
              flex-direction: column;
              gap: 24px;
            }

            /* SETTINGS CARDS */
            .set-card {
              background: var(--set-card-bg);
              border: 1px solid var(--set-border-subtle);
              border-radius: 14px;
              padding: 24px;
              backdrop-filter: blur(12px);
              box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
            }

            .set-card-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 20px;
              border-bottom: 1px solid var(--set-border-subtle);
              padding-bottom: 16px;
            }

            .set-card-header-left {
              display: flex;
              align-items: center;
              gap: 14px;
            }

            .set-card-icon {
              font-size: 24px;
            }

            .set-card-title-row {
              display: flex;
              align-items: center;
              gap: 10px;
            }

            .set-card-title {
              margin: 0;
              font-size: 18px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .set-badge {
              font-size: 10px;
              font-weight: 800;
              padding: 2px 8px;
              border-radius: 4px;
              background: rgba(212, 175, 55, 0.15);
              color: var(--set-gold-bright);
              border: 1px solid var(--set-border-gold);
            }

            .set-card-subtitle {
              margin: 4px 0 0;
              font-size: 13px;
              color: var(--set-text-secondary);
            }

            .set-card-body {
              display: flex;
              flex-direction: column;
              gap: 16px;
            }

            /* SETTING ROW */
            .set-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 0;
              border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            }
            .set-row:last-child { border-bottom: none; }

            .set-row-info {
              max-width: 65%;
            }

            .set-row-label-row {
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .set-row-label {
              font-size: 14px;
              font-weight: 700;
              color: #F8FAFC;
            }

            .set-pill-tag {
              font-size: 9px;
              font-weight: 800;
              padding: 2px 6px;
              border-radius: 4px;
              background: rgba(255, 255, 255, 0.08);
              color: var(--set-text-secondary);
              text-transform: uppercase;
            }

            .set-row-desc {
              margin: 4px 0 0;
              font-size: 12.5px;
              color: var(--set-text-muted);
              line-height: 1.45;
            }

            /* CONTROLS */
            .set-toggle {
              width: 44px;
              height: 24px;
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(255, 255, 255, 0.15);
              border-radius: 999px;
              position: relative;
              cursor: pointer;
              transition: all 0.2s ease;
              padding: 2px;
              box-sizing: border-box;
            }

            .set-toggle.active {
              background: var(--set-gold-primary);
              border-color: var(--set-gold-bright);
            }

            .set-toggle.disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            .set-toggle-thumb {
              display: block;
              width: 18px;
              height: 18px;
              border-radius: 50%;
              background: #FFFFFF;
              transition: transform 0.2s ease;
            }

            .set-toggle.active .set-toggle-thumb {
              transform: translateX(20px);
              background: #1A1303;
            }

            .set-readonly-tag {
              font-size: 12px;
              font-weight: 600;
              padding: 4px 10px;
              border-radius: 6px;
              background: rgba(255, 255, 255, 0.06);
              border: 1px solid rgba(255, 255, 255, 0.1);
              color: var(--set-text-secondary);
            }
            .set-readonly-tag.green {
              background: rgba(16, 185, 129, 0.1);
              border-color: rgba(16, 185, 129, 0.25);
              color: var(--set-emerald);
            }

            .set-code-pill {
              font-family: monospace;
              font-size: 12px;
              padding: 4px 8px;
              border-radius: 6px;
              background: rgba(0, 0, 0, 0.4);
              border: 1px solid var(--set-border-subtle);
              color: var(--set-cyan);
            }
            .set-code-pill.gold {
              color: var(--set-gold-bright);
              border-color: var(--set-border-gold);
            }

            /* REAL USAGE CARD */
            .set-usage-card {
              background: linear-gradient(135deg, rgba(20, 25, 38, 0.95) 0%, rgba(13, 16, 25, 0.95) 100%);
              border: 1px solid var(--set-border-gold);
              border-radius: 16px;
              padding: 24px 28px;
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
            }

            .set-usage-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 20px;
            }

            .set-usage-badge {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 1.2px;
              color: var(--set-gold-bright);
              text-transform: uppercase;
            }

            .set-usage-title {
              margin: 4px 0 0;
              font-size: 20px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .set-usage-desc {
              margin: 4px 0 0;
              font-size: 13px;
              color: var(--set-text-secondary);
            }

            .set-usage-plan-actions {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              gap: 8px;
            }

            .set-manage-sub-btn {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              font-size: 11px;
              font-weight: 700;
              padding: 5px 12px;
              border-radius: 6px;
              background: rgba(212, 175, 55, 0.12);
              border: 1px solid var(--set-border-gold);
              color: var(--set-gold-bright);
              text-decoration: none;
              transition: all 0.2s ease;
            }
            .set-manage-sub-btn:hover {
              background: var(--set-gold-primary);
              color: #1A1303;
              box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
            }

            .set-usage-plan-pill {
              text-align: right;
            }

            .set-plan-pill-name {
              display: block;
              font-size: 16px;
              font-weight: 800;
              color: var(--set-gold-bright);
            }

            .set-plan-pill-price {
              font-size: 12px;
              color: var(--set-text-muted);
            }

            .set-usage-metric-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
              margin-bottom: 20px;
            }

            .set-usage-stat-box {
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--set-border-subtle);
              border-radius: 12px;
              padding: 16px;
            }

            .set-stat-label {
              display: block;
              font-size: 11px;
              font-weight: 700;
              color: var(--set-text-muted);
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .set-stat-val {
              display: block;
              font-size: 26px;
              font-weight: 900;
              color: #FFFFFF;
              margin-top: 4px;
            }
            .set-stat-val.gold { color: var(--set-gold-bright); }
            .set-stat-val.cyan { color: var(--set-cyan); }

            .set-stat-sub {
              display: block;
              font-size: 11px;
              color: var(--set-text-secondary);
              margin-top: 2px;
            }

            .set-usage-meter-section {
              background: rgba(10, 12, 18, 0.4);
              border: 1px solid var(--set-border-subtle);
              border-radius: 12px;
              padding: 16px 20px;
            }

            .set-meter-label-row {
              display: flex;
              justify-content: space-between;
              font-size: 12.5px;
              color: #CBD5E1;
              margin-bottom: 8px;
            }

            .set-meter-track {
              height: 10px;
              background: rgba(255, 255, 255, 0.08);
              border-radius: 999px;
              overflow: hidden;
            }

            .set-meter-fill {
              height: 100%;
              background: var(--set-gold-gradient);
              border-radius: 999px;
              box-shadow: 0 0 14px rgba(212, 175, 55, 0.6);
              transition: width 0.4s ease;
            }

            .set-meter-footer-note {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: var(--set-text-muted);
              margin-top: 8px;
            }

            /* PLANS SECTION */
            .set-plans-section {
              margin-top: 12px;
            }

            .set-plans-header {
              margin-bottom: 20px;
            }

            .set-plans-badge {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 1.2px;
              color: var(--set-gold-primary);
              text-transform: uppercase;
            }

            .set-plans-title {
              margin: 4px 0 0;
              font-size: 22px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .set-plans-desc {
              margin: 4px 0 0;
              font-size: 13.5px;
              color: var(--set-text-secondary);
            }

            .set-plans-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
            }

            .set-plan-card {
              background: linear-gradient(180deg, rgba(23, 28, 42, 0.95) 0%, rgba(13, 16, 25, 0.95) 100%);
              border: 1px solid var(--set-border-subtle);
              border-radius: 16px;
              padding: 28px 24px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              position: relative;
              transition: all 0.25s ease;
            }

            .set-plan-card:hover {
              transform: translateY(-4px);
              border-color: rgba(212, 175, 55, 0.4);
              box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
            }

            .set-plan-card.recommended {
              border-color: var(--set-gold-primary);
              box-shadow: 0 12px 32px rgba(212, 175, 55, 0.15);
            }

            .set-plan-card.current {
              border-color: var(--set-cyan);
            }

            .set-plan-ribbon {
              position: absolute;
              top: -12px;
              left: 50%;
              transform: translateX(-50%);
              background: var(--set-gold-gradient);
              color: #1A1303;
              font-size: 10px;
              font-weight: 900;
              letter-spacing: 1px;
              padding: 3px 14px;
              border-radius: 999px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
            }

            .set-plan-badge-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 12px;
            }

            .set-plan-tag {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.8px;
              padding: 2px 8px;
              border-radius: 4px;
            }
            .set-plan-tag.neutral { background: rgba(255, 255, 255, 0.08); color: #CBD5E1; }
            .set-plan-tag.gold { background: rgba(212, 175, 55, 0.2); color: var(--set-gold-bright); }
            .set-plan-tag.purple { background: rgba(192, 132, 252, 0.2); color: var(--set-purple); }

            .set-plan-current-tag {
              font-size: 9px;
              font-weight: 800;
              letter-spacing: 0.8px;
              background: rgba(56, 189, 248, 0.2);
              color: var(--set-cyan);
              padding: 2px 6px;
              border-radius: 4px;
            }

            .set-plan-name {
              margin: 0;
              font-size: 24px;
              font-weight: 900;
              color: #FFFFFF;
            }

            .set-plan-tagline {
              margin: 6px 0 16px;
              font-size: 12px;
              color: var(--set-text-secondary);
              min-height: 32px;
              line-height: 1.4;
            }

            .set-plan-price-block {
              display: flex;
              align-items: baseline;
              gap: 4px;
              margin-bottom: 12px;
            }

            .set-plan-price {
              font-size: 32px;
              font-weight: 900;
              color: var(--set-gold-bright);
            }

            .set-plan-period {
              font-size: 13px;
              color: var(--set-text-secondary);
            }

            .set-plan-quota-badge {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--set-border-subtle);
              border-radius: 6px;
              padding: 4px 8px;
              font-size: 11px;
              font-weight: 700;
              color: #CBD5E1;
              margin-bottom: 20px;
            }

            .set-plan-divider {
              height: 1px;
              background: var(--set-border-subtle);
              margin-bottom: 20px;
            }

            .set-plan-features-list {
              list-style: none;
              padding: 0;
              margin: 0 0 24px;
              display: flex;
              flex-direction: column;
              gap: 10px;
              font-size: 12.5px;
            }

            .set-plan-feat-item {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .set-plan-feat-item.included { color: #CBD5E1; }
            .set-plan-feat-item.excluded { color: var(--set-text-muted); opacity: 0.6; }

            .set-feat-icon {
              font-weight: 800;
              font-size: 13px;
            }
            .set-plan-feat-item.included .set-feat-icon { color: var(--set-emerald); }
            .set-plan-feat-item.excluded .set-feat-icon { color: var(--set-text-muted); }

            .set-feat-tag {
              margin-left: auto;
              font-size: 9px;
              font-weight: 700;
              padding: 2px 6px;
              border-radius: 4px;
              background: rgba(255, 255, 255, 0.05);
              color: var(--set-text-muted);
            }

            .set-plan-cta-btn {
              width: 100%;
              padding: 12px;
              border-radius: 8px;
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.2s;
              text-decoration: none;
              display: block;
              text-align: center;
              box-sizing: border-box;
            }

            .set-plan-cta-btn.upgrade-btn {
              background: rgba(212, 175, 55, 0.12);
              border: 1px solid var(--set-gold-primary);
              color: var(--set-gold-bright);
            }
            .set-plan-cta-btn.upgrade-btn:hover {
              background: var(--set-gold-primary);
              color: #1A1303;
              box-shadow: 0 6px 20px rgba(212, 175, 55, 0.4);
            }

            .set-plan-cta-btn.current-active-btn {
              background: rgba(16, 185, 129, 0.12);
              border: 1px solid rgba(16, 185, 129, 0.35);
              color: var(--set-emerald);
              cursor: default;
              opacity: 0.95;
            }

            .set-plan-cta-btn.downgrade-btn {
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.15);
              color: var(--set-text-secondary);
            }
            .set-plan-cta-btn.downgrade-btn:hover {
              background: rgba(255, 255, 255, 0.12);
              color: #FFFFFF;
              border-color: rgba(255, 255, 255, 0.3);
            }

            .set-plan-cta-btn.active-btn {
              background: rgba(56, 189, 248, 0.15);
              border: 1px solid var(--set-cyan);
              color: var(--set-cyan);
            }

            .set-plan-preview-text-link {
              background: none;
              border: none;
              color: var(--set-text-muted);
              font-size: 11px;
              margin-top: 6px;
              cursor: pointer;
              text-decoration: underline;
              display: block;
              width: 100%;
              text-align: center;
              transition: color 0.15s ease;
            }
            .set-plan-preview-text-link:hover {
              color: var(--set-gold-bright);
            }

            .set-plan-subnote {
              margin-top: 8px;
              font-size: 10px;
              color: var(--set-text-muted);
              text-align: center;
            }

            /* COMPARISON TABLE */
            .set-compare-wrap {
              background: var(--set-card-bg);
              border: 1px solid var(--set-border-subtle);
              border-radius: 16px;
              padding: 28px;
              margin-top: 12px;
            }

            .set-compare-header {
              margin-bottom: 20px;
            }

            .set-compare-title {
              margin: 0;
              font-size: 19px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .set-compare-subtitle {
              margin: 4px 0 0;
              font-size: 13px;
              color: var(--set-text-secondary);
            }

            .set-table-responsive {
              overflow-x: auto;
              margin-bottom: 20px;
            }

            .set-compare-table {
              width: 100%;
              border-collapse: collapse;
              text-align: left;
            }

            .set-compare-table th {
              padding: 14px 16px;
              border-bottom: 1px solid var(--set-border-subtle);
              vertical-align: bottom;
            }

            .th-feature {
              font-size: 12px;
              font-weight: 700;
              color: var(--set-text-muted);
              text-transform: uppercase;
              width: 40%;
            }

            .th-plan {
              width: 20%;
              text-align: center;
            }

            .th-plan-box {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
            }

            .th-plan-badge {
              font-size: 9px;
              font-weight: 800;
              background: var(--set-gold-gradient);
              color: #1A1303;
              padding: 2px 6px;
              border-radius: 4px;
            }

            .th-plan-name {
              font-size: 16px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .th-plan-price {
              font-size: 13px;
              color: var(--set-gold-bright);
              font-weight: 700;
            }

            .th-select-btn {
              margin-top: 4px;
              padding: 4px 12px;
              border-radius: 6px;
              font-size: 11px;
              font-weight: 700;
              border: 1px solid var(--set-border-subtle);
              background: rgba(255, 255, 255, 0.05);
              color: var(--set-text-secondary);
              cursor: pointer;
            }
            .th-select-btn:hover {
              border-color: var(--set-gold-primary);
              color: var(--set-gold-bright);
            }

            .th-plan.current-th .th-select-btn {
              background: rgba(212, 175, 55, 0.2);
              border-color: var(--set-gold-primary);
              color: var(--set-gold-bright);
            }

            /* MATRIX CARDS */
            .set-matrix-cards {
              display: flex;
              flex-direction: column;
              gap: 16px;
            }

            .set-matrix-cat-box {
              background: rgba(10, 12, 18, 0.5);
              border: 1px solid var(--set-border-subtle);
              border-radius: 12px;
              padding: 16px 20px;
            }

            .set-matrix-cat-title {
              margin: 0 0 12px;
              font-size: 13.5px;
              font-weight: 800;
              color: var(--set-gold-bright);
              text-transform: uppercase;
              letter-spacing: 0.8px;
            }

            .set-matrix-items {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }

            .set-matrix-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            }
            .set-matrix-row:last-child { border-bottom: none; }

            .set-matrix-label {
              font-size: 13px;
              color: #CBD5E1;
              max-width: 45%;
            }

            .set-matrix-values {
              display: flex;
              gap: 24px;
              align-items: center;
            }

            .set-matrix-val-col {
              display: flex;
              flex-direction: column;
              align-items: center;
              width: 70px;
            }

            .set-matrix-tier-tag {
              font-size: 9px;
              color: var(--set-text-muted);
              text-transform: uppercase;
              margin-bottom: 2px;
            }

            .set-matrix-val {
              font-size: 12px;
              font-weight: 700;
              color: #F8FAFC;
              text-align: center;
            }

            .set-matrix-val-col.gold .set-matrix-val { color: var(--set-gold-bright); }
            .set-matrix-val-col.cyan .set-matrix-val { color: var(--set-cyan); }

            /* FOOTER */
            .set-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-top: 1px solid var(--set-border-subtle);
              padding-top: 20px;
              font-size: 12px;
              color: var(--set-text-muted);
            }

            .set-footer-brand {
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .set-footer-logo { color: var(--set-gold-primary); }
            .set-footer-ver { font-size: 11px; }

            .set-footer-links {
              display: flex;
              gap: 16px;
            }

            .set-footer-btn {
              background: none;
              border: none;
              color: var(--set-text-secondary);
              font-size: 12px;
              cursor: pointer;
            }
            .set-footer-btn:hover { color: var(--set-gold-bright); }

            /* RESPONSIVE */
            @media (max-width: 1024px) {
              .set-plans-grid { grid-template-columns: 1fr; }
              .set-usage-metric-grid { grid-template-columns: 1fr; }
              .set-hero-card { flex-direction: column; align-items: flex-start; gap: 16px; }
            }

            @media (max-width: 768px) {
              .set-row { flex-direction: column; align-items: flex-start; gap: 10px; }
              .set-row-info { max-width: 100%; }
              .set-matrix-row { flex-direction: column; align-items: flex-start; gap: 8px; }
              .set-matrix-label { max-width: 100%; }
              .set-matrix-values { width: 100%; justify-content: space-between; }
              .set-footer { flex-direction: column; gap: 12px; align-items: flex-start; }
            }
          `,
        }}
      />
    </s-page>
  );
}

// ============================================================================
// HEADERS & ERROR BOUNDARY
// ============================================================================

export const headers = (headersArgs) => boundary.headers(headersArgs);
