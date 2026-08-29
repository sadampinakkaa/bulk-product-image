import {
  useLoaderData,
  useNavigate,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({
  request,
}) => {
  const {
    session,
  } = await authenticate.admin(
    request
  );

  const histories =
    await db.importHistory.findMany({
      where: {
        shop: session.shop,
      },

      orderBy: {
        createdAt: "desc",
      },

      take: 100,
    });

  return Response.json({
    histories:
      histories.map(
        (history) => ({
          id: history.id,

          driveUrl:
            history.driveUrl,

          status:
            history.status,

          startedAt:
            history.startedAt.toISOString(),

          completedAt:
            history.completedAt
              ? history.completedAt.toISOString()
              : null,

          createdAt:
            history.createdAt.toISOString(),

          imagesFound:
            history.imagesFound,

          variantsMatched:
            history.variantsMatched,

          imagesUploaded:
            history.imagesUploaded,

          imagesAssigned:
            history.imagesAssigned,

          skuNotFound:
            history.skuNotFound,

          errors:
            history.errors,

          message:
            history.message,
        })
      ),
  });
};

function formatDate(
  value
) {
  if (!value) {
    return "-";
  }

  return new Date(
    value
  ).toLocaleString(
    undefined,
    {
      dateStyle:
        "medium",

      timeStyle:
        "short",
    }
  );
}

function getStatusText(
  status
) {
  if (
    status ===
    "completed"
  ) {
    return "Completed";
  }

  if (
    status ===
    "completed_with_errors"
  ) {
    return "Completed with errors";
  }

  if (
    status ===
    "failed"
  ) {
    return "Failed";
  }

  if (
    status ===
    "processing"
  ) {
    return "Processing";
  }

  return "Starting";
}

function getStatusClass(
  status
) {
  if (
    status ===
    "completed"
  ) {
    return "success";
  }

  if (
    status ===
    "completed_with_errors"
  ) {
    return "warning";
  }

  if (
    status ===
    "failed"
  ) {
    return "error";
  }

  return "neutral";
}

export default function History() {
  const {
    histories,
  } = useLoaderData();

  const navigate =
    useNavigate();

  return (
    <s-page
      heading="Import History"
      inline-size="large"
    >
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() =>
          navigate(
            "/app"
          )
        }
      >
        New Import
      </s-button>

      <s-section>
        <div className="history-intro">
          <div>
            <h2>
              Previous imports
            </h2>

            <p>
              View your previous
              Google Drive image
              imports and their
              results.
            </p>
          </div>

          <div className="history-total">
            {histories.length}
            {" "}
            {histories.length ===
            1
              ? "import"
              : "imports"}
          </div>
        </div>
      </s-section>

      {histories.length ===
      0 ? (
        <s-section>
          <div className="history-empty">
            <div className="history-empty-icon">
              ↻
            </div>

            <h2>
              No import history
            </h2>

            <p>
              Your completed
              imports will appear
              here.
            </p>

            <s-button
              onClick={() =>
                navigate(
                  "/app"
                )
              }
            >
              Start an Import
            </s-button>
          </div>
        </s-section>
      ) : (
        <s-section>
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>
                    Date
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Found
                  </th>

                  <th>
                    Matched
                  </th>

                  <th>
                    Uploaded
                  </th>

                  <th>
                    Assigned
                  </th>

                  <th>
                    SKU Not Found
                  </th>

                  <th>
                    Errors
                  </th>
                </tr>
              </thead>

              <tbody>
                {histories.map(
                  (
                    history
                  ) => (
                    <tr
                      key={
                        history.id
                      }
                    >
                      <td>
                        <div className="history-date">
                          {formatDate(
                            history.createdAt
                          )}
                        </div>

                        <div className="history-id">
                          #
                          {history.id.slice(
                            -8
                          )}
                        </div>
                      </td>

                      <td>
                        <span
                          className={`history-status ${getStatusClass(
                            history.status
                          )}`}
                        >
                          {getStatusText(
                            history.status
                          )}
                        </span>
                      </td>

                      <td>
                        {
                          history.imagesFound
                        }
                      </td>

                      <td>
                        {
                          history.variantsMatched
                        }
                      </td>

                      <td>
                        {
                          history.imagesUploaded
                        }
                      </td>

                      <td>
                        <strong>
                          {
                            history.imagesAssigned
                          }
                        </strong>
                      </td>

                      <td>
                        <span
                          className={
                            history.skuNotFound >
                            0
                              ? "history-number warning-number"
                              : "history-number"
                          }
                        >
                          {
                            history.skuNotFound
                          }
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            history.errors >
                            0
                              ? "history-number error-number"
                              : "history-number"
                          }
                        >
                          {
                            history.errors
                          }
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </s-section>
      )}

      <style>
        {`
          .history-intro {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 20px;
          }

          .history-intro h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 800;
          }

          .history-intro p {
            margin: 6px 0 0;
            color: #69717e;
            font-size: 13px;
          }

          .history-total {
            padding: 8px 13px;
            border-radius: 999px;
            background: #f1f3f7;
            color: #555e6b;
            font-size: 12px;
            font-weight: 700;
          }

          .history-table-container {
            width: 100%;
            overflow-x: auto;
            border: 1px solid #e4e7eb;
            border-radius: 14px;
            background: #fff;
          }

          .history-table {
            width: 100%;
            min-width: 850px;
            border-collapse: collapse;
            font-size: 13px;
          }

          .history-table th {
            padding: 14px;
            text-align: left;
            background: #f8f9fb;
            border-bottom: 1px solid #e4e7eb;
            color: #69717e;
            font-size: 11px;
            font-weight: 800;
            white-space: nowrap;
          }

          .history-table td {
            padding: 16px 14px;
            border-bottom: 1px solid #edf0f3;
            white-space: nowrap;
          }

          .history-table tbody tr:last-child td {
            border-bottom: 0;
          }

          .history-table tbody tr:hover {
            background: #fafbfc;
          }

          .history-date {
            color: #20242b;
            font-weight: 700;
          }

          .history-id {
            margin-top: 4px;
            color: #9aa1ab;
            font-size: 10px;
            font-family: monospace;
          }

          .history-status {
            display: inline-flex;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 800;
          }

          .history-status.success {
            background: #e8f7ee;
            color: #16803c;
          }

          .history-status.warning {
            background: #fff4d6;
            color: #946200;
          }

          .history-status.error {
            background: #fdecec;
            color: #c62828;
          }

          .history-status.neutral {
            background: #edf2f7;
            color: #52606d;
          }

          .history-number {
            font-weight: 700;
          }

          .warning-number {
            color: #946200;
          }

          .error-number {
            color: #c62828;
          }

          .history-empty {
            min-height: 300px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
          }

          .history-empty-icon {
            width: 64px;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
            border-radius: 18px;
            background: #f1edff;
            color: #6846d8;
            font-size: 28px;
            font-weight: 700;
          }

          .history-empty h2 {
            margin: 0;
            font-size: 18px;
          }

          .history-empty p {
            margin: 7px 0 20px;
            color: #69717e;
            font-size: 13px;
          }

          @media (max-width: 700px) {
            .history-intro {
              align-items: flex-start;
              flex-direction: column;
            }
          }
        `}
      </style>
    </s-page>
  );
}