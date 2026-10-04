import { useState, useMemo } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ======================================================
// LOADER
// ======================================================

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const histories = await db.importHistory.findMany({
    where: {
      shop: session.shop,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return Response.json({
    histories: histories.map((history) => ({
      id: history.id,
      driveUrl: history.driveUrl,
      status: history.status,
      startedAt: history.startedAt.toISOString(),
      completedAt: history.completedAt ? history.completedAt.toISOString() : null,
      createdAt: history.createdAt.toISOString(),
      imagesFound: history.imagesFound,
      variantsMatched: history.variantsMatched,
      imagesUploaded: history.imagesUploaded,
      imagesAssigned: history.imagesAssigned,
      skuNotFound: history.skuNotFound,
      errors: history.errors,
      message: history.message,
      errorDetails: history.errorDetails || null,
    })),
  });
};

// ======================================================
// HELPERS
// ======================================================

function formatDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

function formatDuration(startedAt, completedAt) {
  if (!startedAt || !completedAt) return "-";
  try {
    const diffMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (diffMs <= 0) return "< 1s";
    const sec = Math.floor(diffMs / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${min}m ${remSec}s`;
  } catch {
    return "-";
  }
}

function getStatusText(status) {
  if (status === "completed") return "Completed";
  if (status === "completed_with_errors") return "Warnings";
  if (status === "failed") return "Failed";
  if (status === "processing") return "Processing";
  if (status === "starting") return "Starting";
  return status || "Unknown";
}

function getStatusClass(status) {
  if (status === "completed") return "completed";
  if (status === "completed_with_errors") return "warning";
  if (status === "failed") return "failed";
  if (status === "processing" || status === "starting") return "processing";
  return "neutral";
}

function truncateDriveUrl(url) {
  if (!url) return "-";
  try {
    if (url.includes("/folders/")) {
      const id = url.split("/folders/")[1]?.split(/[?#]/)[0];
      return id ? `.../folders/${id.slice(0, 10)}...` : url.slice(0, 32);
    }
    return url.slice(0, 32) + "...";
  } catch {
    return url.slice(0, 30);
  }
}

// ======================================================
// HISTORY COMPONENT
// ======================================================

export default function History() {
  const { histories = [] } = useLoaderData();
  const navigate = useNavigate();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Selected row for Detail Expandable Drawer/Modal
  const [selectedHistoryId, setSelectedHistoryId] = useState(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Real KPI calculations from actual database records
  const kpis = useMemo(() => {
    const total = histories.length;
    let completed = 0;
    let warnings = 0;
    let failed = 0;
    let totalImages = 0;
    let totalAssigned = 0;

    for (const h of histories) {
      if (h.status === "completed") completed++;
      else if (h.status === "completed_with_errors") warnings++;
      else if (h.status === "failed") failed++;

      totalImages += Number(h.imagesFound || 0);
      totalAssigned += Number(h.imagesAssigned || 0);
    }

    const efficiencyRate =
      totalImages > 0 ? Math.round((totalAssigned / totalImages) * 100) : 0;

    return {
      total,
      completed,
      warnings,
      failed,
      totalImages,
      totalAssigned,
      efficiencyRate,
    };
  }, [histories]);

  // Filtered Histories
  const filteredHistories = useMemo(() => {
    return histories.filter((h) => {
      // Status filter
      if (statusFilter !== "all" && h.status !== statusFilter) {
        return false;
      }

      // Search query (matches ID or Drive URL)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = h.id?.toLowerCase().includes(q);
        const matchesUrl = h.driveUrl?.toLowerCase().includes(q);
        if (!matchesId && !matchesUrl) {
          return false;
        }
      }

      return true;
    });
  }, [histories, statusFilter, searchQuery]);

  // Paginated Rows
  const totalPages = Math.max(1, Math.ceil(filteredHistories.length / pageSize));
  const paginatedHistories = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHistories.slice(start, start + pageSize);
  }, [filteredHistories, currentPage, pageSize]);

  // Selected History Item
  const selectedHistory = useMemo(() => {
    if (!selectedHistoryId) return null;
    return histories.find((h) => h.id === selectedHistoryId) || null;
  }, [histories, selectedHistoryId]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  return (
    <s-page heading="Import History" inline-size="large">
      {/* App Bridge Top Actions */}
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app")}
      >
        New Image Sync
      </s-button>

      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() => navigate("/app/instructions")}
      >
        Instructions Guide
      </s-button>

      {/* =========================================================
          PREMIUM HISTORY ROOT
      ========================================================= */}
      <div className="his-root">

        {/* =======================================================
            1. PREMIUM HERO / HEADER
        ======================================================= */}
        <div className="his-card his-hero-card">
          <div className="his-hero-glow"></div>
          <div className="his-hero-content">
            <div className="his-badge-row">
              <span className="his-badge his-badge-gold">
                <span className="his-sparkle">✦</span> SYNC ACTIVITY LOG
              </span>
              <span className="his-badge his-badge-charcoal">
                <span className="his-dot-green"></span> AUDIT TRAIL
              </span>
              <span className="his-badge his-badge-charcoal">
                <span className="his-dot-gold"></span> SHOPIFY MEDIA API
              </span>
            </div>

            <h1 className="his-hero-title">Variant Image Import History</h1>
            <p className="his-hero-subtitle">
              Review and audit previous Google Drive batch sync operations, inspect detailed variant SKU match ratios,
              and analyze exact diagnostic logs returned by Shopify.
            </p>

            <div className="his-hero-actions">
              <button
                type="button"
                className="his-btn-primary"
                onClick={() => navigate("/app")}
              >
                <span className="his-btn-sparkle">✦</span>
                <span>New Image Sync</span>
              </button>
              <button
                type="button"
                className="his-btn-secondary"
                onClick={() => navigate("/app/instructions")}
              >
                Setup Documentation
              </button>
            </div>
          </div>

          <div className="his-hero-meta">
            <div className="his-stat-widget">
              <div className="his-widget-label">STORE TOTAL IMPORTS</div>
              <div className="his-widget-value">{kpis.total.toLocaleString()}</div>
              <div className="his-widget-desc">
                {kpis.totalImages > 0
                  ? `${kpis.totalAssigned.toLocaleString()} variants updated`
                  : "No sync batches yet"}
              </div>
            </div>
          </div>
        </div>

        {/* =======================================================
            2. SUMMARY KPI CARDS (Real Database Metrics Only)
        ======================================================= */}
        <div className="his-kpi-grid">
          {/* Total Imports */}
          <div className="his-kpi-card">
            <div className="his-kpi-header">
              <span className="his-kpi-label">Total Imports</span>
              <span className="his-kpi-tag">All Time</span>
            </div>
            <div className="his-kpi-num gold">{kpis.total}</div>
            <div className="his-kpi-sub">Total batch runs initiated</div>
          </div>

          {/* Completed */}
          <div className="his-kpi-card">
            <div className="his-kpi-header">
              <span className="his-kpi-label">Completed</span>
              <span className="his-kpi-tag green">100% Success</span>
            </div>
            <div className="his-kpi-num green">{kpis.completed}</div>
            <div className="his-kpi-sub">Batches without errors</div>
          </div>

          {/* With Warnings */}
          <div className="his-kpi-card">
            <div className="his-kpi-header">
              <span className="his-kpi-label">With Warnings</span>
              <span className="his-kpi-tag amber">Skipped SKUs</span>
            </div>
            <div className="his-kpi-num amber">{kpis.warnings}</div>
            <div className="his-kpi-sub">Finished with skipped files</div>
          </div>

          {/* Failed */}
          <div className="his-kpi-card">
            <div className="his-kpi-header">
              <span className="his-kpi-label">Failed Batches</span>
              <span className="his-kpi-tag red">Exceptions</span>
            </div>
            <div className="his-kpi-num red">{kpis.failed}</div>
            <div className="his-kpi-sub">Network or auth halts</div>
          </div>

          {/* Total Images Processed */}
          <div className="his-kpi-card">
            <div className="his-kpi-header">
              <span className="his-kpi-label">Images Processed</span>
              <span className="his-kpi-tag blue">Scanned</span>
            </div>
            <div className="his-kpi-num blue">{kpis.totalImages.toLocaleString()}</div>
            <div className="his-kpi-sub">Discovered in Drive folders</div>
          </div>

          {/* Total Variants Updated */}
          <div className="his-kpi-card">
            <div className="his-kpi-header">
              <span className="his-kpi-label">Variants Updated</span>
              <span className="his-kpi-tag gold">Active</span>
            </div>
            <div className="his-kpi-num gold-glow">{kpis.totalAssigned.toLocaleString()}</div>
            <div className="his-kpi-sub">Store variant media attached</div>
          </div>
        </div>

        {/* =======================================================
            7. DATA VISUALIZATION SUMMARY (Dynamic from Real Data)
        ======================================================= */}
        {kpis.total > 0 && (
          <div className="his-card his-viz-card">
            <div className="his-viz-header">
              <div className="his-viz-title-block">
                <span className="his-eyebrow">DISTRIBUTION ANALYSIS</span>
                <h3 className="his-viz-title">Batch Outcome & Assignment Distribution</h3>
              </div>
              <div className="his-viz-rate">
                Overall Assignment Efficiency:{" "}
                <strong>{kpis.efficiencyRate}%</strong>
              </div>
            </div>

            {/* Segmented outcome bar */}
            <div className="his-segmented-bar">
              <div
                className="his-segment green"
                style={{
                  width: `${Math.max(
                    1,
                    Math.round((kpis.completed / (kpis.total || 1)) * 100)
                  )}%`,
                }}
                title={`Completed: ${kpis.completed}`}
              ></div>
              <div
                className="his-segment amber"
                style={{
                  width: `${Math.max(
                    0,
                    Math.round((kpis.warnings / (kpis.total || 1)) * 100)
                  )}%`,
                }}
                title={`Warnings: ${kpis.warnings}`}
              ></div>
              <div
                className="his-segment red"
                style={{
                  width: `${Math.max(
                    0,
                    Math.round((kpis.failed / (kpis.total || 1)) * 100)
                  )}%`,
                }}
                title={`Failed: ${kpis.failed}`}
              ></div>
            </div>

            <div className="his-viz-legend">
              <div className="his-legend-item">
                <span className="his-legend-dot green"></span>
                <span>Completed: {kpis.completed} ({kpis.total > 0 ? Math.round((kpis.completed / kpis.total) * 100) : 0}%)</span>
              </div>
              <div className="his-legend-item">
                <span className="his-legend-dot amber"></span>
                <span>With Warnings: {kpis.warnings} ({kpis.total > 0 ? Math.round((kpis.warnings / kpis.total) * 100) : 0}%)</span>
              </div>
              <div className="his-legend-item">
                <span className="his-legend-dot red"></span>
                <span>Failed: {kpis.failed} ({kpis.total > 0 ? Math.round((kpis.failed / kpis.total) * 100) : 0}%)</span>
              </div>
            </div>
          </div>
        )}

        {/* =======================================================
            3. FILTER / SEARCH TOOLBAR
        ======================================================= */}
        <div className="his-card his-toolbar-card">
          <div className="his-toolbar-left">
            <div className="his-search-box">
              <span className="his-search-icon">🔍</span>
              <input
                type="text"
                className="his-search-input"
                placeholder="Search by Drive URL or Import ID..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="his-search-clear"
                  onClick={() => setSearchQuery("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="his-filter-pills">
              <button
                type="button"
                className={`his-filter-btn ${statusFilter === "all" ? "active" : ""}`}
                onClick={() => {
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
              >
                All ({histories.length})
              </button>
              <button
                type="button"
                className={`his-filter-btn ${statusFilter === "completed" ? "active" : ""}`}
                onClick={() => {
                  setStatusFilter("completed");
                  setCurrentPage(1);
                }}
              >
                Completed ({kpis.completed})
              </button>
              <button
                type="button"
                className={`his-filter-btn ${statusFilter === "completed_with_errors" ? "active" : ""}`}
                onClick={() => {
                  setStatusFilter("completed_with_errors");
                  setCurrentPage(1);
                }}
              >
                Warnings ({kpis.warnings})
              </button>
              <button
                type="button"
                className={`his-filter-btn ${statusFilter === "failed" ? "active" : ""}`}
                onClick={() => {
                  setStatusFilter("failed");
                  setCurrentPage(1);
                }}
              >
                Failed ({kpis.failed})
              </button>
            </div>
          </div>

          <div className="his-toolbar-right">
            {(searchQuery || statusFilter !== "all") && (
              <button
                type="button"
                className="his-clear-btn"
                onClick={handleClearFilters}
              >
                Clear Filters
              </button>
            )}
            <span className="his-results-count">
              Showing <strong>{filteredHistories.length}</strong> of {histories.length} batches
            </span>
          </div>
        </div>

        {/* =======================================================
            4. IMPORT HISTORY TABLE & 6. EMPTY STATE
        ======================================================= */}
        <div className="his-card his-table-card">
          {histories.length === 0 ? (
            /* 6. EMPTY STATE */
            <div className="his-empty-state">
              <div className="his-empty-icon">↻</div>
              <h3 className="his-empty-title">No Sync History Recorded Yet</h3>
              <p className="his-empty-desc">
                Once you import images from Google Drive, each execution log, SKU match metric,
                and assignment result will be stored here for full auditing.
              </p>
              <button
                type="button"
                className="his-btn-primary"
                onClick={() => navigate("/app")}
              >
                Start Your First Sync →
              </button>
            </div>
          ) : filteredHistories.length === 0 ? (
            <div className="his-empty-state">
              <div className="his-empty-icon">🔍</div>
              <h3 className="his-empty-title">No Matching Batches Found</h3>
              <p className="his-empty-desc">
                No import records match your current search and filter criteria.
              </p>
              <button
                type="button"
                className="his-btn-secondary"
                onClick={handleClearFilters}
              >
                Reset Filter Settings
              </button>
            </div>
          ) : (
            <>
              <div className="his-table-responsive">
                <table className="his-table">
                  <thead>
                    <tr>
                      <th>Date & Batch ID</th>
                      <th>Status</th>
                      <th>Drive Source</th>
                      <th className="num-col">Found</th>
                      <th className="num-col">Matched</th>
                      <th className="num-col">Uploaded</th>
                      <th className="num-col">Assigned</th>
                      <th className="num-col">Skipped</th>
                      <th className="num-col">Errors</th>
                      <th className="action-col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistories.map((h) => {
                      const isExpanded = selectedHistoryId === h.id;
                      return (
                        <tr
                          key={h.id}
                          className={isExpanded ? "selected-row" : ""}
                        >
                          <td>
                            <div className="his-col-date">{formatDate(h.createdAt)}</div>
                            <div className="his-col-id">#{h.id.slice(-8)}</div>
                          </td>

                          <td>
                            <span className={`his-status-pill ${getStatusClass(h.status)}`}>
                              {getStatusText(h.status)}
                            </span>
                          </td>

                          <td>
                            <div className="his-drive-link-box" title={h.driveUrl}>
                              {truncateDriveUrl(h.driveUrl)}
                            </div>
                          </td>

                          <td className="num-col">
                            <strong>{h.imagesFound}</strong>
                          </td>

                          <td className="num-col">
                            <span className="his-val-green">{h.variantsMatched}</span>
                          </td>

                          <td className="num-col">
                            <span className="his-val-blue">{h.imagesUploaded}</span>
                          </td>

                          <td className="num-col">
                            <span className="his-val-gold">{h.imagesAssigned}</span>
                          </td>

                          <td className="num-col">
                            <span className={h.skuNotFound > 0 ? "his-val-amber" : ""}>
                              {h.skuNotFound}
                            </span>
                          </td>

                          <td className="num-col">
                            <span className={h.errors > 0 ? "his-val-red" : ""}>
                              {h.errors}
                            </span>
                          </td>

                          <td className="action-col">
                            <button
                              type="button"
                              className="his-details-btn"
                              onClick={() =>
                                setSelectedHistoryId(isExpanded ? null : h.id)
                              }
                            >
                              {isExpanded ? "Hide Details" : "View Details"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 8. PAGINATION TOOLBAR */}
              {totalPages > 1 && (
                <div className="his-pagination-bar">
                  <div className="his-page-info">
                    Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({filteredHistories.length} total entries)
                  </div>
                  <div className="his-page-controls">
                    <button
                      type="button"
                      className="his-page-btn"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      ← Previous
                    </button>
                    <div className="his-page-numbers">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
                        <button
                          key={num}
                          type="button"
                          className={`his-num-btn ${currentPage === num ? "active" : ""}`}
                          onClick={() => setCurrentPage(num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="his-page-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* =======================================================
            5. IMPORT DETAIL / EXPANDABLE INSPECTION DRAWER
        ======================================================= */}
        {selectedHistory && (
          <div className="his-card his-detail-drawer">
            <div className="his-detail-header">
              <div>
                <span className="his-eyebrow">BATCH INSPECTION</span>
                <h3 className="his-detail-title">
                  Batch Execution Detail: #{selectedHistory.id}
                </h3>
                <span className="his-detail-time">
                  Recorded: {formatDate(selectedHistory.createdAt)} · Duration: {formatDuration(selectedHistory.startedAt, selectedHistory.completedAt)}
                </span>
              </div>
              <button
                type="button"
                className="his-detail-close-btn"
                onClick={() => setSelectedHistoryId(null)}
              >
                ✕ Close Panel
              </button>
            </div>

            <div className="his-detail-grid">
              {/* Drive Source URL */}
              <div className="his-detail-block full">
                <span className="his-detail-label">Google Drive Source Folder</span>
                <div className="his-detail-url-box">
                  <code>{selectedHistory.driveUrl}</code>
                  {selectedHistory.driveUrl && (
                    <a
                      href={selectedHistory.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="his-open-link"
                    >
                      Open in Drive ↗
                    </a>
                  )}
                </div>
              </div>

              {/* Metrics Breakdown */}
              <div className="his-detail-block">
                <span className="his-detail-label">Scanned Files</span>
                <div className="his-detail-val">{selectedHistory.imagesFound}</div>
              </div>

              <div className="his-detail-block">
                <span className="his-detail-label">Variants Matched</span>
                <div className="his-detail-val green">{selectedHistory.variantsMatched}</div>
              </div>

              <div className="his-detail-block">
                <span className="his-detail-label">Staged to CDN</span>
                <div className="his-detail-val blue">{selectedHistory.imagesUploaded}</div>
              </div>

              <div className="his-detail-block">
                <span className="his-detail-label">Attached to Variants</span>
                <div className="his-detail-val gold">{selectedHistory.imagesAssigned}</div>
              </div>

              <div className="his-detail-block">
                <span className="his-detail-label">Unmatched SKUs</span>
                <div className="his-detail-val amber">{selectedHistory.skuNotFound}</div>
              </div>

              <div className="his-detail-block">
                <span className="his-detail-label">Exceptions / Errors</span>
                <div className="his-detail-val red">{selectedHistory.errors}</div>
              </div>
            </div>

            {/* Error or Backend Message */}
            {selectedHistory.message && (
              <div className="his-detail-message-box">
                <strong>Execution Log:</strong> {selectedHistory.message}
              </div>
            )}

            {selectedHistory.errorDetails && (
              <div className="his-detail-error-box">
                <strong>Diagnostic Details:</strong>
                <pre>{selectedHistory.errorDetails}</pre>
              </div>
            )}
          </div>
        )}

        {/* =======================================================
            FOOTER BRANDING
        ======================================================= */}
        <div className="his-footer">
          <div className="his-footer-brand">
            <span className="his-footer-logo">✦</span>
            <span>Variant Image Sync SaaS Engine</span>
            <span className="his-footer-ver">History Audit v2.4.0</span>
          </div>
          <div className="his-footer-links">
            <button
              type="button"
              className="his-footer-btn"
              onClick={() => navigate("/app")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className="his-footer-btn"
              onClick={() => navigate("/app/instructions")}
            >
              Documentation
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
            :root {
              --his-bg-dark: #090B10;
              --his-bg-card: rgba(18, 22, 32, 0.85);
              --his-border-gold: rgba(212, 175, 55, 0.22);
              --his-border-subtle: rgba(255, 255, 255, 0.07);
              --his-gold-bright: #FDE68A;
              --his-gold-primary: #D4AF37;
              --his-gold-gradient: linear-gradient(135deg, #FDE68A 0%, #D4AF37 50%, #996515 100%);
              --his-text-primary: #F8FAFC;
              --his-text-secondary: #94A3B8;
              --his-text-muted: #64748B;
              --his-emerald: #10B981;
              --his-amber: #F59E0B;
              --his-rose: #EF4444;
              --his-cyan: #38BDF8;
            }

            .his-root {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: var(--his-text-primary);
              background: var(--his-bg-dark);
              padding: 24px 20px 48px;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              gap: 24px;
              border-radius: 16px;
              box-sizing: border-box;
            }

            .his-root * {
              box-sizing: border-box;
            }

            .his-card {
              position: relative;
              background: var(--his-bg-card);
              backdrop-filter: blur(16px);
              -webkit-backdrop-filter: blur(16px);
              border: 1px solid var(--his-border-subtle);
              border-radius: 16px;
              padding: 24px;
              box-shadow: 0 12px 36px -8px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.05);
              transition: border-color 0.25s ease, box-shadow 0.25s ease;
            }

            .his-card:hover {
              border-color: var(--his-border-gold);
            }

            /* HERO */
            .his-hero-card {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 32px;
              padding: 36px 32px;
              background: linear-gradient(135deg, rgba(20, 25, 38, 0.95) 0%, rgba(12, 15, 23, 0.98) 100%);
              border: 1px solid var(--his-border-gold);
              overflow: hidden;
            }

            .his-hero-glow {
              position: absolute;
              top: -60px;
              right: -60px;
              width: 320px;
              height: 320px;
              background: radial-gradient(circle, rgba(212, 175, 55, 0.15) 0%, transparent 70%);
              filter: blur(40px);
              pointer-events: none;
            }

            .his-hero-content {
              flex: 1;
              min-width: 0;
            }

            .his-badge-row {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              margin-bottom: 14px;
            }

            .his-badge {
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

            .his-badge-gold {
              background: rgba(212, 175, 55, 0.14);
              color: var(--his-gold-bright);
              border: 1px solid rgba(212, 175, 55, 0.35);
            }

            .his-badge-charcoal {
              background: rgba(255, 255, 255, 0.05);
              color: var(--his-text-secondary);
              border: 1px solid var(--his-border-subtle);
            }

            .his-sparkle { color: var(--his-gold-bright); }
            .his-dot-green { width: 6px; height: 6px; border-radius: 50%; background: var(--his-emerald); box-shadow: 0 0 6px var(--his-emerald); }
            .his-dot-gold { width: 6px; height: 6px; border-radius: 50%; background: var(--his-gold-primary); box-shadow: 0 0 6px var(--his-gold-primary); }

            .his-hero-title {
              margin: 0;
              font-size: 32px;
              line-height: 1.15;
              font-weight: 800;
              letter-spacing: -0.5px;
              background: linear-gradient(135deg, #FFFFFF 30%, #F5D77F 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }

            .his-hero-subtitle {
              margin: 12px 0 0;
              color: var(--his-text-secondary);
              font-size: 14.5px;
              line-height: 1.6;
              max-width: 680px;
            }

            .his-hero-actions {
              display: flex;
              gap: 12px;
              margin-top: 24px;
              flex-wrap: wrap;
            }

            .his-btn-primary {
              display: inline-flex;
              align-items: center;
              gap: 9px;
              padding: 12px 24px;
              background: var(--his-gold-gradient);
              color: #1A1303;
              border: 1px solid rgba(255, 245, 180, 0.4);
              border-radius: 10px;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 4px 20px rgba(212, 175, 55, 0.35);
              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .his-btn-primary:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(212, 175, 55, 0.5);
              filter: brightness(1.05);
            }

            .his-btn-secondary {
              padding: 12px 20px;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 10px;
              color: #E2E8F0;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            }

            .his-btn-secondary:hover {
              background: rgba(255, 255, 255, 0.1);
              border-color: rgba(255, 255, 255, 0.25);
            }

            .his-hero-meta { flex-shrink: 0; }

            .his-stat-widget {
              background: linear-gradient(180deg, rgba(28, 34, 50, 0.9) 0%, rgba(18, 22, 33, 0.95) 100%);
              border: 1px solid var(--his-border-gold);
              padding: 22px 24px;
              border-radius: 14px;
              text-align: center;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
              min-width: 200px;
            }

            .his-widget-label { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; color: var(--his-text-muted); }
            .his-widget-value { font-size: 28px; font-weight: 900; color: var(--his-gold-bright); margin-top: 4px; }
            .his-widget-desc { font-size: 11px; color: var(--his-text-secondary); margin-top: 4px; }

            /* 2. SUMMARY KPI GRID */
            .his-kpi-grid {
              display: grid;
              grid-template-columns: repeat(6, 1fr);
              gap: 16px;
            }

            .his-kpi-card {
              background: var(--his-bg-card);
              border: 1px solid var(--his-border-subtle);
              border-radius: 14px;
              padding: 18px 16px;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              gap: 8px;
              transition: all 0.2s ease;
            }

            .his-kpi-card:hover {
              border-color: var(--his-border-gold);
              transform: translateY(-2px);
              box-shadow: 0 10px 24px rgba(0, 0, 0, 0.5);
            }

            .his-kpi-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .his-kpi-label {
              font-size: 11px;
              font-weight: 700;
              color: var(--his-text-secondary);
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }

            .his-kpi-tag {
              font-size: 10px;
              padding: 2px 6px;
              border-radius: 4px;
              background: rgba(255, 255, 255, 0.05);
              color: var(--his-text-muted);
              font-weight: 700;
            }

            .his-kpi-tag.green { background: rgba(16, 185, 129, 0.12); color: var(--his-emerald); }
            .his-kpi-tag.blue { background: rgba(56, 189, 248, 0.12); color: var(--his-cyan); }
            .his-kpi-tag.gold { background: rgba(212, 175, 55, 0.12); color: var(--his-gold-bright); }
            .his-kpi-tag.amber { background: rgba(245, 158, 11, 0.12); color: var(--his-amber); }
            .his-kpi-tag.red { background: rgba(239, 68, 68, 0.12); color: var(--his-rose); }

            .his-kpi-num {
              font-size: 28px;
              line-height: 1.1;
              font-weight: 900;
              color: #FFFFFF;
            }

            .his-kpi-num.gold { color: var(--his-gold-bright); }
            .his-kpi-num.gold-glow { color: #FFF2A8; text-shadow: 0 0 12px rgba(212, 175, 55, 0.5); }
            .his-kpi-num.green { color: var(--his-emerald); }
            .his-kpi-num.blue { color: var(--his-cyan); }
            .his-kpi-num.amber { color: var(--his-amber); }
            .his-kpi-num.red { color: var(--his-rose); }

            .his-kpi-sub {
              font-size: 11px;
              color: var(--his-text-muted);
            }

            /* 7. VISUALIZATION CARD */
            .his-viz-card {
              padding: 20px 24px;
            }

            .his-viz-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              margin-bottom: 12px;
            }

            .his-eyebrow {
              display: block;
              font-size: 10.5px;
              font-weight: 800;
              color: var(--his-gold-primary);
              letter-spacing: 1px;
              margin-bottom: 3px;
            }

            .his-viz-title { margin: 0; font-size: 16px; font-weight: 700; color: #FFFFFF; }
            .his-viz-rate { font-size: 13px; color: var(--his-text-secondary); }
            .his-viz-rate strong { color: var(--his-gold-bright); font-size: 14px; }

            .his-segmented-bar {
              height: 10px;
              background: rgba(10, 12, 18, 0.9);
              border-radius: 999px;
              overflow: hidden;
              display: flex;
              gap: 2px;
            }

            .his-segment.green { background: var(--his-emerald); box-shadow: 0 0 10px rgba(16, 185, 129, 0.5); }
            .his-segment.amber { background: var(--his-amber); }
            .his-segment.red { background: var(--his-rose); }

            .his-viz-legend {
              display: flex;
              gap: 20px;
              margin-top: 12px;
              font-size: 12px;
              color: var(--his-text-secondary);
            }

            .his-legend-item { display: inline-flex; align-items: center; gap: 6px; }
            .his-legend-dot { width: 8px; height: 8px; border-radius: 50%; }
            .his-legend-dot.green { background: var(--his-emerald); }
            .his-legend-dot.amber { background: var(--his-amber); }
            .his-legend-dot.red { background: var(--his-rose); }

            /* 3. TOOLBAR */
            .his-toolbar-card {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              padding: 16px 20px;
              flex-wrap: wrap;
            }

            .his-toolbar-left {
              display: flex;
              gap: 14px;
              align-items: center;
              flex-wrap: wrap;
            }

            .his-search-box {
              position: relative;
              display: flex;
              align-items: center;
              width: 280px;
            }

            .his-search-icon {
              position: absolute;
              left: 12px;
              font-size: 13px;
              color: var(--his-text-muted);
              pointer-events: none;
            }

            .his-search-input {
              width: 100%;
              padding: 9px 32px 9px 34px;
              background: rgba(10, 12, 18, 0.8);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 8px;
              font-size: 13px;
              color: #FFFFFF;
              outline: none;
              transition: border-color 0.2s;
            }

            .his-search-input:focus {
              border-color: var(--his-gold-primary);
            }

            .his-search-clear {
              position: absolute;
              right: 10px;
              background: none;
              border: none;
              color: var(--his-text-muted);
              cursor: pointer;
              font-size: 12px;
            }

            .his-filter-pills {
              display: flex;
              gap: 6px;
            }

            .his-filter-btn {
              padding: 7px 12px;
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid var(--his-border-subtle);
              border-radius: 8px;
              color: var(--his-text-secondary);
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            }

            .his-filter-btn:hover {
              color: #FFFFFF;
              border-color: rgba(255, 255, 255, 0.2);
            }

            .his-filter-btn.active {
              background: rgba(212, 175, 55, 0.14);
              border-color: var(--his-border-gold);
              color: var(--his-gold-bright);
            }

            .his-toolbar-right {
              display: flex;
              align-items: center;
              gap: 14px;
            }

            .his-clear-btn {
              background: none;
              border: none;
              color: var(--his-gold-primary);
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              text-decoration: underline;
              padding: 0;
            }

            .his-results-count {
              font-size: 12px;
              color: var(--his-text-muted);
            }

            .his-results-count strong { color: #FFFFFF; }

            /* 4. TABLE */
            .his-table-card {
              padding: 0;
              overflow: hidden;
            }

            .his-table-responsive {
              overflow-x: auto;
            }

            .his-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
              text-align: left;
            }

            .his-table th {
              padding: 12px 16px;
              background: rgba(14, 18, 26, 0.85);
              color: var(--his-text-muted);
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              border-bottom: 1px solid var(--his-border-subtle);
              white-space: nowrap;
            }

            .his-table td {
              padding: 14px 16px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.04);
              color: #CBD5E1;
              white-space: nowrap;
            }

            .his-table tbody tr:hover td {
              background: rgba(255, 255, 255, 0.02);
            }

            .his-table tbody tr.selected-row td {
              background: rgba(212, 175, 55, 0.06);
              border-bottom-color: rgba(212, 175, 55, 0.2);
            }

            .his-col-date { font-weight: 600; color: #FFFFFF; font-size: 13px; }
            .his-col-id { font-size: 11px; color: var(--his-text-muted); font-family: ui-monospace, SFMono-Regular, monospace; margin-top: 2px; }

            .num-col { text-align: right; }
            .his-table th.num-col { text-align: right; }
            .action-col { text-align: center; }

            .his-status-pill {
              display: inline-block;
              padding: 3px 8px;
              border-radius: 999px;
              font-size: 11px;
              font-weight: 700;
              letter-spacing: 0.3px;
            }

            .his-status-pill.completed {
              background: rgba(16, 185, 129, 0.15);
              color: var(--his-emerald);
              border: 1px solid rgba(16, 185, 129, 0.3);
            }

            .his-status-pill.warning {
              background: rgba(245, 158, 11, 0.15);
              color: var(--his-amber);
              border: 1px solid rgba(245, 158, 11, 0.3);
            }

            .his-status-pill.failed {
              background: rgba(239, 68, 68, 0.15);
              color: var(--his-rose);
              border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .his-status-pill.processing {
              background: rgba(56, 189, 248, 0.15);
              color: var(--his-cyan);
              border: 1px solid rgba(56, 189, 248, 0.3);
            }

            .his-drive-link-box {
              max-width: 170px;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              font-family: monospace;
              color: var(--his-text-secondary);
              font-size: 12px;
            }

            .his-val-green { color: var(--his-emerald); font-weight: 700; }
            .his-val-blue { color: var(--his-cyan); font-weight: 700; }
            .his-val-gold { color: var(--his-gold-bright); font-weight: 700; }
            .his-val-amber { color: var(--his-amber); font-weight: 700; }
            .his-val-red { color: var(--his-rose); font-weight: 700; }

            .his-details-btn {
              padding: 5px 10px;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid var(--his-border-subtle);
              border-radius: 6px;
              color: var(--his-text-secondary);
              font-size: 11.5px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            }

            .his-details-btn:hover {
              border-color: var(--his-border-gold);
              color: var(--his-gold-bright);
              background: rgba(212, 175, 55, 0.1);
            }

            /* 8. PAGINATION BAR */
            .his-pagination-bar {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 14px 20px;
              border-top: 1px solid var(--his-border-subtle);
              font-size: 12px;
              color: var(--his-text-secondary);
              flex-wrap: wrap;
              gap: 12px;
            }

            .his-page-info strong { color: #FFFFFF; }

            .his-page-controls {
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .his-page-btn {
              padding: 5px 10px;
              background: rgba(255, 255, 255, 0.04);
              border: 1px solid var(--his-border-subtle);
              border-radius: 6px;
              color: #CBD5E1;
              font-size: 12px;
              cursor: pointer;
            }

            .his-page-btn:disabled {
              opacity: 0.35;
              cursor: not-allowed;
            }

            .his-page-numbers {
              display: flex;
              gap: 4px;
            }

            .his-num-btn {
              width: 28px;
              height: 28px;
              border-radius: 6px;
              background: none;
              border: 1px solid transparent;
              color: var(--his-text-secondary);
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
            }

            .his-num-btn.active {
              background: rgba(212, 175, 55, 0.14);
              border-color: var(--his-border-gold);
              color: var(--his-gold-bright);
            }

            /* 5. DETAIL DRAWER */
            .his-detail-drawer {
              border-color: var(--his-border-gold);
              background: linear-gradient(180deg, rgba(22, 27, 40, 0.98) 0%, rgba(14, 18, 27, 0.98) 100%);
              box-shadow: 0 16px 40px rgba(0, 0, 0, 0.7), 0 0 25px rgba(212, 175, 55, 0.1);
            }

            .his-detail-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 1px solid var(--his-border-subtle);
              padding-bottom: 16px;
              margin-bottom: 20px;
            }

            .his-detail-title { margin: 2px 0 0; font-size: 18px; font-weight: 800; color: #FFFFFF; }
            .his-detail-time { font-size: 12px; color: var(--his-text-secondary); display: block; margin-top: 4px; }

            .his-detail-close-btn {
              padding: 6px 12px;
              background: rgba(255, 255, 255, 0.05);
              border: 1px solid var(--his-border-subtle);
              border-radius: 8px;
              color: var(--his-text-secondary);
              font-size: 12px;
              cursor: pointer;
            }

            .his-detail-close-btn:hover {
              color: #FFFFFF;
              border-color: rgba(255, 255, 255, 0.25);
            }

            .his-detail-grid {
              display: grid;
              grid-template-columns: repeat(6, 1fr);
              gap: 14px;
            }

            .his-detail-block {
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--his-border-subtle);
              border-radius: 10px;
              padding: 12px 14px;
            }

            .his-detail-block.full {
              grid-column: 1 / -1;
            }

            .his-detail-label {
              font-size: 10.5px;
              font-weight: 700;
              color: var(--his-text-muted);
              text-transform: uppercase;
              letter-spacing: 0.5px;
              display: block;
              margin-bottom: 4px;
            }

            .his-detail-url-box {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              flex-wrap: wrap;
            }

            .his-detail-url-box code {
              background: rgba(255, 255, 255, 0.05);
              color: var(--his-gold-bright);
              padding: 4px 8px;
              border-radius: 6px;
              font-family: monospace;
              font-size: 12px;
              word-break: break-all;
            }

            .his-open-link {
              color: var(--his-gold-primary);
              font-size: 12px;
              font-weight: 600;
              text-decoration: none;
            }

            .his-open-link:hover { text-decoration: underline; color: var(--his-gold-bright); }

            .his-detail-val {
              font-size: 22px;
              font-weight: 900;
              color: #FFFFFF;
            }

            .his-detail-val.green { color: var(--his-emerald); }
            .his-detail-val.blue { color: var(--his-cyan); }
            .his-detail-val.gold { color: var(--his-gold-bright); }
            .his-detail-val.amber { color: var(--his-amber); }
            .his-detail-val.red { color: var(--his-rose); }

            .his-detail-message-box {
              margin-top: 14px;
              padding: 12px 16px;
              background: rgba(10, 12, 18, 0.7);
              border: 1px solid var(--his-border-subtle);
              border-radius: 10px;
              font-size: 12.5px;
              color: #CBD5E1;
            }

            .his-detail-error-box {
              margin-top: 10px;
              padding: 12px 16px;
              background: rgba(30, 16, 20, 0.8);
              border: 1px solid rgba(239, 68, 68, 0.3);
              border-radius: 10px;
              font-size: 12px;
              color: #FCA5A5;
            }

            .his-detail-error-box pre {
              margin: 6px 0 0;
              white-space: pre-wrap;
              word-break: break-word;
              font-family: monospace;
              font-size: 11px;
            }

            /* 6. EMPTY STATE */
            .his-empty-state {
              padding: 48px 24px;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }

            .his-empty-icon {
              width: 58px;
              height: 58px;
              border-radius: 16px;
              background: rgba(212, 175, 55, 0.12);
              border: 1px solid var(--his-border-gold);
              color: var(--his-gold-bright);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 26px;
              margin-bottom: 14px;
            }

            .his-empty-title { margin: 0; font-size: 18px; font-weight: 800; color: #FFFFFF; }
            .his-empty-desc { margin: 6px 0 20px; font-size: 13.5px; color: var(--his-text-secondary); max-width: 480px; line-height: 1.5; }

            /* FOOTER */
            .his-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-top: 1px solid var(--his-border-subtle);
              padding-top: 20px;
              font-size: 12px;
              color: var(--his-text-muted);
            }

            .his-footer-brand { display: flex; align-items: center; gap: 8px; }
            .his-footer-logo { color: var(--his-gold-primary); }
            .his-footer-ver { color: var(--his-text-muted); font-size: 11px; }

            .his-footer-links { display: flex; gap: 16px; }
            .his-footer-btn { background: none; border: none; color: var(--his-text-secondary); font-size: 12px; cursor: pointer; }
            .his-footer-btn:hover { color: var(--his-gold-bright); }

            /* RESPONSIVE */
            @media (max-width: 1200px) {
              .his-kpi-grid { grid-template-columns: repeat(3, 1fr); }
              .his-detail-grid { grid-template-columns: repeat(3, 1fr); }
            }

            @media (max-width: 800px) {
              .his-hero-card { flex-direction: column; align-items: flex-start; }
              .his-kpi-grid { grid-template-columns: repeat(2, 1fr); }
              .his-toolbar-card { flex-direction: column; align-items: flex-start; }
              .his-search-box { width: 100%; }
              .his-filter-pills { flex-wrap: wrap; }
              .his-detail-grid { grid-template-columns: 1fr; }
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