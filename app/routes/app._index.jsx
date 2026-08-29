import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useFetcher,
  useNavigate,
} from "react-router";

import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import {
  authenticate,
} from "../shopify.server";

import {
  createImportJob,
} from "../services/image-import.server.js";

// ======================================================
// ACTION
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
      formData.get("driveUrl") ||
        ""
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

function isValidDriveUrl(
  value
) {
  try {
    const url =
      new URL(value);

    return (
      url.protocol ===
        "https:" &&
      (
        url.hostname ===
          "drive.google.com" ||
        url.hostname.endsWith(
          ".google.com"
        )
      ) &&
      (
        url.pathname.includes(
          "/folders/"
        ) ||
        url.searchParams.has(
          "id"
        )
      )
    );
  } catch {
    return false;
  }
}

// ======================================================
// TIME FORMAT
// ======================================================

function formatTime(
  seconds
) {
  if (
    !seconds ||
    seconds <= 0
  ) {
    return "Calculating...";
  }

  if (
    seconds < 60
  ) {
    return `${Math.ceil(
      seconds
    )} sec`;
  }

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remaining =
    Math.ceil(
      seconds % 60
    );

  if (
    minutes < 60
  ) {
    return `${minutes}m ${remaining}s`;
  }

  const hours =
    Math.floor(
      minutes / 60
    );

  const mins =
    minutes % 60;

  return `${hours}h ${mins}m`;
}

// ======================================================
// DASHBOARD
// ======================================================

