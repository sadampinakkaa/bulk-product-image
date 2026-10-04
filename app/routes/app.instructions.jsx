import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ======================================================
// LOADER
// ======================================================

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

// ======================================================
// INSTRUCTIONS COMPONENT
// ======================================================

export default function Instructions() {
  const navigate = useNavigate();

  // Accordion state for FAQ / Common Issues
  const [openFaq, setOpenFaq] = useState(null);

  // Copy-to-clipboard state
  const [copiedKey, setCopiedKey] = useState(null);

  // Filename interactive tester
  const [testFilename, setTestFilename] = useState("TSHIRT-BLK-M_front.jpg");

  const copyToClipboard = (text, key) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  // Helper to extract SKU from filename
  const resolvedSku = useMemo(() => {
    if (!testFilename) return "";
    const name = testFilename.replace(/\.[^/.]+$/, "");
    return name.replace(/[_-](front|back|side|thumb|alt|\d+)$/i, "").trim();
  }, [testFilename]);

  return (
    <s-page heading="Variant Image Sync — Setup Guide" inline-size="large">
      {/* App Bridge Top Navigation Actions */}
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app")}
      >
        Start Sync Now
      </s-button>

      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() => navigate("/app")}
      >
        Back to Dashboard
      </s-button>

      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() => navigate("/app/history")}
      >
        Import History
      </s-button>

      {/* =========================================================
          PREMIUM DOCUMENTATION ROOT
      ========================================================= */}
      <div className="ins-root">

        {/* =======================================================
            1. PREMIUM HERO SECTION
        ======================================================= */}
        <div className="ins-card ins-hero-card">
          <div className="ins-hero-glow"></div>
          <div className="ins-hero-content">
            <div className="ins-badge-row">
              <span className="ins-badge ins-badge-gold">
                <span className="ins-sparkle">✦</span> ONBOARDING & SETUP GUIDE
              </span>
              <span className="ins-badge ins-badge-charcoal">
                <span className="ins-dot-green"></span> GOOGLE DRIVE ENGINE
              </span>
              <span className="ins-badge ins-badge-charcoal">
                <span className="ins-dot-gold"></span> NON-DESTRUCTIVE SYNC
              </span>
            </div>

            <h1 className="ins-hero-title">
              Variant Image Sync — Setup Guide
            </h1>
            <p className="ins-hero-subtitle">
              Learn how to organize your Google Drive folders, format filenames to match Shopify variant SKUs,
              and automate image synchronization directly to your store catalog in minutes.
            </p>

            <div className="ins-hero-actions">
              <button
                type="button"
                className="ins-btn-primary"
                onClick={() => navigate("/app")}
              >
                <span className="ins-btn-sparkle">✦</span>
                <span>Get Started · Launch Dashboard</span>
              </button>

              <button
                type="button"
                className="ins-btn-secondary"
                onClick={() => {
                  const el = document.getElementById("onboarding-flow");
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <span>Explore 4-Step Flow ↓</span>
              </button>
            </div>
          </div>

          <div className="ins-hero-meta">
            <div className="ins-stat-widget">
              <div className="ins-widget-icon">⚡</div>
              <div className="ins-widget-label">AUTOMATION SPEED</div>
              <div className="ins-widget-value">Bulk Concurrent</div>
              <div className="ins-widget-desc">Staged Shopify CDN uploads</div>
            </div>
          </div>
        </div>

        {/* =======================================================
            7. VISUAL ARCHITECTURE WORKFLOW
        ======================================================= */}
        <div className="ins-card ins-workflow-summary-card">
          <div className="ins-section-heading">
            <div>
              <span className="ins-eyebrow">PIPELINE ARCHITECTURE</span>
              <h2 className="ins-section-title">How the Sync Pipeline Works</h2>
            </div>
            <span className="ins-badge ins-badge-live">● FULLY AUTOMATED</span>
          </div>

          <div className="ins-pipeline-flow">
            <div className="ins-pipe-step">
              <div className="ins-pipe-num">01</div>
              <div className="ins-pipe-icon">📁</div>
              <div className="ins-pipe-name">Google Drive</div>
              <div className="ins-pipe-desc">Public folder scan</div>
            </div>

            <div className="ins-pipe-arrow">➔</div>

            <div className="ins-pipe-step">
              <div className="ins-pipe-num">02</div>
              <div className="ins-pipe-icon">🏷️</div>
              <div className="ins-pipe-name">Filename Parse</div>
              <div className="ins-pipe-desc">Extract raw SKU</div>
            </div>

            <div className="ins-pipe-arrow">➔</div>

            <div className="ins-pipe-step gold">
              <div className="ins-pipe-num">03</div>
              <div className="ins-pipe-icon">🎯</div>
              <div className="ins-pipe-name">SKU Match</div>
              <div className="ins-pipe-desc">Shopify variant query</div>
            </div>

            <div className="ins-pipe-arrow">➔</div>

            <div className="ins-pipe-step">
              <div className="ins-pipe-num">04</div>
              <div className="ins-pipe-icon">☁️</div>
              <div className="ins-pipe-name">CDN Staging</div>
              <div className="ins-pipe-desc">Upload to Shopify</div>
            </div>

            <div className="ins-pipe-arrow">➔</div>

            <div className="ins-pipe-step green">
              <div className="ins-pipe-num">05</div>
              <div className="ins-pipe-icon">🖼️</div>
              <div className="ins-pipe-name">Variant Assign</div>
              <div className="ins-pipe-desc">Live storefront media</div>
            </div>
          </div>
        </div>

        {/* =======================================================
            2. VISUAL 4-STEP ONBOARDING FLOW
        ======================================================= */}
        <div id="onboarding-flow" className="ins-section-container">
          <div className="ins-section-heading">
            <div>
              <span className="ins-eyebrow">STEP-BY-STEP WORKFLOW</span>
              <h2 className="ins-section-title">Complete 4-Step Setup Guide</h2>
              <p className="ins-section-subtitle">
                Follow these exact steps to ensure 100% variant match rate and zero sync errors.
              </p>
            </div>
          </div>

          <div className="ins-steps-grid">
            {/* STEP 01 */}
            <div className="ins-card ins-step-card purple">
              <div className="ins-step-card-header">
                <div className="ins-step-number">01</div>
                <div className="ins-step-icon-badge">📁</div>
              </div>

              <h3 className="ins-step-card-title">Prepare Google Drive Folder</h3>
              <p className="ins-step-card-desc">
                Create a dedicated folder in Google Drive and upload all your product variant images directly into it.
              </p>

              <div className="ins-step-box">
                <span className="ins-box-label">BEST PRACTICE</span>
                <p>
                  Keep all image files directly in the root of the folder. Sub-folders are not currently indexed.
                </p>
              </div>

              <div className="ins-step-footer">
                <span className="ins-pill-tag">Up to 20MB / photo</span>
                <span className="ins-pill-tag">JPG, PNG, WebP, GIF</span>
              </div>
            </div>

            {/* STEP 02 */}
            <div className="ins-card ins-step-card blue">
              <div className="ins-step-card-header">
                <div className="ins-step-number">02</div>
                <div className="ins-step-icon-badge">🌐</div>
              </div>

              <h3 className="ins-step-card-title">Make Folder Publicly Accessible</h3>
              <p className="ins-step-card-desc">
                Google Drive permissions must allow the app to view and fetch image streams without logging in.
              </p>

              <div className="ins-permission-badge">
                <span>General Access:</span>
                <strong>Anyone with the link</strong>
                <span className="ins-perm-arrow">→</span>
                <strong className="green">Viewer</strong>
              </div>

              <div className="ins-step-box warning">
                <span className="ins-box-label">IMPORTANT WARNING</span>
                <p>
                  If using Google Workspace, ensure access is not restricted to your company domain only.
                </p>
              </div>
            </div>

            {/* STEP 03 */}
            <div className="ins-card ins-step-card gold">
              <div className="ins-step-card-header">
                <div className="ins-step-number">03</div>
                <div className="ins-step-icon-badge">🏷️</div>
              </div>

              <h3 className="ins-step-card-title">Rename Files Using Shopify SKU</h3>
              <p className="ins-step-card-desc">
                The image filename (before the extension) must correspond to the exact SKU set on your Shopify variant.
              </p>

              <div className="ins-code-match-box">
                <div className="ins-code-match-item">
                  <span className="ins-code-label">Shopify Variant SKU</span>
                  <code>ABC-001</code>
                </div>
                <span className="ins-match-arrow">➔</span>
                <div className="ins-code-match-item">
                  <span className="ins-code-label">Drive Filename</span>
                  <code>ABC-001.jpg</code>
                </div>
              </div>

              <div className="ins-copy-row">
                <span>Copy sample filename:</span>
                <button
                  type="button"
                  className="ins-copy-btn"
                  onClick={() => copyToClipboard("ABC-001.jpg", "sample1")}
                >
                  {copiedKey === "sample1" ? "✓ Copied!" : "ABC-001.jpg"}
                </button>
              </div>
            </div>

            {/* STEP 04 */}
            <div className="ins-card ins-step-card green">
              <div className="ins-step-card-header">
                <div className="ins-step-number">04</div>
                <div className="ins-step-icon-badge">🚀</div>
              </div>

              <h3 className="ins-step-card-title">Paste URL & Start Image Sync</h3>
              <p className="ins-step-card-desc">
                Copy the public Google Drive folder link, paste it into the dashboard importer, and launch the pipeline.
              </p>

              <div className="ins-step-box highlight">
                <span className="ins-box-label">LIVE STATUS TRACKING</span>
                <p>
                  Watch real-time progress bars, CDN upload counters, and any SKU mismatches reported immediately.
                </p>
              </div>

              <button
                type="button"
                className="ins-btn-start"
                onClick={() => navigate("/app")}
              >
                Go to Importer Dashboard →
              </button>
            </div>
          </div>
        </div>

        {/* =======================================================
            4. FILENAME MATCHING RULES & INTERACTIVE TESTER
        ======================================================= */}
        <div className="ins-card ins-matching-section-card">
          <div className="ins-section-heading">
            <div>
              <span className="ins-eyebrow">INTELLIGENT PARSER</span>
              <h2 className="ins-section-title">Filename Matching Patterns & Rules</h2>
              <p className="ins-section-subtitle">
                Variant Image Sync supports clean direct matches as well as common multi-photo naming conventions.
              </p>
            </div>
          </div>

          <div className="ins-patterns-grid">
            <div className="ins-pattern-item">
              <div className="ins-pattern-header">
                <span className="ins-pattern-tag green">DIRECT MATCH</span>
                <strong>SKU.extension</strong>
              </div>
              <p className="ins-pattern-desc">
                Standard one-to-one matching. The entire filename corresponds to the variant SKU.
              </p>
              <div className="ins-pattern-examples">
                <code>TSHIRT-BLK-S.jpg</code>
                <span className="arrow">→</span>
                <span className="res">SKU: TSHIRT-BLK-S</span>
              </div>
              <div className="ins-pattern-examples">
                <code>SHOE-42-RED.png</code>
                <span className="arrow">→</span>
                <span className="res">SKU: SHOE-42-RED</span>
              </div>
            </div>

            <div className="ins-pattern-item">
              <div className="ins-pattern-header">
                <span className="ins-pattern-tag gold">PERSPECTIVE / ANGLE TAG</span>
                <strong>SKU_angle.extension</strong>
              </div>
              <p className="ins-pattern-desc">
                Strips descriptive view suffixes like <code>_front</code>, <code>_back</code>, <code>_side</code>, or <code>_thumb</code>.
              </p>
              <div className="ins-pattern-examples">
                <code>HOODIE-GRY_front.jpg</code>
                <span className="arrow">→</span>
                <span className="res">SKU: HOODIE-GRY</span>
              </div>
              <div className="ins-pattern-examples">
                <code>BOOT-BRN_back.webp</code>
                <span className="arrow">→</span>
                <span className="res">SKU: BOOT-BRN</span>
              </div>
            </div>

            <div className="ins-pattern-item">
              <div className="ins-pattern-header">
                <span className="ins-pattern-tag blue">ORDINAL / NUMBERED</span>
                <strong>SKU-1.extension or SKU_1</strong>
              </div>
              <p className="ins-pattern-desc">
                Strips sequential photo numbering suffixes like <code>-1</code>, <code>-2</code>, <code>_01</code>, or <code>_1</code>.
              </p>
              <div className="ins-pattern-examples">
                <code>JACKET-XL-1.jpg</code>
                <span className="arrow">→</span>
                <span className="res">SKU: JACKET-XL</span>
              </div>
              <div className="ins-pattern-examples">
                <code>RING-GLD-02.png</code>
                <span className="arrow">→</span>
                <span className="res">SKU: RING-GLD</span>
              </div>
            </div>
          </div>

          {/* Interactive Filename Match Sandbox */}
          <div className="ins-sandbox-box">
            <div className="ins-sandbox-header">
              <div className="ins-sandbox-badge">✦ LIVE SANDBOX</div>
              <h4 className="ins-sandbox-title">Test Your Filename Resolution</h4>
              <p className="ins-sandbox-desc">
                Type any filename below to test how our parser normalizes the title into a Shopify variant SKU.
              </p>
            </div>

            <div className="ins-sandbox-inputs">
              <input
                type="text"
                className="ins-text-input"
                value={testFilename}
                onChange={(e) => setTestFilename(e.target.value)}
                placeholder="e.g. JEANS-SLIM-32_front.jpg"
              />

              <div className="ins-sandbox-output">
                <span className="ins-out-label">PARSED TARGET SKU:</span>
                <code>{resolvedSku || "NO_SKU_FOUND"}</code>
                <span className="ins-out-status">✓ Matches Shopify Variant Query</span>
              </div>
            </div>
          </div>

          {/* Canonical Mapping Table from existing Instructions */}
          <div className="ins-table-container">
            <h4 className="ins-table-title">Canonical Shopify Variant Matching Table</h4>
            <table className="ins-spec-table">
              <thead>
                <tr>
                  <th>Shopify Variant SKU</th>
                  <th>Google Drive Image Filename</th>
                  <th>Parser Resolution</th>
                  <th>Assignment Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>ABC-001</code></td>
                  <td><code>ABC-001.jpg</code></td>
                  <td>Exact match</td>
                  <td><span className="ins-match-badge green">MATCH & ASSIGNED</span></td>
                </tr>
                <tr>
                  <td><code>ABC-002</code></td>
                  <td><code>ABC-002.png</code></td>
                  <td>Exact match</td>
                  <td><span className="ins-match-badge green">MATCH & ASSIGNED</span></td>
                </tr>
                <tr>
                  <td><code>XYZ-100</code></td>
                  <td><code>XYZ-100.webp</code></td>
                  <td>Exact match</td>
                  <td><span className="ins-match-badge green">MATCH & ASSIGNED</span></td>
                </tr>
                <tr>
                  <td><code>PROD-500</code></td>
                  <td><code>PROD-500_front.jpg</code></td>
                  <td>Suffix stripped</td>
                  <td><span className="ins-match-badge green">MATCH & ASSIGNED</span></td>
                </tr>
                <tr>
                  <td><code>DENIM-32</code></td>
                  <td><code>DENIM-32-1.jpg</code></td>
                  <td>Ordinal stripped</td>
                  <td><span className="ins-match-badge green">MATCH & ASSIGNED</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* =======================================================
            5. “BEFORE YOU SYNC” PRE-FLIGHT CHECKLIST
        ======================================================= */}
        <div className="ins-card ins-checklist-card">
          <div className="ins-section-heading">
            <div>
              <span className="ins-eyebrow">PRE-FLIGHT AUDIT</span>
              <h2 className="ins-section-title">Before You Sync Checklist</h2>
              <p className="ins-section-subtitle">
                Review this quick checklist before triggering your import batch to guarantee a flawless run.
              </p>
            </div>
          </div>

          <div className="ins-checklist-grid">
            <div className="ins-check-item">
              <span className="ins-check-icon">✓</span>
              <div>
                <strong>Google Drive Link Sharing</strong>
                <p>Folder access is set to "Anyone with the link can view". Test by opening in an incognito window.</p>
              </div>
            </div>

            <div className="ins-check-item">
              <span className="ins-check-icon">✓</span>
              <div>
                <strong>Accurate Variant SKUs</strong>
                <p>Every variant in Shopify has a populated SKU field that mirrors the filename before the extension.</p>
              </div>
            </div>

            <div className="ins-check-item">
              <span className="ins-check-icon">✓</span>
              <div>
                <strong>Supported File Formats</strong>
                <p>All photos are JPG, JPEG, PNG, WebP, or GIF. Unsupported RAW or TIFF files must be converted.</p>
              </div>
            </div>

            <div className="ins-check-item">
              <span className="ins-check-icon">✓</span>
              <div>
                <strong>File Size Within 20MB</strong>
                <p>Each photo must be 20 MB or less. Files exceeding 20 MB will be safely skipped to avoid timeouts.</p>
              </div>
            </div>

            <div className="ins-check-item">
              <span className="ins-check-icon">✓</span>
              <div>
                <strong>Active Store Catalog</strong>
                <p>Variants exist in active or drafted products accessible through the Shopify Admin API.</p>
              </div>
            </div>

            <div className="ins-check-item">
              <span className="ins-check-icon">✓</span>
              <div>
                <strong>Non-Destructive Guarantee</strong>
                <p>Existing product descriptions, prices, barcodes, and inventory levels are completely untouched.</p>
              </div>
            </div>
          </div>
        </div>

        {/* =======================================================
            FORMATS & SIZE LIMITS (Preserved from original)
        ======================================================= */}
        <div className="ins-card ins-formats-card">
          <div className="ins-section-heading">
            <div>
              <span className="ins-eyebrow">SPECIFICATIONS</span>
              <h2 className="ins-section-title">Supported Image Formats & Specifications</h2>
            </div>
          </div>

          <div className="ins-format-chips-grid">
            <div className="ins-fmt-card">
              <span className="ins-fmt-name">JPG / JPEG</span>
              <span className="ins-fmt-sub">Standard product photography</span>
            </div>
            <div className="ins-fmt-card">
              <span className="ins-fmt-name">PNG</span>
              <span className="ins-fmt-sub">Alpha transparency support</span>
            </div>
            <div className="ins-fmt-card">
              <span className="ins-fmt-name">WEBP</span>
              <span className="ins-fmt-sub">Next-gen high compression</span>
            </div>
            <div className="ins-fmt-card">
              <span className="ins-fmt-name">GIF</span>
              <span className="ins-fmt-sub">Static or animated media</span>
            </div>
          </div>

          <div className="ins-size-banner">
            <div className="ins-size-icon-box">20MB</div>
            <div>
              <strong>Maximum image size: 20 MB per image</strong>
              <p>
                Images larger than 20 MB will not be imported. Please reduce or compress oversized image files before adding them to Google Drive.
              </p>
            </div>
          </div>
        </div>

        {/* =======================================================
            6. COMMON ISSUES & SOLUTIONS (ACCORDION)
        ======================================================= */}
        <div className="ins-card ins-faq-card">
          <div className="ins-section-heading">
            <div>
              <span className="ins-eyebrow">TROUBLESHOOTING</span>
              <h2 className="ins-section-title">Common Issues & Solutions</h2>
              <p className="ins-section-subtitle">
                Click any topic below to view diagnostic steps and rapid fixes.
              </p>
            </div>
          </div>

          <div className="ins-accordion">
            {/* ISSUE 1 */}
            <div className={`ins-accordion-item ${openFaq === 0 ? "open" : ""}`}>
              <button
                type="button"
                className="ins-accordion-trigger"
                onClick={() => toggleFaq(0)}
              >
                <div className="ins-faq-title-row">
                  <span className="ins-faq-icon">🔒</span>
                  <span>Google Drive Folder is not accessible or requires sign-in</span>
                </div>
                <span className="ins-accordion-arrow">{openFaq === 0 ? "−" : "+"}</span>
              </button>
              {openFaq === 0 && (
                <div className="ins-accordion-content">
                  <p>
                    <strong>Cause:</strong> The Google Drive folder sharing setting is set to "Restricted" or is limited to members of your Google Workspace domain.
                  </p>
                  <p>
                    <strong>Solution:</strong> In Google Drive, right-click the folder ➔ <em>Share</em> ➔ under <em>General Access</em> select <strong>"Anyone with the link"</strong> and verify the role is set to <strong>"Viewer"</strong>.
                  </p>
                </div>
              )}
            </div>

            {/* ISSUE 2 */}
            <div className={`ins-accordion-item ${openFaq === 1 ? "open" : ""}`}>
              <button
                type="button"
                className="ins-accordion-trigger"
                onClick={() => toggleFaq(1)}
              >
                <div className="ins-faq-title-row">
                  <span className="ins-faq-icon">🔍</span>
                  <span>SKU Not Found in Shopify Catalog</span>
                </div>
                <span className="ins-accordion-arrow">{openFaq === 1 ? "−" : "+"}</span>
              </button>
              {openFaq === 1 && (
                <div className="ins-accordion-content">
                  <p>
                    <strong>Cause:</strong> The SKU parsed from the image filename does not match any existing variant SKU in your store.
                  </p>
                  <p>
                    <strong>Solution:</strong> Check the "SKU Not Found" count on the dashboard or inspect the import logs in <em>Import History</em>. Verify that your Shopify variant actually has the SKU entered under <em>Shopify Admin ➔ Products ➔ Variant Details</em>.
                  </p>
                </div>
              )}
            </div>

            {/* ISSUE 3 */}
            <div className={`ins-accordion-item ${openFaq === 2 ? "open" : ""}`}>
              <button
                type="button"
                className="ins-accordion-trigger"
                onClick={() => toggleFaq(2)}
              >
                <div className="ins-faq-title-row">
                  <span className="ins-faq-icon">⚠️</span>
                  <span>Shopify Image Upload or Staging Failed</span>
                </div>
                <span className="ins-accordion-arrow">{openFaq === 2 ? "−" : "+"}</span>
              </button>
              {openFaq === 2 && (
                <div className="ins-accordion-content">
                  <p>
                    <strong>Cause:</strong> The image file exceeds the 20 MB file size limit, has a corrupted image binary header, or experienced temporary Shopify CDN rate limiting.
                  </p>
                  <p>
                    <strong>Solution:</strong> Re-save the image in standard sRGB JPG/PNG format under 20 MB. The app automatically retries network hiccups up to 3 times before recording an exception.
                  </p>
                </div>
              )}
            </div>

            {/* ISSUE 4 */}
            <div className={`ins-accordion-item ${openFaq === 3 ? "open" : ""}`}>
              <button
                type="button"
                className="ins-accordion-trigger"
                onClick={() => toggleFaq(3)}
              >
                <div className="ins-faq-title-row">
                  <span className="ins-faq-icon">📦</span>
                  <span>Product Variant is Archived or Missing in Shopify</span>
                </div>
                <span className="ins-accordion-arrow">{openFaq === 3 ? "−" : "+"}</span>
              </button>
              {openFaq === 3 && (
                <div className="ins-accordion-content">
                  <p>
                    <strong>Cause:</strong> The product containing the variant is archived or was permanently deleted from Shopify.
                  </p>
                  <p>
                    <strong>Solution:</strong> Restore or unarchive the parent product in Shopify Admin. Ensure the variant has an active status.
                  </p>
                </div>
              )}
            </div>

            {/* ISSUE 5 */}
            <div className={`ins-accordion-item ${openFaq === 4 ? "open" : ""}`}>
              <button
                type="button"
                className="ins-accordion-trigger"
                onClick={() => toggleFaq(4)}
              >
                <div className="ins-faq-title-row">
                  <span className="ins-faq-icon">🔗</span>
                  <span>Invalid Google Drive Folder URL Format</span>
                </div>
                <span className="ins-accordion-arrow">{openFaq === 4 ? "−" : "+"}</span>
              </button>
              {openFaq === 4 && (
                <div className="ins-accordion-content">
                  <p>
                    <strong>Cause:</strong> The pasted URL is a single file view link (e.g. <code>drive.google.com/file/d/...</code>) rather than a folder link.
                  </p>
                  <p>
                    <strong>Solution:</strong> Open the parent folder in Google Drive and copy the URL from the browser bar: <code>https://drive.google.com/drive/folders/YOUR_FOLDER_ID</code>.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* =======================================================
            8. PREMIUM HELP & SUPPORT SECTION
        ======================================================= */}
        <div className="ins-card ins-support-card">
          <div className="ins-support-content">
            <div className="ins-support-icon">💬</div>
            <div>
              <h3 className="ins-support-title">Need Help Setting Up?</h3>
              <p className="ins-support-desc">
                Have thousands of SKUs to batch import or encountering a unique Google Drive permission setup?
                Our engineering team is here to assist with store onboarding and high-volume catalogs.
              </p>
            </div>
          </div>

          <div className="ins-support-actions">
            <button
              type="button"
              className="ins-btn-primary"
              onClick={() => navigate("/app")}
            >
              Open Importer Dashboard
            </button>
            <button
              type="button"
              className="ins-btn-secondary"
              onClick={() => navigate("/app/history")}
            >
              View Sync Logs
            </button>
          </div>
        </div>

        {/* =======================================================
            FOOTER BRANDING
        ======================================================= */}
        <div className="ins-footer">
          <div className="ins-footer-brand">
            <span className="ins-footer-logo">✦</span>
            <span>Variant Image Sync SaaS Engine</span>
            <span className="ins-footer-ver">Documentation v2.4.0</span>
          </div>
          <div className="ins-footer-links">
            <button
              type="button"
              className="ins-footer-btn"
              onClick={() => navigate("/app")}
            >
              Dashboard
            </button>
            <button
              type="button"
              className="ins-footer-btn"
              onClick={() => navigate("/app/history")}
            >
              History
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
              --ins-bg-dark: #090B10;
              --ins-bg-card: rgba(18, 22, 32, 0.85);
              --ins-border-gold: rgba(212, 175, 55, 0.22);
              --ins-border-subtle: rgba(255, 255, 255, 0.07);
              --ins-gold-bright: #FDE68A;
              --ins-gold-primary: #D4AF37;
              --ins-gold-gradient: linear-gradient(135deg, #FDE68A 0%, #D4AF37 50%, #996515 100%);
              --ins-text-primary: #F8FAFC;
              --ins-text-secondary: #94A3B8;
              --ins-text-muted: #64748B;
              --ins-emerald: #10B981;
              --ins-amber: #F59E0B;
              --ins-rose: #EF4444;
              --ins-cyan: #38BDF8;
              --ins-violet: #A78BFA;
            }

            .ins-root {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: var(--ins-text-primary);
              background: var(--ins-bg-dark);
              padding: 24px 20px 48px;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              gap: 24px;
              border-radius: 16px;
              box-sizing: border-box;
            }

            .ins-root * {
              box-sizing: border-box;
            }

            .ins-card {
              position: relative;
              background: var(--ins-bg-card);
              backdrop-filter: blur(16px);
              -webkit-backdrop-filter: blur(16px);
              border: 1px solid var(--ins-border-subtle);
              border-radius: 16px;
              padding: 24px;
              box-shadow: 0 12px 36px -8px rgba(0, 0, 0, 0.65), inset 0 1px 0 rgba(255, 255, 255, 0.05);
              transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
            }

            .ins-card:hover {
              border-color: var(--ins-border-gold);
              box-shadow: 0 16px 40px -8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(212, 175, 55, 0.08);
            }

            /* HERO */
            .ins-hero-card {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 32px;
              padding: 36px 32px;
              background: linear-gradient(135deg, rgba(20, 25, 38, 0.95) 0%, rgba(12, 15, 23, 0.98) 100%);
              border: 1px solid var(--ins-border-gold);
              overflow: hidden;
            }

            .ins-hero-glow {
              position: absolute;
              top: -60px;
              right: -60px;
              width: 320px;
              height: 320px;
              background: radial-gradient(circle, rgba(212, 175, 55, 0.15) 0%, transparent 70%);
              filter: blur(40px);
              pointer-events: none;
            }

            .ins-hero-content {
              flex: 1;
              min-width: 0;
            }

            .ins-badge-row {
              display: flex;
              flex-wrap: wrap;
              gap: 10px;
              margin-bottom: 14px;
            }

            .ins-badge {
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

            .ins-badge-gold {
              background: rgba(212, 175, 55, 0.14);
              color: var(--ins-gold-bright);
              border: 1px solid rgba(212, 175, 55, 0.35);
            }

            .ins-badge-charcoal {
              background: rgba(255, 255, 255, 0.05);
              color: var(--ins-text-secondary);
              border: 1px solid var(--ins-border-subtle);
            }

            .ins-badge-live {
              background: rgba(16, 185, 129, 0.14);
              color: var(--ins-emerald);
              border: 1px solid rgba(16, 185, 129, 0.35);
              font-size: 11px;
            }

            .ins-sparkle { color: var(--ins-gold-bright); }
            .ins-dot-green { width: 6px; height: 6px; border-radius: 50%; background: var(--ins-emerald); box-shadow: 0 0 6px var(--ins-emerald); }
            .ins-dot-gold { width: 6px; height: 6px; border-radius: 50%; background: var(--ins-gold-primary); box-shadow: 0 0 6px var(--ins-gold-primary); }

            .ins-hero-title {
              margin: 0;
              font-size: 32px;
              line-height: 1.15;
              font-weight: 800;
              letter-spacing: -0.5px;
              background: linear-gradient(135deg, #FFFFFF 30%, #F5D77F 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }

            .ins-hero-subtitle {
              margin: 12px 0 0;
              color: var(--ins-text-secondary);
              font-size: 14.5px;
              line-height: 1.6;
              max-width: 680px;
            }

            .ins-hero-actions {
              display: flex;
              gap: 12px;
              margin-top: 24px;
              flex-wrap: wrap;
            }

            .ins-btn-primary {
              display: inline-flex;
              align-items: center;
              gap: 9px;
              padding: 12px 24px;
              background: var(--ins-gold-gradient);
              color: #1A1303;
              border: 1px solid rgba(255, 245, 180, 0.4);
              border-radius: 10px;
              font-size: 14px;
              font-weight: 800;
              cursor: pointer;
              box-shadow: 0 4px 20px rgba(212, 175, 55, 0.35);
              transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .ins-btn-primary:hover {
              transform: translateY(-2px);
              box-shadow: 0 8px 25px rgba(212, 175, 55, 0.5);
              filter: brightness(1.05);
            }

            .ins-btn-secondary {
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

            .ins-btn-secondary:hover {
              background: rgba(255, 255, 255, 0.1);
              border-color: rgba(255, 255, 255, 0.25);
            }

            .ins-hero-meta {
              flex-shrink: 0;
            }

            .ins-stat-widget {
              background: linear-gradient(180deg, rgba(28, 34, 50, 0.9) 0%, rgba(18, 22, 33, 0.95) 100%);
              border: 1px solid var(--ins-border-gold);
              padding: 22px 24px;
              border-radius: 14px;
              text-align: center;
              box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
              min-width: 200px;
            }

            .ins-widget-icon { font-size: 24px; margin-bottom: 4px; }
            .ins-widget-label { font-size: 10px; font-weight: 800; letter-spacing: 1.2px; color: var(--ins-text-muted); }
            .ins-widget-value { font-size: 18px; font-weight: 800; color: var(--ins-gold-bright); margin-top: 4px; }
            .ins-widget-desc { font-size: 11px; color: var(--ins-text-secondary); margin-top: 4px; }

            /* SECTION HEADINGS */
            .ins-section-heading {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              gap: 16px;
              margin-bottom: 18px;
            }

            .ins-eyebrow {
              display: block;
              font-size: 11px;
              font-weight: 800;
              letter-spacing: 1.2px;
              color: var(--ins-gold-primary);
              margin-bottom: 4px;
            }

            .ins-section-title {
              margin: 0;
              font-size: 22px;
              font-weight: 800;
              color: #FFFFFF;
            }

            .ins-section-subtitle {
              margin: 4px 0 0;
              font-size: 13.5px;
              color: var(--ins-text-secondary);
            }

            /* WORKFLOW PIPELINE SUMMARY */
            .ins-pipeline-flow {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 10px;
              overflow-x: auto;
              padding: 10px 0;
            }

            .ins-pipe-step {
              background: rgba(12, 15, 23, 0.85);
              border: 1px solid var(--ins-border-subtle);
              border-radius: 12px;
              padding: 14px 16px;
              text-align: center;
              flex: 1;
              min-width: 140px;
              transition: all 0.2s;
            }

            .ins-pipe-step:hover {
              border-color: var(--ins-border-gold);
              transform: translateY(-2px);
            }

            .ins-pipe-step.gold { border-color: rgba(212, 175, 55, 0.4); background: rgba(212, 175, 55, 0.06); }
            .ins-pipe-step.green { border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.06); }

            .ins-pipe-num { font-size: 10px; font-weight: 800; color: var(--ins-gold-primary); }
            .ins-pipe-icon { font-size: 22px; margin: 4px 0; }
            .ins-pipe-name { font-size: 13px; font-weight: 700; color: #FFFFFF; }
            .ins-pipe-desc { font-size: 11px; color: var(--ins-text-muted); margin-top: 2px; }
            .ins-pipe-arrow { color: var(--ins-gold-primary); font-size: 16px; flex-shrink: 0; }

            /* 4-STEP GRID */
            .ins-steps-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 18px;
            }

            .ins-step-card {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              gap: 12px;
              padding: 22px 20px;
            }

            .ins-step-card.purple { border-color: rgba(167, 139, 250, 0.25); }
            .ins-step-card.blue { border-color: rgba(56, 189, 248, 0.25); }
            .ins-step-card.gold { border-color: rgba(212, 175, 55, 0.35); }
            .ins-step-card.green { border-color: rgba(16, 185, 129, 0.3); }

            .ins-step-card-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .ins-step-number {
              font-size: 28px;
              font-weight: 900;
              color: var(--ins-gold-bright);
              opacity: 0.85;
            }

            .ins-step-icon-badge {
              font-size: 20px;
              width: 36px;
              height: 36px;
              border-radius: 10px;
              background: rgba(255, 255, 255, 0.05);
              display: flex;
              align-items: center;
              justify-content: center;
            }

            .ins-step-card-title {
              margin: 0;
              font-size: 17px;
              font-weight: 700;
              color: #FFFFFF;
            }

            .ins-step-card-desc {
              margin: 0;
              font-size: 13px;
              color: var(--ins-text-secondary);
              line-height: 1.5;
            }

            .ins-step-box {
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--ins-border-subtle);
              border-radius: 10px;
              padding: 12px;
              font-size: 12px;
              color: #CBD5E1;
            }

            .ins-step-box.warning { border-color: rgba(245, 158, 11, 0.3); background: rgba(30, 22, 14, 0.6); }
            .ins-step-box.highlight { border-color: rgba(16, 185, 129, 0.3); background: rgba(14, 28, 22, 0.6); }

            .ins-box-label {
              display: block;
              font-size: 10px;
              font-weight: 800;
              color: var(--ins-gold-primary);
              letter-spacing: 0.8px;
              margin-bottom: 4px;
            }

            .ins-step-box.warning .ins-box-label { color: var(--ins-amber); }
            .ins-step-box.highlight .ins-box-label { color: var(--ins-emerald); }

            .ins-step-box p { margin: 0; line-height: 1.45; }

            .ins-step-footer {
              display: flex;
              gap: 8px;
              flex-wrap: wrap;
              border-top: 1px solid rgba(255, 255, 255, 0.05);
              padding-top: 10px;
            }

            .ins-pill-tag {
              padding: 3px 8px;
              background: rgba(255, 255, 255, 0.05);
              border-radius: 6px;
              font-size: 11px;
              color: var(--ins-text-secondary);
            }

            .ins-permission-badge {
              display: flex;
              flex-direction: column;
              gap: 4px;
              background: rgba(10, 12, 18, 0.8);
              border: 1px solid var(--ins-border-gold);
              border-radius: 10px;
              padding: 10px 12px;
              font-size: 12px;
            }

            .ins-permission-badge strong.green { color: var(--ins-emerald); }
            .ins-perm-arrow { color: var(--ins-gold-primary); font-size: 12px; }

            .ins-code-match-box {
              display: flex;
              align-items: center;
              justify-content: space-between;
              background: rgba(10, 12, 18, 0.8);
              border: 1px solid var(--ins-border-gold);
              border-radius: 10px;
              padding: 10px 12px;
              gap: 8px;
            }

            .ins-code-match-item {
              display: flex;
              flex-direction: column;
              gap: 3px;
            }

            .ins-code-label { font-size: 9.5px; color: var(--ins-text-muted); font-weight: 700; text-transform: uppercase; }
            .ins-code-match-box code { background: rgba(212, 175, 55, 0.12); color: var(--ins-gold-bright); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
            .ins-match-arrow { color: var(--ins-gold-primary); font-size: 13px; }

            .ins-copy-row {
              display: flex;
              align-items: center;
              justify-content: space-between;
              font-size: 11.5px;
              color: var(--ins-text-secondary);
            }

            .ins-copy-btn {
              background: rgba(212, 175, 55, 0.12);
              border: 1px solid var(--ins-border-gold);
              border-radius: 6px;
              color: var(--ins-gold-bright);
              padding: 4px 8px;
              font-size: 11px;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.2s;
            }

            .ins-copy-btn:hover {
              background: var(--ins-gold-primary);
              color: #1A1303;
            }

            .ins-btn-start {
              width: 100%;
              padding: 10px;
              background: rgba(16, 185, 129, 0.15);
              border: 1px solid var(--ins-emerald);
              border-radius: 8px;
              color: var(--ins-emerald);
              font-size: 13px;
              font-weight: 700;
              cursor: pointer;
              transition: all 0.2s;
            }

            .ins-btn-start:hover {
              background: var(--ins-emerald);
              color: #FFFFFF;
            }

            /* PATTERNS & MATCHING */
            .ins-patterns-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
              margin-bottom: 24px;
            }

            .ins-pattern-item {
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--ins-border-subtle);
              border-radius: 12px;
              padding: 18px;
              display: flex;
              flex-direction: column;
              gap: 10px;
            }

            .ins-pattern-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
            }

            .ins-pattern-header strong { font-size: 14px; color: #FFFFFF; font-family: monospace; }
            .ins-pattern-tag { font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }
            .ins-pattern-tag.green { background: rgba(16, 185, 129, 0.12); color: var(--ins-emerald); }
            .ins-pattern-tag.gold { background: rgba(212, 175, 55, 0.12); color: var(--ins-gold-bright); }
            .ins-pattern-tag.blue { background: rgba(56, 189, 248, 0.12); color: var(--ins-cyan); }

            .ins-pattern-desc { margin: 0; font-size: 12px; color: var(--ins-text-secondary); line-height: 1.45; }

            .ins-pattern-examples {
              display: flex;
              align-items: center;
              gap: 8px;
              font-size: 11.5px;
            }

            .ins-pattern-examples code { background: rgba(255, 255, 255, 0.06); color: #CBD5E1; padding: 2px 6px; border-radius: 4px; }
            .ins-pattern-examples .arrow { color: var(--ins-gold-primary); font-size: 11px; }
            .ins-pattern-examples .res { color: var(--ins-gold-bright); font-weight: 600; }

            /* LIVE SANDBOX */
            .ins-sandbox-box {
              background: linear-gradient(180deg, rgba(20, 25, 38, 0.95) 0%, rgba(12, 15, 23, 0.98) 100%);
              border: 1px solid var(--ins-border-gold);
              border-radius: 14px;
              padding: 20px 24px;
              margin-bottom: 24px;
            }

            .ins-sandbox-badge { font-size: 10px; font-weight: 800; color: var(--ins-gold-primary); letter-spacing: 0.8px; }
            .ins-sandbox-title { margin: 4px 0 0; font-size: 16px; font-weight: 700; color: #FFFFFF; }
            .ins-sandbox-desc { margin: 3px 0 16px; font-size: 12.5px; color: var(--ins-text-secondary); }

            .ins-sandbox-inputs {
              display: grid;
              grid-template-columns: 1.2fr 1fr;
              gap: 16px;
              align-items: center;
            }

            .ins-text-input {
              width: 100%;
              padding: 12px 16px;
              background: rgba(8, 10, 16, 0.95);
              border: 1px solid rgba(255, 255, 255, 0.12);
              border-radius: 10px;
              font-size: 13.5px;
              color: #F8FAFC;
              outline: none;
              transition: all 0.2s;
            }

            .ins-text-input:focus {
              border-color: var(--ins-gold-primary);
              box-shadow: 0 0 0 3px rgba(212, 175, 55, 0.18);
            }

            .ins-sandbox-output {
              background: rgba(8, 10, 16, 0.8);
              border: 1px solid var(--ins-border-gold);
              border-radius: 10px;
              padding: 10px 14px;
              display: flex;
              flex-direction: column;
              gap: 3px;
            }

            .ins-out-label { font-size: 10px; font-weight: 800; color: var(--ins-text-muted); }
            .ins-sandbox-output code { font-size: 15px; font-weight: 800; color: var(--ins-gold-bright); background: none; }
            .ins-out-status { font-size: 11px; color: var(--ins-emerald); }

            /* SPEC TABLE */
            .ins-table-container {
              overflow-x: auto;
            }

            .ins-table-title {
              margin: 0 0 12px;
              font-size: 14.5px;
              font-weight: 700;
              color: #E2E8F0;
            }

            .ins-spec-table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
              text-align: left;
            }

            .ins-spec-table th {
              padding: 10px 14px;
              color: var(--ins-text-muted);
              font-size: 11px;
              font-weight: 800;
              text-transform: uppercase;
              border-bottom: 1px solid var(--ins-border-subtle);
            }

            .ins-spec-table td {
              padding: 12px 14px;
              border-bottom: 1px solid rgba(255, 255, 255, 0.04);
              color: #CBD5E1;
            }

            .ins-spec-table code {
              background: rgba(255, 255, 255, 0.06);
              color: var(--ins-gold-bright);
              padding: 2px 6px;
              border-radius: 4px;
              font-family: monospace;
              font-size: 12px;
            }

            .ins-match-badge.green {
              background: rgba(16, 185, 129, 0.12);
              color: var(--ins-emerald);
              padding: 3px 8px;
              border-radius: 999px;
              font-size: 10px;
              font-weight: 800;
            }

            /* CHECKLIST */
            .ins-checklist-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
            }

            .ins-check-item {
              display: flex;
              gap: 12px;
              align-items: flex-start;
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--ins-border-subtle);
              border-radius: 12px;
              padding: 16px;
            }

            .ins-check-icon {
              width: 24px;
              height: 24px;
              border-radius: 50%;
              background: rgba(16, 185, 129, 0.15);
              color: var(--ins-emerald);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: 900;
              flex-shrink: 0;
              margin-top: 2px;
            }

            .ins-check-item strong { display: block; font-size: 13.5px; color: #FFFFFF; }
            .ins-check-item p { margin: 4px 0 0; font-size: 12px; color: var(--ins-text-secondary); line-height: 1.45; }

            /* FORMATS */
            .ins-format-chips-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 14px;
              margin-bottom: 18px;
            }

            .ins-fmt-card {
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--ins-border-subtle);
              border-radius: 12px;
              padding: 16px;
              text-align: center;
            }

            .ins-fmt-name { display: block; font-size: 16px; font-weight: 800; color: var(--ins-gold-bright); }
            .ins-fmt-sub { display: block; margin-top: 4px; font-size: 11px; color: var(--ins-text-muted); }

            .ins-size-banner {
              display: flex;
              align-items: center;
              gap: 16px;
              background: rgba(212, 175, 55, 0.08);
              border: 1px solid var(--ins-border-gold);
              border-radius: 12px;
              padding: 16px 20px;
            }

            .ins-size-icon-box {
              width: 44px;
              height: 44px;
              border-radius: 10px;
              background: rgba(212, 175, 55, 0.15);
              color: var(--ins-gold-bright);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 12px;
              font-weight: 900;
              flex-shrink: 0;
            }

            .ins-size-banner strong { display: block; font-size: 13.5px; color: #FFFFFF; }
            .ins-size-banner p { margin: 3px 0 0; font-size: 12px; color: var(--ins-text-secondary); line-height: 1.45; }

            /* ACCORDION / COMMON ISSUES */
            .ins-accordion {
              display: flex;
              flex-direction: column;
              gap: 10px;
            }

            .ins-accordion-item {
              background: rgba(10, 12, 18, 0.6);
              border: 1px solid var(--ins-border-subtle);
              border-radius: 12px;
              overflow: hidden;
              transition: border-color 0.2s;
            }

            .ins-accordion-item.open {
              border-color: var(--ins-border-gold);
            }

            .ins-accordion-trigger {
              width: 100%;
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 16px 20px;
              background: none;
              border: none;
              color: #FFFFFF;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              text-align: left;
            }

            .ins-faq-title-row {
              display: flex;
              align-items: center;
              gap: 10px;
            }

            .ins-faq-icon { font-size: 16px; }

            .ins-accordion-arrow {
              font-size: 18px;
              color: var(--ins-gold-primary);
              font-weight: 700;
            }

            .ins-accordion-content {
              padding: 0 20px 18px 46px;
              font-size: 13px;
              color: var(--ins-text-secondary);
              line-height: 1.6;
              border-top: 1px solid rgba(255, 255, 255, 0.03);
              padding-top: 12px;
            }

            .ins-accordion-content p { margin: 6px 0; }
            .ins-accordion-content strong { color: #FFFFFF; }
            .ins-accordion-content em { color: var(--ins-gold-bright); font-style: normal; }

            /* SUPPORT CARD */
            .ins-support-card {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 24px;
              background: linear-gradient(135deg, rgba(24, 30, 46, 0.95) 0%, rgba(14, 18, 28, 0.95) 100%);
              border: 1px solid var(--ins-border-gold);
              padding: 28px 32px;
            }

            .ins-support-content {
              display: flex;
              gap: 18px;
              align-items: center;
            }

            .ins-support-icon {
              font-size: 32px;
              width: 54px;
              height: 54px;
              border-radius: 14px;
              background: rgba(212, 175, 55, 0.12);
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }

            .ins-support-title { margin: 0; font-size: 18px; font-weight: 800; color: #FFFFFF; }
            .ins-support-desc { margin: 4px 0 0; font-size: 13px; color: var(--ins-text-secondary); max-width: 580px; line-height: 1.5; }

            .ins-support-actions {
              display: flex;
              gap: 12px;
              flex-shrink: 0;
            }

            /* FOOTER */
            .ins-footer {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-top: 1px solid var(--ins-border-subtle);
              padding-top: 20px;
              font-size: 12px;
              color: var(--ins-text-muted);
            }

            .ins-footer-brand {
              display: flex;
              align-items: center;
              gap: 8px;
            }

            .ins-footer-logo { color: var(--ins-gold-primary); }
            .ins-footer-ver { color: var(--ins-text-muted); font-size: 11px; }

            .ins-footer-links {
              display: flex;
              gap: 16px;
            }

            .ins-footer-btn {
              background: none;
              border: none;
              color: var(--ins-text-secondary);
              font-size: 12px;
              cursor: pointer;
            }

            .ins-footer-btn:hover { color: var(--ins-gold-bright); }

            /* RESPONSIVE */
            @media (max-width: 1100px) {
              .ins-steps-grid { grid-template-columns: repeat(2, 1fr); }
              .ins-checklist-grid { grid-template-columns: repeat(2, 1fr); }
              .ins-patterns-grid { grid-template-columns: 1fr; }
              .ins-format-chips-grid { grid-template-columns: repeat(2, 1fr); }
            }

            @media (max-width: 850px) {
              .ins-hero-card { flex-direction: column; align-items: flex-start; }
              .ins-support-card { flex-direction: column; align-items: flex-start; }
              .ins-sandbox-inputs { grid-template-columns: 1fr; }
              .ins-steps-grid { grid-template-columns: 1fr; }
              .ins-checklist-grid { grid-template-columns: 1fr; }
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