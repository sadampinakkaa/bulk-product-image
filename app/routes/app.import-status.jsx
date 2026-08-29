import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getImportJob } from "../services/image-import.server.js";

export const loader = async ({
  request,
}) => {
  await authenticate.admin(
    request
  );

  const url =
    new URL(
      request.url
    );

  const jobId =
    url.searchParams.get(
      "jobId"
    );

  if (!jobId) {
    return Response.json(
      {
        ok: false,

        message:
          "Import job ID is missing.",
      },
      {
        status: 400,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }

  const job =
    getImportJob(
      jobId
    );

  if (!job) {
    return Response.json(
      {
        ok: false,

        message:
          "Import job was not found or has expired.",
      },
      {
        status: 404,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }

  return Response.json(
    {
      ok: true,

      jobId:
        job.id,

      status:
        job.status,

      message:
        job.message,

      progress:
        job.progress,

      summary:
        job.summary,

      errors:
        job.errors || [],

      startedAt:
        job.startedAt,

      completedAt:
        job.completedAt,
    },
    {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate",
        Pragma:
          "no-cache",
      },
    }
  );
};

export const headers = (
  headersArgs
) => {
  return boundary.headers(
    headersArgs
  );
};