export default function Dashboard() {
  const navigate =
    useNavigate();

  const startFetcher =
    useFetcher();

  const statusFetcher =
    useFetcher();

  const [
    driveUrl,
    setDriveUrl,
  ] = useState("");

  const [
    urlError,
    setUrlError,
  ] = useState("");

  const [
    jobId,
    setJobId,
  ] = useState(null);

  const [
    status,
    setStatus,
  ] = useState(null);

  const result =
    startFetcher.data;

  const isStarting =
    startFetcher.state !==
    "idle";

  // ====================================================
  // JOB DATA
  // ====================================================

  const progress =
    status?.progress || null;

  const summary =
    status?.summary || null;

  /*
   * IMPORTANT:
   *
   * Backend stores detailed errors in:
   *
   * status.errors
   *
   * We expose them directly here.
   */

  const errors =
    Array.isArray(
      status?.errors
    )
      ? status.errors
      : [];

  // ====================================================
  // STATUS
  // ====================================================

  const isRunning =
    status?.status ===
      "starting" ||
    status?.status ===
      "processing";

  const isFinished =
    status?.status ===
      "completed" ||
    status?.status ===
      "completed_with_errors" ||
    status?.status ===
      "failed";

  // ====================================================
  // JOB CREATED
  // ====================================================

  useEffect(() => {
    if (
      result?.ok &&
      result.jobId
    ) {
      setJobId(
        result.jobId
      );

      setStatus(null);
    }
  }, [result]);

  // ====================================================
  // POLLING
  // ====================================================

useEffect(() => {
  if (!jobId) {
    return;
  }

  let stopped =
    false;

  let timer =
    null;

  const poll = () => {
    if (
      stopped
    ) {
      return;
    }

    if (
      statusFetcher.state ===
      "idle"
    ) {
      statusFetcher.load(
        `/app/import-status?jobId=${encodeURIComponent(
          jobId
        )}`
      );
    }

    timer =
      setTimeout(
        poll,
        3000
      );
  };

  poll();

  return () => {
    stopped = true;

    if (timer) {
      clearTimeout(
        timer
      );
    }
  };
}, [
  jobId,
]);

  // ====================================================
  // RECEIVE STATUS
  // ====================================================

  useEffect(() => {
    if (
      statusFetcher.data?.ok
    ) {
      setStatus(
        statusFetcher.data
      );
    }
  }, [
    statusFetcher.data,
  ]);

  // ====================================================
  // PROGRESS
  // ====================================================

  const progressPercent =
    useMemo(() => {
      if (
        !progress?.total
      ) {
        return 0;
      }

      return Math.min(
        100,
        Math.round(
          (
            progress.processed /
            progress.total
          ) *
            100
        )
      );
    }, [progress]);

  // ====================================================
  // START IMPORT
  // ====================================================

  const handleImport =
    () => {
      const value =
        driveUrl.trim();

      setUrlError("");

      if (!value) {
        setUrlError(
          "Please enter your Google Drive folder URL."
        );

        return;
      }

      if (
        !isValidDriveUrl(
          value
        )
      ) {
        setUrlError(
          "Please enter a valid Google Drive folder URL."
        );

        return;
      }

      setJobId(null);
      setStatus(null);

      startFetcher.submit(
        {
          driveUrl:
            value,
        },
        {
          method:
            "post",
        }
      );
    };

  // ====================================================
  // CLEAR
  // ====================================================

  const handleClear =
    () => {
      setDriveUrl("");
      setUrlError("");
      setJobId(null);
      setStatus(null);
    };

  // ====================================================
  // PAGE
  // ====================================================

  return (
    <s-page
      heading="Variant Image Sync"
      inline-size="large"
    >
      {/* ==================================================
          TOP ACTION
      ================================================== */}


      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() =>
          navigate(
            "/app/history"
          )
        }
      >
        Import History
      </s-button>
      
      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() =>
          navigate(
            "/app/instructions"
          )
        }
      >
        Instructions
      </s-button>

      {/* ==================================================
          HERO
      ================================================== */}

      <s-section>
        <div className="vis-hero">
          <div className="vis-hero-content">
            <div className="vis-eyebrow">
              BULK IMAGE IMPORT
            </div>

            <h1>
              Sync variant images by SKU
            </h1>

            <p>
              Import images from a public
              Google Drive folder and
              automatically match them to
              Shopify variants using SKU.
            </p>

            <div className="vis-mini-pills">
              <span>
                Google Drive
              </span>

              <span>
                SKU Matching
              </span>

              <span>
                Shopify
              </span>
            </div>
          </div>

          <div className="vis-hero-art">
            <div className="vis-image-icon">
              IMG
            </div>

            <div className="vis-floating">
              SKU → IMAGE
            </div>
          </div>
        </div>
      </s-section>

      {/* ==================================================
          IMPORT CARD
      ================================================== */}

      <s-section heading="Import images">
        <div className="vis-import-card">
          <div className="vis-card-heading">
            <div>
              <div className="vis-card-title">
                Google Drive folder
              </div>

              <div className="vis-card-subtitle">
                Use a publicly accessible
                Google Drive folder.
              </div>
            </div>

            <div className="vis-connected">
              ● READY
            </div>
          </div>

          <s-text-field
            label="Google Drive folder URL"
            placeholder="https://drive.google.com/drive/folders/..."
            value={driveUrl}
            disabled={
              isStarting ||
              isRunning
            }
            onInput={(event) => {
              setDriveUrl(
                event.currentTarget
                  .value
              );

              setUrlError("");
            }}
          />

          {urlError && (
            <div className="vis-error">
              {urlError}
            </div>
          )}

          <div className="vis-example">
            <span>
              Filename must match SKU
            </span>

            <code>
              ABC-001.jpg
            </code>

            <span>
              →
            </span>

            <code>
              SKU ABC-001
            </code>
          </div>

          <div className="vis-actions">
            <s-button
              variant="primary"
              onClick={
                handleImport
              }
              disabled={
                isStarting ||
                isRunning ||
                !driveUrl.trim()
              }
              {...(
                isStarting
                  ? {
                      loading:
                        true,
                    }
                  : {}
              )}
            >
              {isStarting
                ? "Starting..."
                : "Import Images"}
            </s-button>

            <s-button
              variant="secondary"
              onClick={
                handleClear
              }
              disabled={
                isStarting ||
                isRunning ||
                !driveUrl
              }
            >
              Clear
            </s-button>
          </div>
        </div>
      </s-section>

      {/* ==================================================
          START ERROR
      ================================================== */}

      {result?.ok ===
        false && (
        <s-section>
          <div className="vis-alert">
            <strong>
              Import could not start
            </strong>

            <span>
              {result.message}
            </span>
          </div>
        </s-section>
      )}

      {/* ==================================================
          LIVE PROGRESS
      ================================================== */}

      {status && (
        <>
          <s-section heading="Live import progress">
            <div className="vis-progress-card">
              <div className="vis-progress-header">
                <div>
                  <div className="vis-progress-label">
                    {status.status ===
                    "completed"
                      ? "Import completed"
                      : status.status ===
                        "completed_with_errors"
                      ? "Import completed with errors"
                      : status.status ===
                        "failed"
                      ? "Import stopped"
                      : "Importing images"}
                  </div>

                  <div className="vis-progress-percent">
                    {progressPercent}%
                  </div>
                </div>

                <div className="vis-counter">
                  {progress?.processed ||
                    0}{" "}
                  /{" "}
                  {progress?.total ||
                    0}
                </div>
              </div>

              <div className="vis-track">
                <div
                  className="vis-fill"
                  style={{
                    width: `${progressPercent}%`,
                  }}
                />
              </div>

              <div className="vis-progress-meta">
                <span>
                  {progress?.processed ||
                    0}{" "}
                  processed
                </span>

                <span>
                  {Math.max(
                    0,
                    (
                      progress?.total ||
                      0
                    ) -
                      (
                        progress?.processed ||
                        0
                      )
                  )}{" "}
                  remaining
                </span>

                <span>
                  {isRunning
                    ? formatTime(
                        progress?.estimatedSeconds
                      )
                    : status.status ===
                      "completed"
                    ? "Finished"
                    : "Stopped"}
                </span>
              </div>

              {status.message && (
                <div className="vis-message">
                  {status.message}
                </div>
              )}
            </div>
          </s-section>

          {/* ==================================================
              STATS
          ================================================== */}

          <s-section>
            <div className="vis-stat-grid">
              <div className="vis-stat blue">
                <span>
                  Images found
                </span>

                <strong>
                  {summary?.imagesFound ??
                    progress?.total ??
                    0}
                </strong>
              </div>

              <div className="vis-stat green">
                <span>
                  Matched
                </span>

                <strong>
                  {summary?.variantsMatched ??
                    0}
                </strong>
              </div>

              <div className="vis-stat purple">
                <span>
                  Uploaded
                </span>

                <strong>
                  {summary?.imagesUploaded ??
                    0}
                </strong>
              </div>

              <div className="vis-stat violet">
                <span>
                  Assigned
                </span>

                <strong>
                  {summary?.imagesAssigned ??
                    0}
                </strong>
              </div>

              <div className="vis-stat orange">
                <span>
                  SKU not found
                </span>

                <strong>
                  {summary?.skuNotFound ??
                    0}
                </strong>
              </div>

              <div className="vis-stat red">
                <span>
                  Errors
                </span>

                <strong>
                  {summary?.errors ??
                    0}
                </strong>
              </div>
            </div>
          </s-section>

          {/* ==================================================
              EXACT ERROR DETAILS
          ================================================== */}

          {errors.length > 0 && (
            <s-section heading="Import errors">
              <div className="vis-error-list">
                <div className="vis-error-header">
                  <div>
                    <strong>
                      {errors.length} image(s)
                      could not be completed
                    </strong>

                    <span>
                      Exact error returned by
                      Shopify is shown below.
                    </span>
                  </div>
                </div>

                {errors.map(
                  (
                    error,
                    index
                  ) => (
                    <div
                      className="vis-error-item"
                      key={`${error.file || "file"}-${index}`}
                    >
                      <div className="vis-error-number">
                        {String(
                          index + 1
                        ).padStart(
                          2,
                          "0"
                        )}
                      </div>

                      <div className="vis-error-content">
                        <div className="vis-error-file">
                          {error.file ||
                            "Unknown file"}
                        </div>

                        <div className="vis-error-sku">
                          SKU:{" "}
                          <code>
                            {error.sku ||
                              "Not available"}
                          </code>
                        </div>

                        <div className="vis-error-message">
                          <strong>
                            Error:
                          </strong>{" "}
                          {error.message ||
                            "No error message was returned."}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </s-section>
          )}

          {/* ==================================================
              FINISHED RESULT
          ================================================== */}

          {isFinished &&
            summary && (
              <s-section heading="Import result">
                <div
                  className={
                    status.status ===
                    "completed"
                      ? "vis-result success"
                      : "vis-result failed"
                  }
                >
                  <div className="vis-result-icon">
                    {status.status ===
                    "completed"
                      ? "✓"
                      : "!"}
                  </div>

                  <div>
                    <h2>
                      {status.status ===
                      "completed"
                        ? "Import completed successfully"
                        : "Import finished with errors"}
                    </h2>

                    <p>
                      {summary.imagesAssigned ??
                        0}{" "}
                      image(s) assigned to
                      Shopify variants.
                    </p>

                    {summary.imagesUploaded >
                      0 && (
                      <p>
                        {summary.imagesUploaded}{" "}
                        image(s) uploaded to
                        Shopify.
                      </p>
                    )}
                  </div>
                </div>
              </s-section>
            )}
        </>
      )}

      {/* ==================================================
          QUICK START
      ================================================== */}

      {!status && (
        <s-section heading="Quick start">
          <div className="vis-quick-grid">
            <div>
              <b>
                01
              </b>

              <strong>
                Make folder public
              </strong>

              <p>
                Set Google Drive access to
                Anyone with the link →
                Viewer.
              </p>
            </div>

            <div>
              <b>
                02
              </b>

              <strong>
                Match filenames
              </strong>

              <p>
                Example: ABC-001.jpg for
                Shopify SKU ABC-001.
              </p>
            </div>

            <div>
              <b>
                03
              </b>

              <strong>
                Start import
              </strong>

              <p>
                The app handles matching,
                uploading and assignment
                automatically.
              </p>
            </div>
          </div>
        </s-section>
      )}

      {/* ==================================================
          CSS
      ================================================== */}

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .vis-hero {
              display:flex;
              justify-content:space-between;
              align-items:center;
              gap:30px;
              padding:34px;
              border-radius:24px;
              background:
                linear-gradient(
                  135deg,
                  #e8f0ff 0%,
                  #f5eaff 48%,
                  #fff0e7 100%
                );
              overflow:hidden;
            }

            .vis-hero-content {
              min-width:0;
            }

            .vis-eyebrow {
              font-size:11px;
              font-weight:900;
              letter-spacing:1.8px;
              color:#6846d8;
              margin-bottom:9px;
            }

            .vis-hero h1 {
              margin:0;
              font-size:32px;
              line-height:1.1;
              font-weight:800;
            }

            .vis-hero p {
              max-width:650px;
              margin:12px 0 0;
              color:#5f6675;
              font-size:15px;
              line-height:1.6;
            }

            .vis-mini-pills {
              display:flex;
              flex-wrap:wrap;
              gap:8px;
              margin-top:18px;
            }

            .vis-mini-pills span {
              padding:7px 11px;
              border-radius:999px;
              background:#fff;
              font-size:11px;
              font-weight:800;
              color:#555c6b;
              box-shadow:0 5px 18px rgba(60,50,100,.08);
            }

            .vis-hero-art {
              position:relative;
              width:145px;
              height:120px;
              flex-shrink:0;
            }

            .vis-image-icon {
              width:92px;
              height:92px;
              border-radius:25px;
              display:flex;
              align-items:center;
              justify-content:center;
              background:#fff;
              color:#6947d8;
              font-weight:900;
              box-shadow:0 18px 40px rgba(70,55,130,.15);
              transform:rotate(-5deg);
            }

            .vis-floating {
              position:absolute;
              right:0;
              bottom:0;
              padding:10px 12px;
              border-radius:12px;
              background:#222;
              color:#fff;
              font-size:10px;
              font-weight:800;
              box-shadow:0 12px 25px rgba(0,0,0,.16);
            }

            .vis-import-card,
            .vis-progress-card {
              padding:25px;
              border:1px solid #e4e7ee;
              border-radius:20px;
              background:#fff;
              box-shadow:0 8px 30px rgba(30,40,70,.05);
            }

            .vis-card-heading {
              display:flex;
              justify-content:space-between;
              gap:20px;
              margin-bottom:20px;
            }

            .vis-card-title {
              font-size:19px;
              font-weight:800;
            }

            .vis-card-subtitle {
              margin-top:5px;
              color:#737a88;
              font-size:13px;
            }

            .vis-connected {
              height:max-content;
              padding:7px 10px;
              border-radius:999px;
              background:#eafaf1;
              color:#188653;
              font-size:10px;
              font-weight:900;
            }

            .vis-example {
              display:flex;
              align-items:center;
              flex-wrap:wrap;
              gap:9px;
              margin-top:14px;
              padding:12px 14px;
              border-radius:11px;
              background:#f6f7fa;
              color:#68707d;
              font-size:12px;
            }

            .vis-example code {
              padding:4px 7px;
              border-radius:6px;
              background:#e9ebf0;
              color:#363b45;
              font-family:monospace;
              font-weight:700;
            }

            .vis-actions {
              display:flex;
              gap:10px;
              margin-top:20px;
            }

            .vis-error {
              margin-top:10px;
              color:#c72d2d;
              font-size:13px;
            }

            .vis-alert {
              padding:17px;
              border-radius:14px;
              background:#fff0f0;
              color:#a42121;
              display:flex;
              flex-direction:column;
              gap:4px;
            }

            .vis-progress-header {
              display:flex;
              align-items:flex-end;
              justify-content:space-between;
              gap:20px;
            }

            .vis-progress-label {
              color:#747b88;
              font-size:13px;
              margin-bottom:4px;
            }

            .vis-progress-percent {
              font-size:38px;
              line-height:1;
              font-weight:900;
            }

            .vis-counter {
              font-size:14px;
              font-weight:800;
              color:#596171;
            }

            .vis-track {
              height:13px;
              margin-top:22px;
              overflow:hidden;
              border-radius:999px;
              background:#edf0f5;
            }

            .vis-fill {
              height:100%;
              border-radius:999px;
              background:
                linear-gradient(
                  90deg,
                  #4361ee,
                  #7b2ff7,
                  #ff6b35
                );
              transition:width .4s ease;
            }

            .vis-progress-meta {
              display:flex;
              justify-content:space-between;
              gap:10px;
              margin-top:10px;
              color:#747b88;
              font-size:12px;
            }

            .vis-message {
              margin-top:18px;
              padding-top:14px;
              border-top:1px solid #eceef2;
              color:#555d6a;
              font-size:13px;
            }

            .vis-stat-grid {
              display:grid;
              grid-template-columns:repeat(6,1fr);
              gap:12px;
            }

            .vis-stat {
              padding:19px;
              border-radius:17px;
              border:1px solid #e5e7ec;
            }

            .vis-stat span {
              display:block;
              margin-bottom:9px;
              color:#707786;
              font-size:11px;
              font-weight:700;
            }

            .vis-stat strong {
              font-size:27px;
              font-weight:900;
            }

            .vis-stat.blue {
              background:#edf3ff;
            }

            .vis-stat.green {
              background:#eafaf1;
            }

            .vis-stat.purple {
              background:#f4edff;
            }

            .vis-stat.violet {
              background:#eeeaff;
            }

            .vis-stat.orange {
              background:#fff3e5;
            }

            .vis-stat.red {
              background:#fff0f0;
            }

            /* =========================================
               ERROR DETAILS
            ========================================= */

            .vis-error-list {
              display:flex;
              flex-direction:column;
              gap:12px;
            }

            .vis-error-header {
              padding:17px 19px;
              border-radius:15px;
              background:
                linear-gradient(
                  135deg,
                  #fff1f1,
                  #fff7f7
                );
              border:1px solid #ffd6d6;
            }

            .vis-error-header strong {
              display:block;
              color:#a42121;
              font-size:14px;
            }

            .vis-error-header span {
              display:block;
              margin-top:4px;
              color:#777;
              font-size:12px;
            }

            .vis-error-item {
              display:flex;
              gap:15px;
              padding:18px;
              border-radius:15px;
              background:#fff;
              border:1px solid #ffd8d8;
              box-shadow:
                0 5px 18px
                rgba(150,30,30,.05);
            }

            .vis-error-number {
              width:36px;
              height:36px;
              min-width:36px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-radius:10px;
              background:#ffe4e4;
              color:#c62828;
              font-size:11px;
              font-weight:900;
            }

            .vis-error-content {
              min-width:0;
            }

            .vis-error-file {
              font-size:14px;
              font-weight:800;
              color:#252936;
              word-break:break-word;
            }

            .vis-error-sku {
              margin-top:5px;
              color:#747b88;
              font-size:12px;
            }

            .vis-error-sku code {
              padding:3px 6px;
              border-radius:5px;
              background:#f1f2f5;
              color:#3d4350;
              font-family:monospace;
              font-weight:700;
            }

            .vis-error-message {
              margin-top:10px;
              padding:11px 12px;
              border-radius:9px;
              background:#fff5f5;
              color:#a42121;
              font-size:12px;
              line-height:1.55;
              word-break:break-word;
            }

            .vis-error-message strong {
              font-weight:800;
            }

            /* =========================================
               RESULT
            ========================================= */

            .vis-result {
              display:flex;
              align-items:center;
              gap:15px;
              padding:22px;
              border-radius:18px;
            }

            .vis-result.success {
              background:#eafaf1;
            }

            .vis-result.failed {
              background:#fff0f0;
            }

            .vis-result-icon {
              width:48px;
              height:48px;
              min-width:48px;
              display:flex;
              align-items:center;
              justify-content:center;
              border-radius:50%;
              background:#20a464;
              color:#fff;
              font-size:23px;
              font-weight:900;
            }

            .vis-result.failed .vis-result-icon {
              background:#d92d20;
            }

            .vis-result h2 {
              margin:0;
              font-size:18px;
            }

            .vis-result p {
              margin:5px 0 0;
              color:#68716c;
              font-size:13px;
            }

            /* =========================================
               QUICK START
            ========================================= */

            .vis-quick-grid {
              display:grid;
              grid-template-columns:repeat(3,1fr);
              gap:14px;
            }

            .vis-quick-grid > div {
              padding:20px;
              border-radius:17px;
              background:#f7f8fa;
            }

            .vis-quick-grid > div:nth-child(1) {
              background:#edf3ff;
            }

            .vis-quick-grid > div:nth-child(2) {
              background:#f4edff;
            }

            .vis-quick-grid > div:nth-child(3) {
              background:#eafaf1;
            }

            .vis-quick-grid b {
              display:block;
              margin-bottom:12px;
              color:#6846d8;
              font-size:11px;
            }

            .vis-quick-grid strong {
              display:block;
              font-size:14px;
            }

            .vis-quick-grid p {
              margin:6px 0 0;
              color:#717987;
              font-size:12px;
              line-height:1.5;
            }

            @media(max-width:1000px) {
              .vis-stat-grid {
                grid-template-columns:repeat(3,1fr);
              }
            }

            @media(max-width:800px) {
              .vis-hero-art {
                display:none;
              }

              .vis-stat-grid {
                grid-template-columns:repeat(2,1fr);
              }

              .vis-quick-grid {
                grid-template-columns:1fr;
              }

              .vis-progress-meta {
                flex-direction:column;
                gap:5px;
              }

              .vis-card-heading {
                flex-direction:column;
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

export const headers = (
  headersArgs
) =>
  boundary.headers(
    headersArgs
  );