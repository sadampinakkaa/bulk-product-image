import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useFetcher,
  useLoaderData,
  useNavigate,
} from "react-router";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import {
  authenticate,
} from "../shopify.server";

import db from "../db.server";

import {
  createImportJob,
} from "../services/image-import.server.js";

// ======================================================
// LOADER (Fetches Recent History & Aggregate Store Stats)
// ======================================================

export const loader = async ({
  request,
}) => {
  try {
    const {
      session,
    } = await authenticate.admin(
      request
    );

    const shop = session?.shop || "";

    const recentRecords =
      await db.importHistory.findMany({
        where: {
          shop,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      });

    const aggregates =
      await db.importHistory.aggregate({
        where: {
          shop,
        },
        _sum: {
          imagesFound: true,
          variantsMatched: true,
          imagesUploaded: true,
          imagesAssigned: true,
          skuNotFound: true,
          errors: true,
        },
        _count: {
          id: true,
        },
      });

    return Response.json({
      shop,
      recentImports: recentRecords.map(
        (item) => ({
          id: item.id,
          driveUrl: item.driveUrl,
          status: item.status,
          startedAt: item.startedAt ? item.startedAt.toISOString() : null,
          completedAt: item.completedAt ? item.completedAt.toISOString() : null,
          createdAt: item.createdAt ? item.createdAt.toISOString() : null,
          imagesFound: item.imagesFound,
          variantsMatched: item.variantsMatched,
          imagesUploaded: item.imagesUploaded,
          imagesAssigned: item.imagesAssigned,
          skuNotFound: item.skuNotFound,
          errors: item.errors,
          message: item.message,
        })
      ),
      historicalStats: {
        totalImports: aggregates._count.id || 0,
        totalFound: aggregates._sum.imagesFound || 0,
        totalMatched: aggregates._sum.variantsMatched || 0,
        totalUploaded: aggregates._sum.imagesUploaded || 0,
        totalAssigned: aggregates._sum.imagesAssigned || 0,
        totalSkipped: aggregates._sum.skuNotFound || 0,
        totalErrors: aggregates._sum.errors || 0,
      },
    });
  } catch (err) {
    console.error("Dashboard loader error:", err);
    return Response.json({
      shop: "",
      recentImports: [],
      historicalStats: {
        totalImports: 0,
        totalFound: 0,
        totalMatched: 0,
        totalUploaded: 0,
        totalAssigned: 0,
        totalSkipped: 0,
        totalErrors: 0,
      },
    });
  }
};

// ======================================================
// ACTION (Starts the background Google Drive Import Job)
// ======================================================

export const action = async ({
  request,
}) => {
  try {
    const {
      admin,
      session,
    } = await authenticate.admin(
      request
    );

    const formData =
      await request.formData();

    const driveUrl = String(
      formData.get("driveUrl") || ""
    ).trim();

    if (!driveUrl) {
      return Response.json(
        {
          ok: false,
          message:
            "Please enter your Google Drive folder URL.",
        },
        {
          status: 400,
        }
      );
    }

    if (!isValidDriveUrl(driveUrl)) {
      return Response.json(
        {
          ok: false,
          message:
            "Please enter a valid Google Drive folder URL.",
        },
        {
          status: 400,
        }
      );
    }

    if (!admin) {
      return Response.json(
        {
          ok: false,
          message:
            "Shopify Admin connection could not be established.",
        },
        {
          status: 500,
        }
      );
    }

    if (!session?.shop) {
      return Response.json(
        {
          ok: false,
          message:
            "Shop session could not be identified.",
        },
        {
          status: 500,
        }
      );
    }

    const jobId =
      await createImportJob({
        admin,
        shop: session.shop,
        driveUrl,
      });

    return Response.json({
      ok: true,
      jobId,
      message:
        "Import started.",
    });
  } catch (error) {
    console.error(
      "Start import error:",
      error
    );

    return Response.json(
      {
        ok: false,
        message:
          error?.message ||
          "Unable to start the image import.",
      },
      {
        status: 500,
      }
    );
  }
};

// ======================================================
// DRIVE URL VALIDATION
// ======================================================

function isValidDriveUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "drive.google.com" ||
        url.hostname.endsWith(".google.com")) &&
      (url.pathname.includes("/folders/") ||
        url.searchParams.has("id"))
    );
  } catch {
    return false;
  }
}

// ======================================================
// TIME FORMAT HELPER
// ======================================================

