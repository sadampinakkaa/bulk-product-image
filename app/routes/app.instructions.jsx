import {
  boundary,
} from "@shopify/shopify-app-react-router/server";

import {
  useNavigate,
} from "react-router";

import {
  authenticate,
} from "../shopify.server";

export const loader =
  async ({
    request,
  }) => {
    await authenticate.admin(
      request
    );

    return null;
  };

export default function Instructions() {
  const navigate =
    useNavigate();

  return (
    <s-page
      heading="How Variant Image Sync works"
      inline-size="large"
    >
      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() =>
          navigate("/app")
        }
      >
        Back to importer
      </s-button>

      <s-section>
        <div className="ins-hero">
          <div>
            <div className="ins-eyebrow">
              SIMPLE 3-STEP WORKFLOW
            </div>

            <h1>
              Prepare your images once.
              Let the app do the rest.
            </h1>

            <p>
              Variant Image Sync reads the
              image filename, matches it to
              your Shopify variant SKU and
              attaches the image automatically.
            </p>
          </div>

          <div className="ins-hero-number">
            01
          </div>
        </div>
      </s-section>

      <s-section heading="Before importing">
        <div className="ins-steps">
          <div className="ins-step purple">
            <div className="ins-number">
              01
            </div>

            <div>
              <h3>
                Create a Google Drive folder
              </h3>

              <p>
                Put the images you want to
                import directly inside the
                folder.
              </p>
            </div>
          </div>

          <div className="ins-step blue">
            <div className="ins-number">
              02
            </div>

            <div>
              <h3>
                Make the folder public
              </h3>

              <p>
                Set sharing to:
              </p>

              <div className="ins-permission">
                Anyone with the link
                <span>→</span>
                Viewer
              </div>
            </div>
          </div>

          <div className="ins-step orange">
            <div className="ins-number">
              03
            </div>

            <div>
              <h3>
                Name images using SKU
              </h3>

              <p>
                The filename before the
                extension must match the
                Shopify variant SKU.
              </p>

              <div className="ins-example">
                <code>
                  ABC-001
                </code>

                <span>→</span>

                <code>
                  ABC-001.jpg
                </code>
              </div>
            </div>
          </div>
        </div>
      </s-section>

      <s-section heading="Supported formats">
  <div className="ins-format-grid">
    <div>
      <span>JPG</span>
      <small>
        JPEG images
      </small>
    </div>

    <div>
      <span>PNG</span>
      <small>
        Transparent images
      </small>
    </div>

    <div>
      <span>WEBP</span>
      <small>
        Modern web images
      </small>
    </div>

    <div>
      <span>GIF</span>
      <small>
        Animated/static GIF
      </small>
    </div>
  </div>

  <div className="ins-size-note">
    <div className="ins-size-icon">
      MB
    </div>

    <div>
      <strong>
        Maximum image size: 20 MB per image
      </strong>

      <p>
        Images larger than 20 MB will not be
        imported. Please reduce the image size
        before adding it to Google Drive.
      </p>
    </div>
  </div>
</s-section>

      <s-section heading="Example">
        <div className="ins-example-card">
          <div className="ins-example-title">
            Your Shopify variants
          </div>

          <div className="ins-table">
            <div>
              <strong>
                Variant SKU
              </strong>

              <strong>
                Drive image
              </strong>

              <strong>
                Result
              </strong>
            </div>

            <div>
              <code>
                ABC-001
              </code>

              <code>
                ABC-001.jpg
              </code>

              <span className="match">
                MATCH
              </span>
            </div>

            <div>
              <code>
                ABC-002
              </code>

              <code>
                ABC-002.png
              </code>

              <span className="match">
                MATCH
              </span>
            </div>

            <div>
              <code>
                XYZ-100
              </code>

              <code>
                XYZ-100.webp
              </code>

              <span className="match">
                MATCH
              </span>
            </div>
          </div>
        </div>
      </s-section>

      <s-section heading="Good to know">
        <div className="ins-notes">
          <div>
            <span>✓</span>
            <p>
              Existing Shopify product images
              are not deleted.
            </p>
          </div>

          <div>
            <span>✓</span>
            <p>
              File extensions are ignored when
              matching the SKU.
            </p>
          </div>

          <div>
            <span>✓</span>
            <p>
              Images without a matching SKU
              are reported separately.
            </p>
          </div>

          <div>
            <span>✓</span>
            <p>
              Import progress updates while the
              job is running.
            </p>
          </div>
        </div>
      </s-section>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .ins-hero {
              display:flex;
              align-items:center;
              justify-content:space-between;
              gap:25px;
              padding:34px;
              border-radius:24px;
              background:
                linear-gradient(
                  135deg,
                  #eef3ff,
                  #f5ebff 55%,
                  #fff1e7
                );
            }

            .ins-eyebrow {
              margin-bottom:9px;
              color:#6846d8;
              font-size:10px;
              font-weight:900;
              letter-spacing:1.7px;
            }

            .ins-hero h1 {
              max-width:650px;
              margin:0;
              font-size:29px;
              line-height:1.18;
              font-weight:850;
            }

            .ins-hero p {
              max-width:650px;
              margin:12px 0 0;
              color:#697180;
              font-size:14px;
              line-height:1.6;
            }

            .ins-hero-number {
              display:flex;
              align-items:center;
              justify-content:center;
              width:100px;
              height:100px;
              border-radius:28px;
              background:#fff;
              color:#6846d8;
              font-size:27px;
              font-weight:900;
              box-shadow:0 18px 40px rgba(70,50,120,.12);
            }

            .ins-steps {
              display:grid;
              grid-template-columns:repeat(3,1fr);
              gap:14px;
            }

            .ins-step {
              min-height:190px;
              padding:22px;
              border-radius:19px;
            }

            .ins-step.purple {
              background:#f4edff;
            }

            .ins-step.blue {
              background:#edf4ff;
            }

            .ins-step.orange {
              background:#fff2e5;
            }

            .ins-number {
              margin-bottom:25px;
              font-size:11px;
              font-weight:900;
              opacity:.45;
            }

            .ins-step h3 {
              margin:0 0 7px;
              font-size:16px;
            }

            .ins-step p {
              margin:0;
              color:#69717e;
              font-size:12px;
              line-height:1.55;
            }

            .ins-permission {
              display:inline-flex;
              gap:8px;
              margin-top:13px;
              padding:9px 11px;
              border-radius:9px;
              background:#fff;
              font-size:11px;
              font-weight:800;
            }

            .ins-example {
              display:flex;
              align-items:center;
              gap:10px;
              margin-top:14px;
            }

            .ins-example code {
              padding:7px 9px;
              border-radius:7px;
              background:#fff;
              font-family:monospace;
              font-size:11px;
              font-weight:700;
            }

            .ins-format-grid {
              display:grid;
              grid-template-columns:repeat(4,1fr);
              gap:12px;
            }

            .ins-format-grid > div {
              padding:18px;
              border-radius:16px;
              background:#f7f8fa;
              border:1px solid #e6e8ed;
            }

            .ins-format-grid span {
              display:block;
              color:#6846d8;
              font-size:17px;
              font-weight:900;
            }

            .ins-format-grid small {
              display:block;
              margin-top:5px;
              color:#747b87;
              font-size:11px;
            }

            .ins-size-note {
  display:flex;
  align-items:center;
  gap:14px;
  margin-top:14px;
  padding:15px 17px;
  border-radius:14px;
  background:#fff8ed;
  border:1px solid #f4dfbd;
}

.ins-size-icon {
  display:flex;
  align-items:center;
  justify-content:center;
  width:42px;
  height:42px;
  min-width:42px;
  border-radius:11px;
  background:#fff;
  color:#c77800;
  font-size:11px;
  font-weight:900;
  box-shadow:0 4px 12px rgba(100,70,20,.08);
}

.ins-size-note strong {
  display:block;
  color:#5c451f;
  font-size:12px;
  font-weight:800;
}

.ins-size-note p {
  margin:4px 0 0;
  color:#7a6a52;
  font-size:11px;
  line-height:1.5;
}

            .ins-example-card {
              padding:22px;
              border-radius:18px;
              background:#fff;
              border:1px solid #e4e7ed;
            }

            .ins-example-title {
              margin-bottom:17px;
              font-size:15px;
              font-weight:800;
            }

            .ins-table > div {
              display:grid;
              grid-template-columns:1fr 1fr 100px;
              gap:12px;
              align-items:center;
              padding:12px 0;
              border-bottom:1px solid #edf0f3;
            }

            .ins-table > div:last-child {
              border-bottom:0;
            }

            .ins-table strong {
              color:#737a86;
              font-size:11px;
            }

            .ins-table code {
              font-family:monospace;
              font-size:12px;
            }

            .match {
              width:max-content;
              padding:5px 8px;
              border-radius:999px;
              background:#eafaf1;
              color:#16834f;
              font-size:9px;
              font-weight:900;
            }

            .ins-notes {
              display:grid;
              grid-template-columns:repeat(2,1fr);
              gap:12px;
            }

            .ins-notes > div {
              display:flex;
              gap:11px;
              padding:16px;
              border-radius:14px;
              background:#f7f8fa;
            }

            .ins-notes span {
              color:#20a464;
              font-weight:900;
            }

            .ins-notes p {
              margin:0;
              color:#626a76;
              font-size:12px;
              line-height:1.5;
            }

            @media(max-width:800px) {
              .ins-hero-number {
                display:none;
              }

              .ins-steps,
              .ins-format-grid,
              .ins-notes {
                grid-template-columns:1fr;
              }

              .ins-table > div {
                grid-template-columns:1fr;
              }
            }
          `,
        }}
      />
    </s-page>
  );
}

export const headers = (
  headersArgs
) =>
  boundary.headers(
    headersArgs
  );