function formatTime(seconds) {
  if (!seconds || seconds <= 0) {
    return "Calculating...";
  }

  if (seconds < 60) {
    return `${Math.ceil(seconds)} sec`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.ceil(seconds % 60);

  if (minutes < 60) {
    return `${minutes}m ${remaining}s`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return `${hours}h ${mins}m`;
}

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function cleanSkuExtract(filename) {
  if (!filename) return "";
  const name = filename.replace(/\.[^/.]+$/, "");
  // remove typical photo suffixes like _1, _front, -1 etc
  return name.replace(/[_-](front|back|side|thumb|alt|\d+)$/i, "").trim();
}

// ======================================================
// DASHBOARD COMPONENT
// ======================================================

export default function Dashboard() {
  const navigate = useNavigate();
  const loaderData = useLoaderData() || {};

  const recentImports = loaderData.recentImports || [];
  const historicalStats = loaderData.historicalStats || {
    totalImports: 0,
    totalFound: 0,
    totalMatched: 0,
    totalUploaded: 0,
    totalAssigned: 0,
    totalSkipped: 0,
    totalErrors: 0,
  };

  const startFetcher = useFetcher();
  const statusFetcher = useFetcher();

  const [driveUrl, setDriveUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);

  // Plan simulator state (Starter $4.99 vs Growth $10.99 vs Pro $19.99)
  const [selectedPlan, setSelectedPlan] = useState("starter");
  const [testSkuInput, setTestSkuInput] = useState("TSHIRT-BLK-M.jpg");

  const result = startFetcher.data;
  const isStarting = startFetcher.state !== "idle";

  // Job Data
  const progress = status?.progress || null;
  const summary = status?.summary || null;
  const errors = Array.isArray(status?.errors) ? status.errors : [];

  const isRunning =
    status?.status === "starting" || status?.status === "processing";

  const isFinished =
    status?.status === "completed" ||
    status?.status === "completed_with_errors" ||
    status?.status === "failed";

  // Job Created Hook
  useEffect(() => {
    if (result?.ok && result.jobId) {
      setJobId(result.jobId);
      setStatus(null);
    }
  }, [result]);

  // Polling Hook
  useEffect(() => {
    if (!jobId) {
      return;
    }

    let stopped = false;
    let timer = null;

    const poll = () => {
      if (stopped) return;

      if (statusFetcher.state === "idle") {
        statusFetcher.load(
          `/app/import-status?jobId=${encodeURIComponent(jobId)}`
        );
      }

      timer = setTimeout(poll, 3000);
    };

    poll();

    return () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [jobId]);

  // Status Hook
  useEffect(() => {
    if (statusFetcher.data?.ok) {
      setStatus(statusFetcher.data);
    }
  }, [statusFetcher.data]);

  // Progress percentage
  const progressPercent = useMemo(() => {
    if (!progress?.total) {
      return 0;
    }

    return Math.min(
      100,
      Math.round((progress.processed / progress.total) * 100)
    );
  }, [progress]);

  // Active or Fallback stats for the KPI section
  const displayStats = useMemo(() => {
    if (status && summary) {
      return {
        found: summary.imagesFound ?? progress?.total ?? 0,
        matched: summary.variantsMatched ?? 0,
        uploaded: summary.imagesUploaded ?? 0,
        assigned: summary.imagesAssigned ?? 0,
        skipped: summary.skuNotFound ?? 0,
        errors: summary.errors ?? 0,
        isLive: true,
      };
    }

    // Historical aggregates fallback or idle state
    return {
      found: historicalStats.totalFound || 0,
      matched: historicalStats.totalMatched || 0,
      uploaded: historicalStats.totalUploaded || 0,
      assigned: historicalStats.totalAssigned || 0,
      skipped: historicalStats.totalSkipped || 0,
      errors: historicalStats.totalErrors || 0,
      isLive: false,
    };
  }, [status, summary, progress, historicalStats]);

  // Handlers
  const handleImport = () => {
    const value = driveUrl.trim();
    setUrlError("");

    if (!value) {
      setUrlError("Please enter your Google Drive folder URL.");
      return;
    }

    if (!isValidDriveUrl(value)) {
      setUrlError("Please enter a valid Google Drive folder URL.");
      return;
    }

    setJobId(null);
    setStatus(null);

    startFetcher.submit(
      {
        driveUrl: value,
      },
      {
        method: "post",
      }
    );
  };

  const handleClear = () => {
    setDriveUrl("");
    setUrlError("");
    setJobId(null);
    setStatus(null);
  };

  const handleSamplePaste = () => {
    const sample = "https://drive.google.com/drive/folders/1A2B3C4D5E6F7G8H9I0J-sample";
    setDriveUrl(sample);
    setUrlError("");
  };

  // Tested SKU computation
  const extractedSku = useMemo(() => {
    return cleanSkuExtract(testSkuInput);
  }, [testSkuInput]);

  return (
    <s-page heading="Variant Image Sync" inline-size="large">
      {/* App Bridge Top Navigation Actions */}
      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() => navigate("/app/history")}
      >
        Import History
      </s-button>

      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() => navigate("/app/instructions")}
      >
        Instructions Guide
      </s-button>

      {/* =========================================================
          PREMIUM SAAS DASHBOARD ROOT
      ========================================================= */}
      <div className="vis-root">
        
        {/* =======================================================
            1. HERO & HEADER SECTION
        ======================================================= */}
        <div className="vis-card vis-hero-card">
          <div className="vis-hero-glow"></div>
          <div className="vis-hero-content">
            <div className="vis-badge-row">
              <span className="vis-badge vis-badge-gold">
                <span className="vis-sparkle">✦</span> BULK SYNC ENGINE V2.4
              </span>
              <span className="vis-badge vis-badge-charcoal">
                <span className="vis-dot-green"></span> SHOPIFY GRAPHQL API
              </span>
              <span className="vis-badge vis-badge-charcoal">
                <span className="vis-dot-gold"></span> CLOUD DRIVE CONNECT
              </span>
            </div>

            <h1 className="vis-hero-title">
              Automated Variant Image Sync
            </h1>
            <p className="vis-hero-subtitle">
              Synchronize thousands of product variant images directly from a public Google Drive folder.
              Our engine parses file titles by SKU and attaches high-resolution media directly to Shopify variants with automated CDN staging.
            </p>

            <div className="vis-hero-chips">
              <div className="vis-chip">
                <span className="vis-chip-icon">⚡</span>
                <span>Zero-touch variant matching</span>
              </div>
              <div className="vis-chip">
                <span className="vis-chip-icon">🛡️</span>
                <span>Non-destructive catalog sync</span>
              </div>
              <div className="vis-chip">
                <span className="vis-chip-icon">📈</span>
                <span>Up to 20MB / image auto-optimized</span>
              </div>
            </div>
          </div>

          <div className="vis-hero-meta">
            <div className="vis-tier-pill">
              <div className="vis-tier-title">PLAN TIER (PREVIEW)</div>
              <div className="vis-tier-name">
                {selectedPlan === "starter"
                  ? "Starter Plan"
                  : selectedPlan === "growth"
                  ? "Growth Plan"
                  : "Pro Plan"}
              </div>
              <div className="vis-tier-price">
                {selectedPlan === "starter"
                  ? "$4.99"
                  : selectedPlan === "growth"
                  ? "$10.99"
                  : "$19.99"}
                <span>/mo</span>
              </div>
              <button
                type="button"
                className="vis-tier-toggle-btn"
                onClick={() =>
                  setSelectedPlan(
                    selectedPlan === "starter"
                      ? "growth"
                      : selectedPlan === "growth"
                      ? "pro"
                      : "starter",
                  )
                }
              >
                Preview{" "}
                {selectedPlan === "starter"
                  ? "Growth ($10.99)"
                  : selectedPlan === "growth"
                  ? "Pro ($19.99)"
                  : "Starter ($4.99)"}
              </button>
              <div className="vis-tier-subnote">UI Placeholder · Billing Inactive</div>
            </div>
          </div>
        </div>

        {/* =======================================================
            GRID: 2. PRIMARY CTA & DRIVE CARD + 10. PLAN & USAGE CARD
        ======================================================= */}
        <div className="vis-grid-2col">
          {/* 3. GOOGLE DRIVE CONNECTION / STATUS CARD */}
          <div className="vis-card vis-main-input-card">
            <div className="vis-card-header">
              <div className="vis-card-header-left">
                <div className="vis-icon-avatar">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M8.2 2H15.8L22 13H14.4L8.2 2Z"
                      fill="#ECC968"
                    />
                    <path
                      d="M2 13L5.8 6.5L13.5 20H5.8L2 13Z"
                      fill="#D4AF37"
                    />
                    <path
                      d="M14.4 13L10.6 20H22L22 13H14.4Z"
                      fill="#AA820A"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="vis-card-title">Google Drive Folder Source</h2>
                  <p className="vis-card-desc">
                    Enter a public Google Drive folder link containing your SKU-named photos.
                  </p>
                </div>
              </div>

              <div className="vis-status-indicator">
                <span className="vis-pulse-dot"></span>
                <span>READY TO SYNC</span>
              </div>
            </div>

            {/* Input Container */}
            <div className="vis-input-group">
              <label htmlFor="drive-url-input" className="vis-input-label">
                Google Drive Folder URL
              </label>
              <div className="vis-input-wrapper">
                <span className="vis-input-prefix">🔗</span>
                <input
                  id="drive-url-input"
                  type="url"
                  className={`vis-text-input ${urlError ? "vis-input-has-error" : ""}`}
                  placeholder="https://drive.google.com/drive/folders/1AbC... or folder ID"
                  value={driveUrl}
                  disabled={isStarting || isRunning}
                  onChange={(e) => {
                    setDriveUrl(e.target.value);
                    setUrlError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isStarting && !isRunning) {
                      e.preventDefault();
                      handleImport();
                    }
                  }}
                />
                {driveUrl && (
                  <button
                    type="button"
                    className="vis-input-clear-btn"
                    onClick={() => {
                      setDriveUrl("");
                      setUrlError("");
                    }}
                    title="Clear URL"
                  >
                    ✕
                  </button>
                )}
              </div>

              {urlError && (
                <div className="vis-error-banner">
                  <span className="vis-error-icon">⚠️</span>
                  <span>{urlError}</span>
                </div>
              )}

              <div className="vis-input-helpers">
                <div className="vis-format-hint">
                  <span className="vis-hint-tag">MATCH RULE</span>
                  <code>ABC-001.jpg</code>
                  <span className="vis-arrow">→</span>
                  <span className="vis-hint-res">Shopify SKU: ABC-001</span>
                </div>
                <button
                  type="button"
                  className="vis-sample-link"
                  onClick={handleSamplePaste}
                >
                  Insert Sample Link
                </button>
              </div>
            </div>

            {/* 2. CLEAR “SYNC VARIANT IMAGES” PRIMARY CTA */}
            <div className="vis-action-bar">
              <button
                type="button"
                className="vis-btn-primary"
                onClick={handleImport}
                disabled={isStarting || isRunning || !driveUrl.trim()}
              >
                {isStarting ? (
                  <>
                    <span className="vis-spinner"></span>
                    <span>Initializing Pipeline...</span>
                  </>
                ) : isRunning ? (
                  <>
                    <span className="vis-spinner"></span>
                    <span>Syncing In Progress...</span>
                  </>
                ) : (
                  <>
                    <span className="vis-btn-sparkle">✦</span>
                    <span>Sync Variant Images</span>
                  </>
                )}
              </button>

              <button
                type="button"
                className="vis-btn-secondary"
                onClick={handleClear}
                disabled={isStarting || isRunning || !driveUrl}
              >
                Reset
              </button>

              <button
                type="button"
                className="vis-btn-ghost"
                onClick={() => navigate("/app/history")}
              >
                View History
              </button>
            </div>
          </div>

          {/* 10. PLAN & USAGE CARD (STARTER $4.99 / GROWTH $10.99 / PRO $19.99 - UI PLACEHOLDER) */}
          <div className="vis-card vis-plan-card">
            {/* Interactive Tier Switcher Tabs */}
            <div className="vis-plan-tier-tabs">
              <button
                type="button"
                className={`vis-plan-tab-btn ${selectedPlan === "starter" ? "active" : ""}`}
                onClick={() => setSelectedPlan("starter")}
              >
                Starter ($4.99)
              </button>
              <button
                type="button"
                className={`vis-plan-tab-btn ${selectedPlan === "growth" ? "active" : ""}`}
                onClick={() => setSelectedPlan("growth")}
              >
                Growth ($10.99)
              </button>
              <button
                type="button"
                className={`vis-plan-tab-btn ${selectedPlan === "pro" ? "active" : ""}`}
                onClick={() => setSelectedPlan("pro")}
              >
                Pro ($19.99)
              </button>
            </div>

            <div className="vis-plan-header">
              <div>
                <span className="vis-plan-badge">
                  {selectedPlan === "starter"
                    ? "STARTER TIER (UI PLACEHOLDER)"
                    : selectedPlan === "growth"
                    ? "GROWTH TIER (UI PLACEHOLDER)"
                    : "PRO ENTERPRISE (UI PLACEHOLDER)"}
                </span>
                <h3 className="vis-plan-title">
                  {selectedPlan === "starter"
                    ? "Starter Sync Plan"
                    : selectedPlan === "growth"
                    ? "Growth Sync Plan"
                    : "Pro Enterprise Plan"}
                </h3>
              </div>
              <div className="vis-plan-price-tag">
                <div className="vis-plan-price-val">
                  {selectedPlan === "starter"
                    ? "$4.99"
                    : selectedPlan === "growth"
                    ? "$10.99"
                    : "$19.99"}
                </div>
                <div className="vis-plan-period">per month (placeholder)</div>
              </div>
            </div>

            {/* Monthly Image Usage Meter Grounded in Real Store Totals */}
            <div className="vis-usage-block">
              <div className="vis-usage-info">
                <span>Store Synced Images (Assigned Total)</span>
                <strong>
                  {selectedPlan === "starter"
                    ? `${(historicalStats.totalAssigned || 0).toLocaleString()} / 1,000 tier limit`
                    : selectedPlan === "growth"
                    ? `${(historicalStats.totalAssigned || 0).toLocaleString()} / 5,000 tier limit`
                    : `${(historicalStats.totalAssigned || 0).toLocaleString()} / Unlimited`}
                </strong>
              </div>
              <div className="vis-usage-bar-track">
                <div
                  className="vis-usage-bar-fill"
                  style={{
                    width:
                      selectedPlan === "starter"
                        ? `${Math.min(100, Math.round(((historicalStats.totalAssigned || 0) / 1000) * 100))}%`
                        : selectedPlan === "growth"
                        ? `${Math.min(100, Math.round(((historicalStats.totalAssigned || 0) / 5000) * 100))}%`
                        : "100%",
                  }}
                ></div>
              </div>
              <div className="vis-usage-meta">
                <span>
                  {selectedPlan === "starter"
                    ? `${Math.min(100, Math.round(((historicalStats.totalAssigned || 0) / 1000) * 100))}% of Starter capacity`
                    : selectedPlan === "growth"
                    ? `${Math.min(100, Math.round(((historicalStats.totalAssigned || 0) / 5000) * 100))}% of Growth capacity`
                    : "Unmetered volume on Pro tier"}
                </span>
                <span>UI Preview · Billing inactive</span>
              </div>
            </div>

            <div className="vis-plan-features">
              <div className="vis-feat-item">
                <span className="vis-check">✓</span>
                <span>Direct Google Drive folder batch ingestion</span>
              </div>
              <div className="vis-feat-item">
                <span className="vis-check">✓</span>
                <span>Automated SKU exact & trimmed matching</span>
              </div>
              <div className="vis-feat-item">
                <span className="vis-check">✓</span>
                <span>Shopify GraphQL Staged Upload API</span>
              </div>
              <div className="vis-feat-item">
                <span className="vis-check">
                  {selectedPlan === "pro" ? "✓" : selectedPlan === "growth" ? "✓" : "✦"}
                </span>
                <span className={selectedPlan === "starter" ? "vis-feat-locked" : ""}>
                  {selectedPlan === "pro"
                    ? "Priority concurrent processing queue"
                    : selectedPlan === "growth"
                    ? "Accelerated queue processing"
                    : "Priority processing (Growth / Pro feature)"}
                </span>
              </div>
            </div>

            <div className="vis-plan-footer">
              <button
                type="button"
                className="vis-plan-upgrade-btn"
                onClick={() =>
                  setSelectedPlan(
                    selectedPlan === "starter"
                      ? "growth"
                      : selectedPlan === "growth"
                      ? "pro"
                      : "starter",
                  )
                }
              >
                {selectedPlan === "starter"
                  ? "Preview Growth Tier ($10.99/mo)"
                  : selectedPlan === "growth"
                  ? "Preview Pro Tier ($19.99/mo)"
                  : "Preview Starter Tier ($4.99/mo)"}
              </button>
              <div className="vis-plan-note">
                UI structure prepared for future billing integration. No charges applied.
              </div>
            </div>
          </div>
        </div>

        {/* =======================================================
            SUBMISSION ERROR BANNER
        ======================================================= */}
        {result?.ok === false && (
          <div className="vis-alert-banner">
            <div className="vis-alert-icon">✕</div>
            <div className="vis-alert-text">
              <strong>Import initialization error</strong>
              <span>{result.message}</span>
            </div>
          </div>
        )}

        {/* =======================================================
            LIVE PROGRESS & JOB STATUS (Appears during/after import)
        ======================================================= */}
        {status && (
          <div className="vis-card vis-live-card">
            <div className="vis-live-header">
              <div>
                <span className="vis-live-eyebrow">
                  {isRunning ? "PROCESSING PIPELINE" : "JOB COMPLETED"}
                </span>
                <h3 className="vis-live-title">
                  {status.status === "completed"
                    ? "✓ Image Synchronization Completed Successfully"
                    : status.status === "completed_with_errors"
                    ? "⚠️ Synchronization Finished With Some Skipped Items"
                    : status.status === "failed"
                    ? "✕ Pipeline Stopped With Errors"
                    : "⚡ Syncing Images to Shopify Variants..."}
                </h3>
              </div>

              <div className="vis-live-counter">
                <span className="vis-counter-numbers">
                  {progress?.processed || 0}
                  <span className="vis-counter-denom">
                    {" "}/ {progress?.total || 0} images
                  </span>
                </span>
                <div className="vis-percent-pill">{progressPercent}%</div>
              </div>
            </div>

            {/* Glowing Golden Progress Bar */}
            <div className="vis-progress-track">
              <div
                className="vis-progress-fill"
                style={{ width: `${progressPercent}%` }}
              >
                <div className="vis-progress-shimmer"></div>
              </div>
            </div>

            <div className="vis-progress-meta-row">
              <div className="vis-meta-item">
                <span className="vis-meta-dot blue"></span>
                <span>
                  <strong>{progress?.processed || 0}</strong> processed
                </span>
              </div>
              <div className="vis-meta-item">
                <span className="vis-meta-dot gold"></span>
                <span>
                  <strong>
                    {Math.max(0, (progress?.total || 0) - (progress?.processed || 0))}
                  </strong>{" "}
                  remaining
                </span>
              </div>
              <div className="vis-meta-item">
                <span className="vis-meta-dot green"></span>
                <span>
                  Estimated:{" "}
                  <strong>
                    {isRunning
                      ? formatTime(progress?.estimatedSeconds)
                      : status.status === "completed"
                      ? "Finished"
                      : "Terminated"}
                  </strong>
                </span>
              </div>
            </div>

            {status.message && (
              <div className="vis-live-message">
                <span className="vis-msg-icon">ℹ</span>
                <span>{status.message}</span>
              </div>
            )}
          </div>
        )}

        {/* =======================================================
            4. SYNC / IMPORT STATISTICS & 5. SUCCESSFUL/FAILED/SKIPPED COUNTS
        ======================================================= */}
        <div className="vis-section-header">
          <div>
            <h3 className="vis-section-title">
              {displayStats.isLive ? "Active Job Statistics" : "Store Synchronization Metrics"}
            </h3>
            <p className="vis-section-subtitle">
              {displayStats.isLive
                ? "Real-time metrics for current Google Drive synchronization session."
                : "Aggregate lifetime sync statistics across all processed batches."}
            </p>
          </div>
          {displayStats.isLive ? (
            <span className="vis-badge vis-badge-live">● LIVE SESSION</span>
          ) : (
            <span className="vis-badge vis-badge-gold">✦ AGGREGATE STATS</span>
          )}
        </div>

        {/* 6-Metric Stat Grid */}
        <div className="vis-stat-grid">
          {/* Images Found */}
          <div className="vis-stat-card">
            <div className="vis-stat-header">
              <span className="vis-stat-label">Images Found</span>
              <span className="vis-stat-tag">Drive Scan</span>
            </div>
            <div className="vis-stat-number gold">
              {displayStats.found.toLocaleString()}
            </div>
            <div className="vis-stat-subtext">Images detected in folder</div>
          </div>

          {/* Variants Matched */}
          <div className="vis-stat-card">
            <div className="vis-stat-header">
              <span className="vis-stat-label">SKUs Matched</span>
              <span className="vis-stat-tag green">
                {displayStats.found > 0
                  ? `${Math.round((displayStats.matched / displayStats.found) * 100)}% Matched`
                  : "Catalog Match"}
              </span>
            </div>
            <div className="vis-stat-number green">
              {displayStats.matched.toLocaleString()}
            </div>
            <div className="vis-stat-subtext">Product variants located</div>
          </div>

          {/* Images Uploaded */}
          <div className="vis-stat-card">
            <div className="vis-stat-header">
              <span className="vis-stat-label">Uploaded to CDN</span>
              <span className="vis-stat-tag blue">Staged</span>
            </div>
            <div className="vis-stat-number blue">
              {displayStats.uploaded.toLocaleString()}
            </div>
            <div className="vis-stat-subtext">Pushed to Shopify CDN</div>
          </div>

          {/* Variants Assigned */}
          <div className="vis-stat-card">
            <div className="vis-stat-header">
              <span className="vis-stat-label">Variants Assigned</span>
              <span className="vis-stat-tag gold">Active Media</span>
            </div>
            <div className="vis-stat-number gold-glow">
              {displayStats.assigned.toLocaleString()}
            </div>
            <div className="vis-stat-subtext">Attached to storefront</div>
          </div>

          {/* SKU Not Found */}
          <div className="vis-stat-card">
            <div className="vis-stat-header">
              <span className="vis-stat-label">SKU Not Found</span>
              <span className="vis-stat-tag amber">Skipped</span>
            </div>
            <div className="vis-stat-number amber">
              {displayStats.skipped.toLocaleString()}
            </div>
            <div className="vis-stat-subtext">Files without catalog match</div>
          </div>

          {/* Errors */}
          <div className="vis-stat-card">
            <div className="vis-stat-header">
              <span className="vis-stat-label">Sync Errors</span>
              <span className="vis-stat-tag red">Exceptions</span>
            </div>
            <div className="vis-stat-number red">
              {displayStats.errors.toLocaleString()}
            </div>
            <div className="vis-stat-subtext">Network or API errors</div>
          </div>
        </div>

        {/* 5. VISUAL BREAKDOWN BAR (Successful / Skipped / Errors) */}
        {displayStats.found > 0 && (
          <div className="vis-card vis-breakdown-card">
            <div className="vis-breakdown-header">
              <span className="vis-breakdown-title">Sync Distribution Breakdown</span>
              <span className="vis-breakdown-rate">
                Match & Assignment Rate:{" "}
                <strong>
                  {Math.round(
                    ((displayStats.assigned || displayStats.matched) /
                      (displayStats.found || 1)) *
                      100
                  )}
                  %
                </strong>
              </span>
            </div>

            {/* Segmented bar */}
            <div className="vis-segmented-bar">
              <div
                className="vis-segment green"
                style={{
                  width: `${Math.max(
                    2,
                    (displayStats.assigned / (displayStats.found || 1)) * 100
                  )}%`,
                }}
                title={`Assigned: ${displayStats.assigned}`}
              ></div>
              <div
                className="vis-segment amber"
                style={{
                  width: `${Math.max(
                    0,
                    (displayStats.skipped / (displayStats.found || 1)) * 100
                  )}%`,
                }}
                title={`Skipped / No SKU: ${displayStats.skipped}`}
              ></div>
              <div
                className="vis-segment red"
                style={{
                  width: `${Math.max(
                    0,
                    (displayStats.errors / (displayStats.found || 1)) * 100
                  )}%`,
                }}
                title={`Errors: ${displayStats.errors}`}
              ></div>
            </div>

            <div className="vis-segment-legend">
              <div className="vis-legend-item">
                <span className="vis-legend-dot green"></span>
                <span>Assigned Variants: {displayStats.assigned}</span>
              </div>
              <div className="vis-legend-item">
                <span className="vis-legend-dot amber"></span>
                <span>SKU Not in Catalog: {displayStats.skipped}</span>
              </div>
              <div className="vis-legend-item">
                <span className="vis-legend-dot red"></span>
                <span>Exceptions: {displayStats.errors}</span>
              </div>
            </div>
          </div>
        )}

        {/* =======================================================
            EXACT ERROR DETAILS LIST (If live job has errors)
        ======================================================= */}
        {errors.length > 0 && (
          <div className="vis-card vis-error-details-card">
            <div className="vis-error-card-header">
              <div className="vis-error-icon-box">⚠️</div>
              <div>
                <h4 className="vis-error-title">
                  {errors.length} Image(s) Encountered Issues
                </h4>
                <p className="vis-error-desc">
                  Below are the exact diagnostic messages returned by Shopify. Common reasons include missing variant SKUs or malformed image headers.
                </p>
              </div>
            </div>

            <div className="vis-error-items-list">
              {errors.map((err, idx) => (
                <div className="vis-error-row" key={`${err.file || "file"}-${idx}`}>
                  <div className="vis-error-badge">
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div className="vis-error-body">
                    <div className="vis-error-meta-line">
                      <span className="vis-error-filename">{err.file || "Unknown file"}</span>
                      <span className="vis-error-sku-tag">
                        Target SKU: <code>{err.sku || "Not Available"}</code>
                      </span>
                    </div>
                    <div className="vis-error-msg-box">
                      <strong>Shopify API Response:</strong>{" "}
                      {err.message || "No specific message provided."}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =======================================================
            6. RECENT SYNC ACTIVITY (From Database)
        ======================================================= */}
        <div className="vis-card vis-history-card">
          <div className="vis-card-header">
            <div>
              <h3 className="vis-card-title">Recent Sync Activity</h3>
              <p className="vis-card-desc">
                Latest image import batches initiated for this Shopify store.
              </p>
            </div>
            <button
              type="button"
              className="vis-btn-ghost-sm"
              onClick={() => navigate("/app/history")}
            >
              Full History Log →
            </button>
          </div>

          {recentImports.length === 0 ? (
            <div className="vis-empty-state">
              <div className="vis-empty-icon">↻</div>
              <h4 className="vis-empty-title">No Previous Sync Runs</h4>
              <p className="vis-empty-desc">
                Enter your Google Drive folder link above and trigger your first import to see historical performance logs here.
              </p>
            </div>
          ) : (
            <div className="vis-table-responsive">
              <table className="vis-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Status</th>
                    <th>Drive Source</th>
                    <th>Scanned</th>
                    <th>Matched</th>
                    <th>Assigned</th>
                    <th>Skipped</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {recentImports.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="vis-table-date">{formatDate(item.createdAt)}</div>
                        <div className="vis-table-id">ID: #{item.id.slice(-6)}</div>
                      </td>
                      <td>
                        <span className={`vis-status-pill ${item.status}`}>
                          {item.status === "completed"
                            ? "Completed"
                            : item.status === "completed_with_errors"
                            ? "With Warnings"
                            : item.status === "failed"
                            ? "Failed"
                            : item.status}
                        </span>
                      </td>
                      <td>
                        <div className="vis-table-link-box" title={item.driveUrl}>
                          {item.driveUrl.includes("/folders/")
                            ? `.../${item.driveUrl.split("/folders/")[1]?.slice(0, 12)}...`
                            : "Public Folder"}
                        </div>
                      </td>
                      <td><strong>{item.imagesFound}</strong></td>
                      <td><span className="vis-val-green">{item.variantsMatched}</span></td>
                      <td><span className="vis-val-gold">{item.imagesAssigned}</span></td>
                      <td>
                        <span className={item.skuNotFound > 0 ? "vis-val-amber" : ""}>
                          {item.skuNotFound}
                        </span>
                      </td>
                      <td>
                        <span className={item.errors > 0 ? "vis-val-red" : ""}>
                          {item.errors}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* =======================================================
            7. SKU MATCHING STATUS & INTERACTIVE PREVIEW
        ======================================================= */}
        <div className="vis-grid-2col">
          <div className="vis-card vis-matching-card">
            <div className="vis-card-header">
              <div>
                <span className="vis-badge vis-badge-gold">MATCH ENGINE</span>
                <h3 className="vis-card-title">SKU Extraction Architecture</h3>
                <p className="vis-card-desc">
                  How our algorithm normalizes file names into store variant SKUs.
                </p>
              </div>
              <div className="vis-active-tag">● ACTIVE</div>
            </div>

            <div className="vis-match-rules-list">
              <div className="vis-rule-item">
                <div className="vis-rule-num">01</div>
                <div>
                  <strong>Primary SKU Pattern:</strong>
                  <p>
                    Filename matching variant code directly: <code>TSHIRT-BLK-M.jpg</code> → Variant SKU <code>TSHIRT-BLK-M</code>.
                  </p>
                </div>
              </div>

              <div className="vis-rule-item">
                <div className="vis-rule-num">02</div>
                <div>
                  <strong>Multi-Photo Normalization:</strong>
                  <p>
                    Automatic stripping of perspective and ordinal tags: <code>BOOT-42_front.png</code> or <code>JEANS-32-1.webp</code> → Root SKU.
                  </p>
                </div>
              </div>

              <div className="vis-rule-item">
                <div className="vis-rule-num">03</div>
                <div>
                  <strong>Case & Whitespace Resiliency:</strong>
                  <p>
                    Safe trimming and case-insensitive comparison against active catalog inventory.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive SKU Match Previewer Widget */}
          <div className="vis-card vis-tester-card">
            <span className="vis-badge vis-badge-charcoal">LIVE SKU TESTER</span>
            <h3 className="vis-card-title">Test Your Filenames</h3>
            <p className="vis-card-desc">
              Type or paste an image filename below to see how our engine will resolve the SKU.
            </p>

            <div className="vis-tester-box">
              <label className="vis-input-label">Sample Image Filename</label>
              <input
                type="text"
                className="vis-text-input"
                value={testSkuInput}
                onChange={(e) => setTestSkuInput(e.target.value)}
                placeholder="e.g. SNEAKER-WHT-42_front.jpg"
              />

              <div className="vis-tester-result">
                <div className="vis-res-label">RESOLVED TARGET SKU:</div>
                <div className="vis-res-value">
                  <code>{extractedSku || "NO_SKU_DETECTED"}</code>
                </div>
                <div className="vis-res-status">
                  ✓ Ready for Shopify Variant GraphQL lookup
                </div>
              </div>

              <div className="vis-test-presets">
                <span>Quick tests:</span>
                <button
                  type="button"
                  onClick={() => setTestSkuInput("HOODIE-RED-XL.png")}
                >
                  HOODIE-RED-XL.png
                </button>
                <button
                  type="button"
                  onClick={() => setTestSkuInput("JACKET-BLK-01.webp")}
                >
                  JACKET-BLK-01.webp
                </button>
                <button
                  type="button"
                  onClick={() => setTestSkuInput("BAG-LTHR-BRN_back.jpg")}
                >
                  BAG-LTHR-BRN_back.jpg
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* =======================================================
            8. QUICK-START / WORKFLOW SECTION
        ======================================================= */}
        <div className="vis-section-header">
          <div>
            <h3 className="vis-section-title">Seamless 4-Step Workflow</h3>
            <p className="vis-section-subtitle">
              Follow these simple best practices for high-speed automated image synchronization.
            </p>
          </div>
          <button
            type="button"
            className="vis-btn-ghost-sm"
            onClick={() => navigate("/app/instructions")}
          >
            Detailed Instructions →
          </button>
        </div>

        <div className="vis-workflow-grid">
          <div className="vis-workflow-step">
            <div className="vis-step-badge">STEP 01</div>
            <h4 className="vis-step-title">Drive Folder Setup</h4>
            <p className="vis-step-desc">
              Create a dedicated Google Drive folder and place all your high-resolution product photos inside.
            </p>
            <div className="vis-step-footer">
              <span>Supports JPG, PNG, WebP</span>
            </div>
          </div>

          <div className="vis-workflow-step">
            <div className="vis-step-badge">STEP 02</div>
            <h4 className="vis-step-title">Enable Public Link</h4>
            <p className="vis-step-desc">
              Right-click folder → Share → Set General Access to <strong>"Anyone with the link can view"</strong>.
            </p>
            <div className="vis-step-footer">
              <span>No Google login needed</span>
            </div>
          </div>

          <div className="vis-workflow-step">
            <div className="vis-step-badge">STEP 03</div>
            <h4 className="vis-step-title">Filename SKU Matching</h4>
            <p className="vis-step-desc">
              Ensure filenames match your Shopify variant SKU (e.g. <code>WIDGET-01.jpg</code> for SKU <code>WIDGET-01</code>).
            </p>
            <div className="vis-step-footer">
              <span>Automatic suffix stripping</span>
            </div>
          </div>

          <div className="vis-workflow-step">
            <div className="vis-step-badge">STEP 04</div>
            <h4 className="vis-step-title">1-Click Cloud Sync</h4>
            <p className="vis-step-desc">
              Paste the public URL into the input above and click <strong>"Sync Variant Images"</strong>.
            </p>
            <div className="vis-step-footer">
              <span>Real-time live progress</span>
            </div>
          </div>
        </div>

        {/* =======================================================
            9. HELPFUL TIPS AND WARNINGS
        ======================================================= */}
        <div className="vis-tips-grid">
          <div className="vis-tip-card">
            <div className="vis-tip-icon">💡</div>
            <div>
              <h5 className="vis-tip-title">Pro Tip: Image Optimization</h5>
              <p className="vis-tip-desc">
                For optimal Shopify storefront speed, keep source photos under 20MB. Square or 3:4 aspect ratios ensure consistent catalog display.
              </p>
            </div>
          </div>

          <div className="vis-tip-card warning">
            <div className="vis-tip-icon">⚠️</div>
            <div>
              <h5 className="vis-tip-title">Google Workspace Restricted Access</h5>
              <p className="vis-tip-desc">
                If using a corporate Google Workspace account, verify the link is not restricted to your company domain only. It must be accessible via public URL.
              </p>
            </div>
          </div>

          <div className="vis-tip-card">
            <div className="vis-tip-icon">🛡️</div>
            <div>
              <h5 className="vis-tip-title">Non-Destructive Operations</h5>
              <p className="vis-tip-desc">
                Variant Image Sync updates variant featured images. It never deletes your existing Shopify products, variant prices, barcodes, or inventory levels.
              </p>
            </div>
          </div>
        </div>

        {/* =======================================================
            FOOTER BRANDING & HELP
        ======================================================= */}
        <div className="vis-footer">
          <div className="vis-footer-brand">
            <span className="vis-footer-logo">✦</span>
            <span>Variant Image Sync SaaS Engine</span>
            <span className="vis-footer-ver">v2.4.0 (Enterprise Ready)</span>
          </div>
          <div className="vis-footer-links">
            <button
              type="button"
              className="vis-footer-btn"
              onClick={() => navigate("/app/instructions")}
            >
              Documentation
            </button>
            <button
              type="button"
              className="vis-footer-btn"
              onClick={() => navigate("/app/history")}
            >
              Import Log
            </button>
          </div>
        </div>

      </div>

      {/* =========================================================
          LUXURIOUS DARK CHARCOAL + GOLD CSS DESIGN SYSTEM
      ========================================================= */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            /* Design Tokens */
            :root {
              --vis-bg-dark: #090B10;
              --vis-bg-card: rgba(18, 22, 32, 0.85);
              --vis-bg-card-hover: rgba(24, 29, 42, 0.95);
              --vis-border-gold: rgba(212, 175, 55, 0.22);
              --vis-border-gold-hover: rgba(212, 175, 55, 0.45);
              --vis-border-subtle: rgba(255, 255, 255, 0.07);
              --vis-gold-bright: #FDE68A;
              --vis-gold-primary: #D4AF37;
              --vis-gold-deep: #AA820A;
              --vis-gold-gradient: linear-gradient(135deg, #FDE68A 0%, #D4AF37 50%, #996515 100%);
              --vis-gold-shimmer: linear-gradient(90deg, #D4AF37, #FFF2A8, #D4AF37);
              --vis-text-primary: #F8FAFC;
              --vis-text-secondary: #94A3B8;
              --vis-text-muted: #64748B;
              --vis-emerald: #10B981;
              --vis-amber: #F59E0B;
              --vis-rose: #EF4444;
              --vis-cyan: #38BDF8;
            }

            .vis-root {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: var(--vis-text-primary);
              background: var(--vis-bg-dark);
              padding: 24px 20px 48px;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              gap: 24px;
              border-radius: 16px;
              box-sizing: border-box;
            }

            .vis-root * {
              box-sizing: border-box;
            }

            /* Generic Card Styling */
            .vis-card {
              position: relative;
              background: var(--vis-bg-card);
              backdrop-filter: blur(16px);
              -webkit-backdrop-filter: blur(16px);
              border: 1px solid var(--vis-border-subtle);
              border-radius: 16px;
              padding: 24px;
              box-shadow: 0 12px 36px -8px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.05);
              transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
            }

            .vis-card:hover {
              border-color: var(--vis-border-gold);
              box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(212, 175, 55, 0.08);
            }

            /* 1. HERO SECTION */
            .vis-hero-card {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 32px;
              padding: 36px 32px;
              background: linear-gradient(135deg, rgba(20, 25, 38, 0.95) 0%, rgba(12, 15, 23, 0.98) 100%);
              border: 1px solid var(--vis-border-gold);
              overflow: hidden;
            }

            .vis-hero-glow {
              position: absolute;
              top: -60px;
              right: -60px;
              width: 320px;
              height: 320px;
              background: radial-gradient(circle, rgba(212, 175, 55, 0.15) 0%, transparent 70%);
              filter: blur(40px);
              pointer-events: none;
            }

            .vis-hero-content {
              flex: 1;
              min-width: 0;
            }

            .vis-badge-row {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              margin-bottom: 14px;
            }

            .vis-badge {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              padding: 5px 12px;
              border-radius: 999px;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.6px;
              text-transform: uppercase;
            }

            .vis-badge-gold {
              background: rgba(212, 175, 55, 0.14);
              color: var(--vis-gold-bright);
              border: 1px solid rgba(212, 175, 55, 0.35);
            }

            .vis-badge-charcoal {
              background: rgba(255, 255, 255, 0.05);
              color: var(--vis-text-secondary);
              border: 1px solid var(--vis-border-subtle);
            }

            .vis-badge-live {
              background: rgba(16, 185, 129, 0.14);
              color: var(--vis-emerald);
              border: 1px solid rgba(16, 185, 129, 0.35);
              font-size: 11px;
              padding: 5px 12px;
              border-radius: 999px;
              font-weight: 800;
            }

            .vis-sparkle {
              color: var(--vis-gold-bright);
              font-size: 12px;
            }

            .vis-dot-green {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: var(--vis-emerald);
              box-shadow: 0 0 6px var(--vis-emerald);
            }

            .vis-dot-gold {
              width: 6px;
              height: 6px;
              border-radius: 50%;
              background: var(--vis-gold-primary);
              box-shadow: 0 0 6px var(--vis-gold-primary);
            }

            .vis-hero-title {
              margin: 0;
              font-size: 32px;
              line-height: 1.15;
              font-weight: 800;
              letter-spacing: -0.5px;
              background: linear-gradient(135deg, #FFFFFF 30%, #F5D77F 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }

            .vis-hero-subtitle {
              margin: 12px 0 0;
              color: var(--vis-text-secondary);
              font-size: 14.5px;
              line-height: 1.6;
              max-width: 680px;
            }

            .vis-hero-chips {
              display: flex;
              flex-wrap: wrap;
              gap: 12px;
              margin-top: 20px;
            }

            .vis-chip {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 6px 12px;
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid rgba(255, 255, 255, 0.08);
              border-radius: 8px;
              font-size: 12px;
              font-weight: 500;
              color: #CBD5E1;
            }

            .vis-chip-icon {
              font-size: 13px;
            }

            /* Hero Tier Pill */
            .vis-hero-meta {
              flex-shrink: 0;
            }

            .vis-tier-pill {
              background: linear-gradient(180deg, rgba(28, 34, 50, 0.9) 0%, rgba(18, 22, 33, 0.95) 100%);
              border: 1px solid var(--vis-border-gold);
              padding: 20px 24px;
              border-radius: 14px;
              text-align: center;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4), 0 0 15px rgba(212, 175, 55, 0.12);
              min-width: 200px;
            }

            .vis-tier-title {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 1.2px;
              color: var(--vis-text-muted);
            }

            .vis-tier-name {
              font-size: 18px;
              font-weight: 800;
              color: var(--vis-gold-bright);
              margin-top: 4px;
            }

            .vis-tier-price {
              font-size: 26px;
              font-weight: 900;
              color: #FFFFFF;
              margin-top: 2px;
            }

            .vis-tier-price span {
              font-size: 13px;
              color: var(--vis-text-secondary);
              font-weight: 400;
            }

            .vis-tier-toggle-btn {
              margin-top: 12px;
              padding: 6px 12px;
              font-size: 11px;
              font-weight: 700;
              border-radius: 6px;
              background: rgba(212, 175, 55, 0.12);
              border: 1px solid rgba(212, 175, 55, 0.3);
              color: var(--vis-gold-bright);
              cursor: pointer;
              transition: all 0.2s;
            }

            .vis-tier-toggle-btn:hover {
              background: rgba(212, 175, 55, 0.22);
              border-color: var(--vis-gold-primary);
            }

            .vis-tier-subnote {
              margin-top: 6px;
              font-size: 10px;
              color: var(--vis-text-muted);
            }

            /* 2 COL GRID */
            .vis-grid-2col {
              display: grid;
              grid-template-columns: 1.35fr 1fr;
              gap: 24px;
            }

            /* 3. GOOGLE DRIVE CARD */
            .vis-main-input-card {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }

            .vis-card-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 16px;
              margin-bottom: 20px;
            }

            .vis-card-header-left {
              display: flex;
              gap: 14px;
              align-items: center;
            }

            .vis-icon-avatar {
              width: 44px;
              height: 44px;
              border-radius: 12px;
              background: rgba(212, 175, 55, 0.1);
              border: 1px solid rgba(212, 175, 55, 0.25);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }

            .vis-card-title {
              margin: 0;
              font-size: 18px;
              font-weight: 700;
              color: #FFFFFF;
            }

            .vis-card-desc {
              margin: 4px 0 0;
              font-size: 13px;
              color: var(--vis-text-secondary);
              line-height: 1.4;
            }

            .vis-status-indicator {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              padding: 6px 12px;
              background: rgba(16, 185, 129, 0.12);
              border: 1px solid rgba(16, 185, 129, 0.3);
              border-radius: 999px;
              color: var(--vis-emerald);
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.5px;
            }

            .vis-pulse-dot {
              width: 7px;
              height: 7px;
              border-radius: 50%;
              background: var(--vis-emerald);
              box-shadow: 0 0 8px var(--vis-emerald);
            }

            .vis-input-group {
              display: flex;
              flex-direction: column;
              gap: 8px;
            }

            .vis-input-label {
              font-size: 12.5px;
              font-weight: 600;
              color: #E2E8F0;
            }

            .vis-input-wrapper {
              position: relative;
              display: flex;
              align-items: center;
            }

            .vis-input-prefix {
              position: absolute;
              left: 14px;
              color: var(--vis-text-muted);
              font-size: 14px;
              pointer-events: none;
            }

            .vis-text-input {
              width: 100%;
              padding: 13px 40px 13px 40px;
              background: rgba(12, 15, 23, 0.95);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 10px;
              font-size: 14px;
              color: #F8FAFC;
              outline: none;
              transition: all 0.2s ease;
            }

            .vis-text-input:focus {
              border-color: var(--vis-gold-primary);
              box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.18);
              background: rgba(15, 19, 29, 0.98);
            }

            .vis-text-input:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            .vis-text-input.vis-input-has-error {
              border-color: var(--vis-rose);
              box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
            }

            .vis-input-clear-btn {
              position: absolute;
              right: 12px;
              background: none;
              border: none;
              color: var(--vis-text-muted);
              font-size: 14px;
              cursor: pointer;
              padding: 4px 6px;
              border-radius: 4px;
            }

            .vis-input-clear-btn:hover {
              color: #FFFFFF;
            }

            .vis-input-helpers {
              display: flex;
              justify-content: space-between;
              align-items: center;
              flex-wrap: wrap;
              gap: 10px;
              margin-top: 4px;
            }

            .vis-format-hint {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              font-size: 12px;
              color: var(--vis-text-secondary);
            }

            .vis-hint-tag {
              padding: 2px 6px;
              border-radius: 4px;
              background: rgba(255, 255, 255, 0.07);
              font-size: 10px;
              font-weight: 700;
              color: var(--vis-text-secondary);
            }

            .vis-format-hint code {
              background: rgba(212, 175, 55, 0.1);
              color: var(--vis-gold-bright);
              padding: 2px 6px;
              border-radius: 4px;
              font-family: ui-monospace, SFMono-Regular, monospace;
              font-size: 11px;
            }

            .vis-hint-res {
              color: #CBD5E1;
              font-weight: 500;
            }

            .vis-arrow {
              color: var(--vis-gold-primary);
            }

            .vis-sample-link {
              background: none;
              border: none;
              color: var(--vis-gold-primary);
              font-size: 12px;
              font-weight: 600;
              text-decoration: underline;
              cursor: pointer;
              padding: 0;
            }

            .vis-sample-link:hover {
              color: var(--vis-gold-bright);
            }

            .vis-error-banner {
              display: flex;
              align-items: center;
              gap: 8px;
              background: rgba(239, 68, 68, 0.12);
              border: 1px solid rgba(239, 68, 68, 0.3);
              border-radius: 8px;
              padding: 8px 12px;
              font-size: 12.5px;
              color: #FCA5A5;
            }

            /* 2. PRIMARY BUTTON & ACTION BAR */
            .vis-action-bar {
              display: flex;
              gap: 12px;
              margin-top: 24px;
              align-items: center;
            }

            .vis-btn-primary {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 10px;
              padding: 13px 26px;
              background: var(--vis-gold-gradient);
              color: #1A1303;
              border: 1px solid rgba(255, 245, 180, 0.4);
              border-radius: 10px;
              font-size: 14.5px;
              font-weight: 800;
              letter-spacing: 0.3px;
              cursor: pointer;
              box-shadow: 0 4px 20px rgba(212, 175, 55, 0.35);
              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .vis-btn-primary:hover:not(:disabled) {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(212, 175, 55, 0.5);
              filter: brightness(1.05);
            }

            .vis-btn-primary:active:not(:disabled) {
              transform: translateY(0);
            }

            .vis-btn-primary:disabled {
              opacity: 0.55;
              cursor: not-allowed;
              filter: grayscale(0.5);
              box-shadow: none;
            }

            .vis-btn-sparkle {
              font-size: 15px;
            }

            .vis-btn-secondary {
              padding: 13px 20px;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 10px;
              color: #E2E8F0;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            }

            .vis-btn-secondary:hover:not(:disabled) {
              background: rgba(255, 255, 255, 0.1);
              border-color: rgba(255, 255, 255, 0.25);
            }

            .vis-btn-secondary:disabled {
              opacity: 0.4;
              cursor: not-allowed;
            }

            .vis-btn-ghost {
              padding: 13px 18px;
              background: none;
              border: none;
              color: var(--vis-text-secondary);
              font-size: 13.5px;
              font-weight: 600;
              cursor: pointer;
              margin-left: auto;
              transition: color 0.2s;
            }

            .vis-btn-ghost:hover {
              color: var(--vis-gold-bright);
            }

            .vis-btn-ghost-sm {
              padding: 6px 12px;
              background: rgba(212, 175, 55, 0.08);
              border: 1px solid var(--vis-border-gold);
              border-radius: 8px;
              color: var(--vis-gold-bright);
              font-size: 12px;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.2s;
            }

            .vis-btn-ghost-sm:hover {
              background: rgba(212, 175, 55, 0.18);
              border-color: var(--vis-gold-primary);
            }

            /* Spinner */
            .vis-spinner {
              width: 16px;
              height: 16px;
              border: 2px solid rgba(0, 0, 0, 0.2);
              border-top-color: #1A1303;
              border-radius: 50%;
              animation: visSpin 0.7s linear infinite;
            }

            @keyframes visSpin {
              to { transform: rotate(360deg); }
            }

            /* 10. PLAN & USAGE CARD */
            .vis-plan-card {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 1px solid var(--vis-border-gold);
              background: linear-gradient(180deg, rgba(23, 28, 41, 0.95) 0%, rgba(14, 18, 27, 0.95) 100%);
            }

            .vis-plan-tier-tabs {
              display: flex;
              gap: 6px;
              margin-bottom: 16px;
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--vis-border-subtle);
              border-radius: 8px;
              padding: 3px;
            }

            .vis-plan-tab-btn {
              flex: 1;
              padding: 6px 8px;
              font-size: 11px;
              font-weight: 700;
              border-radius: 6px;
              border: 1px solid transparent;
              background: transparent;
              color: var(--vis-text-secondary);
              cursor: pointer;
              transition: all 0.2s;
              text-align: center;
            }

            .vis-plan-tab-btn:hover {
              color: var(--vis-gold-bright);
            }

            .vis-plan-tab-btn.active {
              background: rgba(212, 175, 55, 0.16);
              border-color: var(--vis-border-gold);
              color: var(--vis-gold-bright);
            }

            .vis-plan-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 16px;
            }

            .vis-plan-badge {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 1px;
              color: var(--vis-gold-primary);
              text-transform: uppercase;
            }

            .vis-plan-title {
              margin: 4px 0 0;
              font-size: 19px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .vis-plan-price-tag {
              text-align: right;
            }

            .vis-plan-price-val {
              font-size: 24px;
              font-weight: 900;
              color: var(--vis-gold-bright);
            }

            .vis-plan-period {
              font-size: 11px;
              color: var(--vis-text-muted);
            }

            .vis-usage-block {
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--vis-border-subtle);
              border-radius: 12px;
              padding: 14px 16px;
              margin-bottom: 16px;
            }

            .vis-usage-info {
              display: flex;
              justify-content: space-between;
              font-size: 12px;
              color: #CBD5E1;
              margin-bottom: 8px;
            }

            .vis-usage-bar-track {
              height: 8px;
              background: rgba(255, 255, 255, 0.08);
              border-radius: 999px;
              overflow: hidden;
            }

            .vis-usage-bar-fill {
              height: 100%;
              background: var(--vis-gold-gradient);
              border-radius: 999px;
              box-shadow: 0 0 12px rgba(212, 175, 55, 0.6);
              transition: width 0.4s ease;
            }

            .vis-usage-meta {
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: var(--vis-text-muted);
              margin-top: 8px;
            }

            .vis-plan-features {
              display: flex;
              flex-direction: column;
              gap: 8px;
              margin-bottom: 18px;
            }

            .vis-feat-item {
              display: flex;
              align-items: center;
              gap: 10px;
              font-size: 12.5px;
              color: #CBD5E1;
            }

            .vis-check {
              color: var(--vis-emerald);
              font-weight: 800;
              font-size: 13px;
            }

            .vis-feat-locked {
              color: var(--vis-text-muted);
            }

            .vis-plan-upgrade-btn {
              width: 100%;
              padding: 11px;
              background: rgba(212, 175, 55, 0.12);
              border: 1px solid var(--vis-gold-primary);
              border-radius: 8px;
              color: var(--vis-gold-bright);
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.2s;
            }

            .vis-plan-upgrade-btn:hover {
              background: var(--vis-gold-primary);
              color: #1A1303;
              box-shadow: 0 4px 18px rgba(212, 175, 55, 0.35);
            }

            .vis-plan-note {
              font-size: 11px;
              color: var(--vis-text-muted);
              text-align: center;
              margin-top: 8px;
            }

            /* LIVE JOB CARD */
            .vis-live-card {
              border-color: var(--vis-border-gold);
              background: linear-gradient(180deg, rgba(25, 30, 45, 0.95) 0%, rgba(15, 18, 28, 0.95) 100%);
              box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), 0 0 25px rgba(212, 175, 55, 0.15);
            }

            .vis-live-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              gap: 16px;
              margin-bottom: 18px;
            }

            .vis-live-eyebrow {
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 1.2px;
              color: var(--vis-gold-primary);
            }

            .vis-live-title {
              margin: 4px 0 0;
              font-size: 20px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .vis-live-counter {
              display: flex;
              align-items: center;
              gap: 12px;
            }

            .vis-counter-numbers {
              font-size: 15px;
              font-weight: 700;
              color: #E2E8F0;
            }

            .vis-counter-denom {
              color: var(--vis-text-muted);
            }

            .vis-percent-pill {
              font-size: 26px;
              font-weight: 900;
              color: var(--vis-gold-bright);
            }

            .vis-progress-track {
              height: 12px;
              background: rgba(10, 12, 18, 0.8);
              border-radius: 999px;
              overflow: hidden;
              position: relative;
              box-shadow: inset 0 2px 4px rgba(0,0,0,0.5);
            }

            .vis-progress-fill {
              height: 100%;
              background: var(--vis-gold-gradient);
              border-radius: 999px;
              position: relative;
              transition: width 0.35s ease;
              box-shadow: 0 0 18px rgba(212, 175, 55, 0.7);
            }

            .vis-progress-shimmer {
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.4), transparent);
              animation: visShimmer 2s infinite;
            }

            @keyframes visShimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }

            .vis-progress-meta-row {
              display: flex;
              justify-content: space-between;
              flex-wrap: wrap;
              gap: 12px;
              margin-top: 14px;
              font-size: 13px;
              color: var(--vis-text-secondary);
            }

            .vis-meta-item {
              display: inline-flex;
              align-items: center;
              gap: 7px;
            }

            .vis-meta-dot {
              width: 7px;
              height: 7px;
              border-radius: 50%;
            }

            .vis-meta-dot.blue { background: var(--vis-cyan); }
            .vis-meta-dot.gold { background: var(--vis-gold-primary); }
            .vis-meta-dot.green { background: var(--vis-emerald); }

            .vis-live-message {
              margin-top: 16px;
              padding: 10px 14px;
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid var(--vis-border-subtle);
              border-radius: 8px;
              font-size: 13px;
              color: #CBD5E1;
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .vis-msg-icon {
              color: var(--vis-gold-primary);
              font-weight: 800;
            }

            /* SECTION HEADERS */
            .vis-section-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              gap: 16px;
              margin-top: 10px;
            }

            .vis-section-title {
              margin: 0;
              font-size: 20px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .vis-section-subtitle {
              margin: 4px 0 0;
              font-size: 13px;
              color: var(--vis-text-secondary);
            }

            /* 4. STAT GRID */
            .vis-stat-grid {
              display: grid;
              grid-template-columns: repeat(6, 1fr);
              gap: 16px;
            }

            .vis-stat-card {
              background: var(--vis-bg-card);
              border: 1px solid var(--vis-border-subtle);
              border-radius: 14px;
              padding: 18px 16px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              gap: 8px;
              transition: all 0.2s ease;
            }

            .vis-stat-card:hover {
              border-color: var(--vis-border-gold);
              transform: translateY(-2px);
              box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
            }

            .vis-stat-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .vis-stat-label {
              font-size: 11.5px;
              font-weight: 700;
              color: var(--vis-text-secondary);
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .vis-stat-tag {
              font-size: 10px;
              padding: 2px 6px;
              border-radius: 4px;
              background: rgba(255, 255, 255, 0.05);
              color: var(--vis-text-muted);
              font-weight: 700;
            }

            .vis-stat-tag.green { background: rgba(16, 185, 129, 0.12); color: var(--vis-emerald); }
            .vis-stat-tag.blue { background: rgba(56, 189, 248, 0.12); color: var(--vis-cyan); }
            .vis-stat-tag.gold { background: rgba(212, 175, 55, 0.12); color: var(--vis-gold-bright); }
            .vis-stat-tag.amber { background: rgba(245, 158, 11, 0.12); color: var(--vis-amber); }
            .vis-stat-tag.red { background: rgba(239, 68, 68, 0.12); color: var(--vis-rose); }

            .vis-stat-number {
              font-size: 28px;
              line-height: 1.1;
              font-weight: 900;
              color: #FFFFFF;
            }

            .vis-stat-number.gold { color: var(--vis-gold-bright); }
            .vis-stat-number.gold-glow {
              color: #FFF2A8;
              text-shadow: 0 0 12px rgba(212, 175, 55, 0.5);
            }
            .vis-stat-number.green { color: var(--vis-emerald); }
            .vis-stat-number.blue { color: var(--vis-cyan); }
            .vis-stat-number.amber { color: var(--vis-amber); }
            .vis-stat-number.red { color: var(--vis-rose); }

            .vis-stat-subtext {
              font-size: 11px;
              color: var(--vis-text-muted);
            }

            /* 5. VISUAL BREAKDOWN CARD */
            .vis-breakdown-card {
              padding: 18px 22px;
            }

            .vis-breakdown-header {
              display: flex;
              justify-content: space-between;
              font-size: 13px;
              color: #CBD5E1;
              margin-bottom: 12px;
            }

            .vis-breakdown-rate strong {
              color: var(--vis-gold-bright);
            }

            .vis-segmented-bar {
              height: 10px;
              background: rgba(10, 12, 18, 0.9);
              border-radius: 999px;
              overflow: hidden;
              display: flex;
              gap: 2px;
            }

            .vis-segment.green {
              background: var(--vis-emerald);
              box-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
            }

            .vis-segment.amber {
              background: var(--vis-amber);
            }

            .vis-segment.red {
              background: var(--vis-rose);
            }

            .vis-segment-legend {
              display: flex;
              gap: 20px;
              margin-top: 12px;
              font-size: 12px;
              color: var(--vis-text-secondary);
            }

            .vis-legend-item {
              display: inline-flex;
              align-items: center;
              gap: 6px;
            }

            .vis-legend-dot {
              width: 8px;
              height: 8px;
              border-radius: 50%;
            }

            .vis-legend-dot.green { background: var(--vis-emerald); }
            .vis-legend-dot.amber { background: var(--vis-amber); }
            .vis-legend-dot.red { background: var(--vis-rose); }

            /* ERROR DETAILS CARD */
            .vis-error-details-card {
              border-color: rgba(239, 68, 68, 0.4);
              background: linear-gradient(180deg, rgba(35, 20, 25, 0.9) 0%, rgba(20, 14, 18, 0.95) 100%);
            }

            .vis-error-card-header {
              display: flex;
              gap: 14px;
              align-items: center;
              margin-bottom: 16px;
            }

            .vis-error-icon-box {
              width: 36px;
              height: 36px;
              border-radius: 10px;
              background: rgba(239, 68, 68, 0.15);
              color: var(--vis-rose);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 18px;
              flex-shrink: 0;
            }

            .vis-error-title {
              margin: 0;
              font-size: 16px;
              font-weight: 800;
              color: #FCA5A5;
            }

            .vis-error-desc {
              margin: 2px 0 0;
              font-size: 12.5px;
              color: var(--vis-text-secondary);
            }

            .vis-error-items-list {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }

            .vis-error-row {
              display: flex;
              gap: 14px;
              padding: 12px 14px;
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid rgba(239, 68, 68, 0.2);
              border-radius: 10px;
            }

            .vis-error-badge {
              font-size: 11px;
              font-weight: 800;
              color: var(--vis-rose);
              padding-top: 2px;
            }

            .vis-error-body {
              flex: 1;
              min-width: 0;
            }

            .vis-error-meta-line {
              display: flex;
              gap: 12px;
              align-items: center;
              margin-bottom: 4px;
            }

            .vis-error-filename {
              font-size: 13px;
              font-weight: 700;
              color: #FFFFFF;
            }

            .vis-error-sku-tag code {
              background: rgba(255, 255, 255, 0.08);
              color: var(--vis-gold-bright);
              padding: 2px 6px;
              border-radius: 4px;
              font-size: 11px;
            }

            .vis-error-msg-box {
              font-size: 12px;
              color: #F87171;
              line-height: 1.4;
            }

            /* 6. HISTORY TABLE */
            .vis-table-responsive {
              overflow-x: auto;
              margin-top: 14px;
            }

            .vis-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
              text-align: left;
            }

            .vis-table th {
              padding: 10px 14px;
              color: var(--vis-text-muted);
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              border-bottom: 1px solid var(--vis-border-subtle);
            }

            .vis-table td {
              padding: 14px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.04);
              color: #E2E8F0;
            }

            .vis-table tbody tr:hover td {
              background: rgba(255, 255, 255, 0.02);
            }

            .vis-table-date {
              font-weight: 600;
              color: #FFFFFF;
            }

            .vis-table-id {
              font-size: 11px;
              color: var(--vis-text-muted);
              font-family: ui-monospace, SFMono-Regular, monospace;
              margin-top: 2px;
            }

            .vis-status-pill {
              display: inline-block;
              padding: 3px 8px;
              border-radius: 999px;
              font-size: 11px;
              font-weight: 700;
            }

            .vis-status-pill.completed {
              background: rgba(16, 185, 129, 0.15);
              color: var(--vis-emerald);
              border: 1px solid rgba(16, 185, 129, 0.3);
            }

            .vis-status-pill.completed_with_errors {
              background: rgba(245, 158, 11, 0.15);
              color: var(--vis-amber);
              border: 1px solid rgba(245, 158, 11, 0.3);
            }

            .vis-status-pill.failed {
              background: rgba(239, 68, 68, 0.15);
              color: var(--vis-rose);
              border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .vis-status-pill.processing,
            .vis-status-pill.starting {
              background: rgba(56, 189, 248, 0.15);
              color: var(--vis-cyan);
              border: 1px solid rgba(56, 189, 248, 0.3);
            }

            .vis-table-link-box {
              font-size: 12px;
              color: var(--vis-text-secondary);
              max-width: 140px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              font-family: monospace;
            }

            .vis-val-green { color: var(--vis-emerald); font-weight: 700; }
            .vis-val-gold { color: var(--vis-gold-bright); font-weight: 700; }
            .vis-val-amber { color: var(--vis-amber); font-weight: 700; }
            .vis-val-red { color: var(--vis-rose); font-weight: 700; }

            .vis-empty-state {
              text-align: center;
              padding: 36px 20px;
            }

            .vis-empty-icon {
              font-size: 32px;
              color: var(--vis-gold-primary);
              margin-bottom: 10px;
            }

            .vis-empty-title {
              margin: 0;
              font-size: 16px;
              font-weight: 700;
              color: #FFFFFF;
            }

            .vis-empty-desc {
              margin: 6px 0 0;
              font-size: 13px;
              color: var(--vis-text-secondary);
              max-width: 440px;
              margin-left: auto;
              margin-right: auto;
            }

            /* 7. SKU MATCHING CARD */
            .vis-active-tag {
              font-size: 10px;
              font-weight: 800;
              color: var(--vis-emerald);
              background: rgba(16, 185, 129, 0.12);
              padding: 4px 8px;
              border-radius: 999px;
            }

            .vis-match-rules-list {
              display: flex;
              flex-direction: column;
              gap: 14px;
              margin-top: 14px;
            }

            .vis-rule-item {
              display: flex;
              gap: 14px;
              align-items: flex-start;
            }

            .vis-rule-num {
              width: 26px;
              height: 26px;
              border-radius: 6px;
              background: rgba(212, 175, 55, 0.12);
              color: var(--vis-gold-bright);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              font-weight: 800;
              flex-shrink: 0;
            }

            .vis-rule-item strong {
              font-size: 13px;
              color: #FFFFFF;
            }

            .vis-rule-item p {
              margin: 3px 0 0;
              font-size: 12.5px;
              color: var(--vis-text-secondary);
              line-height: 1.4;
            }

            .vis-rule-item code {
              background: rgba(255, 255, 255, 0.08);
              color: var(--vis-gold-bright);
              padding: 2px 5px;
              border-radius: 4px;
              font-size: 11px;
            }

            /* SKU Tester Widget */
            .vis-tester-box {
              margin-top: 14px;
              display: flex;
              flex-direction: column;
              gap: 10px;
            }

            .vis-tester-result {
              background: rgba(10, 12, 18, 0.7);
              border: 1px solid var(--vis-border-gold);
              border-radius: 10px;
              padding: 12px 16px;
            }

            .vis-res-label {
              font-size: 10px;
              font-weight: 800;
              letter-spacing: 0.8px;
              color: var(--vis-text-muted);
            }

            .vis-res-value {
              margin-top: 4px;
            }

            .vis-res-value code {
              font-size: 16px;
              font-weight: 800;
              color: var(--vis-gold-bright);
              background: none;
            }

            .vis-res-status {
              font-size: 11px;
              color: var(--vis-emerald);
              margin-top: 4px;
            }

            .vis-test-presets {
              display: flex;
              align-items: center;
              flex-wrap: wrap;
              gap: 8px;
              font-size: 11px;
              color: var(--vis-text-muted);
            }

            .vis-test-presets button {
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid var(--vis-border-subtle);
              color: #CBD5E1;
              padding: 3px 7px;
              border-radius: 4px;
              font-size: 11px;
              cursor: pointer;
            }

            .vis-test-presets button:hover {
              border-color: var(--vis-gold-primary);
              color: var(--vis-gold-bright);
            }

            /* 8. WORKFLOW GRID */
            .vis-workflow-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 16px;
            }

            .vis-workflow-step {
              background: var(--vis-bg-card);
              border: 1px solid var(--vis-border-subtle);
              border-radius: 14px;
              padding: 20px 18px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              gap: 8px;
              transition: all 0.2s ease;
            }

            .vis-workflow-step:hover {
              border-color: var(--vis-border-gold);
              transform: translateY(-2px);
              box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
            }

            .vis-step-badge {
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 1px;
              color: var(--vis-gold-primary);
            }

            .vis-step-title {
              margin: 0;
              font-size: 15px;
              font-weight: 700;
              color: #FFFFFF;
            }

            .vis-step-desc {
              margin: 4px 0 0;
              font-size: 12.5px;
              color: var(--vis-text-secondary);
              line-height: 1.5;
            }

            .vis-step-desc code {
              background: rgba(255, 255, 255, 0.08);
              color: var(--vis-gold-bright);
              padding: 1px 4px;
              border-radius: 4px;
              font-size: 11px;
            }

            .vis-step-footer {
              margin-top: 10px;
              font-size: 11px;
              color: var(--vis-text-muted);
              border-top: 1px solid rgba(255, 255, 255, 0.05);
              padding-top: 8px;
            }

            /* 9. TIPS GRID */
            .vis-tips-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
            }

            .vis-tip-card {
              background: rgba(18, 22, 32, 0.65);
              border: 1px solid var(--vis-border-subtle);
              border-radius: 12px;
              padding: 16px 18px;
              display: flex;
              gap: 14px;
              align-items: flex-start;
            }

            .vis-tip-card.warning {
              border-color: rgba(245, 158, 11, 0.3);
              background: rgba(28, 22, 16, 0.65);
            }

            .vis-tip-icon {
              font-size: 18px;
              flex-shrink: 0;
              margin-top: 2px;
            }

            .vis-tip-title {
              margin: 0;
              font-size: 13.5px;
              font-weight: 700;
              color: #FFFFFF;
            }

            .vis-tip-card.warning .vis-tip-title {
              color: #FCD34D;
            }

            .vis-tip-desc {
              margin: 4px 0 0;
              font-size: 12px;
              color: var(--vis-text-secondary);
              line-height: 1.5;
            }

            /* FOOTER */
            .vis-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-top: 1px solid var(--vis-border-subtle);
              padding-top: 20px;
              font-size: 12px;
              color: var(--vis-text-muted);
            }

            .vis-footer-brand {
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .vis-footer-logo {
              color: var(--vis-gold-primary);
              font-size: 14px;
            }

            .vis-footer-ver {
              color: var(--vis-text-muted);
              font-size: 11px;
            }

            .vis-footer-links {
              display: flex;
              gap: 16px;
            }

            .vis-footer-btn {
              background: none;
              border: none;
              color: var(--vis-text-secondary);
              font-size: 12px;
              cursor: pointer;
            }

            .vis-footer-btn:hover {
              color: var(--vis-gold-bright);
            }

            /* Alert Banner */
            .vis-alert-banner {
              display: flex;
              gap: 12px;
              align-items: center;
              background: rgba(239, 68, 68, 0.15);
              border: 1px solid rgba(239, 68, 68, 0.35);
              border-radius: 12px;
              padding: 14px 18px;
            }

            .vis-alert-icon {
              width: 28px;
              height: 28px;
              border-radius: 50%;
              background: var(--vis-rose);
              color: #FFFFFF;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 800;
              font-size: 14px;
              flex-shrink: 0;
            }

            .vis-alert-text {
              display: flex;
              flex-direction: column;
              gap: 2px;
            }

            .vis-alert-text strong {
              color: #FCA5A5;
              font-size: 13.5px;
            }

            .vis-alert-text span {
              color: #E2E8F0;
              font-size: 12.5px;
            }

            /* RESPONSIVE QUERIES */
            @media (max-width: 1200px) {
              .vis-stat-grid {
                grid-template-columns: repeat(3, 1fr);
              }

              .vis-workflow-grid {
                grid-template-columns: repeat(2, 1fr);
              }
            }

            @media (max-width: 900px) {
              .vis-grid-2col {
                grid-template-columns: 1fr;
              }

              .vis-hero-card {
                flex-direction: column;
                align-items: flex-start;
              }

              .vis-tips-grid {
                grid-template-columns: 1fr;
              }
            }

            @media (max-width: 640px) {
              .vis-stat-grid {
                grid-template-columns: repeat(2, 1fr);
              }

              .vis-workflow-grid {
                grid-template-columns: 1fr;
              }

              .vis-action-bar {
                flex-direction: column;
                align-items: stretch;
              }

              .vis-btn-ghost {
                margin-left: 0;
                text-align: center;
              }
            }
          `,
        }}
      />
    </s-page>
  );
}

// ======================================================
// HEADERS
// ======================================================

export const headers = (headersArgs) =>
  boundary.headers(headersArgs);