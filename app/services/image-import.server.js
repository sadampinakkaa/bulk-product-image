import {
  listPublicDriveImages,
  getSkuFromFilename,
  downloadDriveImage,
} from "./google-drive.server.js";

import db from "../db.server";

const jobs = new Map();

const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

const JOB_TTL = 1000 * 60 * 60;

// ------------------------------------------------------
// Concurrency
// ------------------------------------------------------

const DOWNLOAD_CONCURRENCY = 3;
const SHOPIFY_CONCURRENCY = 3;

// ------------------------------------------------------
// Shopify media
// ------------------------------------------------------

const MEDIA_READY_TIMEOUT = 120000;
const MEDIA_POLL_INTERVAL = 2500;

// ------------------------------------------------------
// Assignment
// ------------------------------------------------------

const ASSIGN_MAX_RETRIES = 3;
const ASSIGN_RETRY_DELAY = 2000;

// ======================================================
// CREATE IMPORT JOB
// ======================================================

export async function createImportJob({
  admin,
  shop,
  driveUrl,
}) {
  const jobId =
    `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;

  const job = {
    id: jobId,

    shop,

    status: "starting",

    message:
      "Preparing your import...",

    driveUrl,

    startedAt:
      new Date().toISOString(),

    completedAt: null,

    progress: {
      processed: 0,
      total: 0,
      estimatedSeconds: 0,
    },

    summary: {
      imagesFound: 0,
      variantsMatched: 0,
      imagesUploaded: 0,
      imagesAssigned: 0,
      skuNotFound: 0,
      errors: 0,
    },

    errors: [],
  };

  jobs.set(
    jobId,
    job
  );

  runImportJob({
    job,
    admin,
  }).catch((error) => {
    console.error(
      "[IMAGE IMPORT] Background job error:",
      error
    );

    job.status =
      "failed";

    job.message =
      error?.message ||
      "Import failed.";

    job.completedAt =
      new Date().toISOString();

    job.summary.errors =
      job.errors.length;
  });

  return jobId;
}

// ======================================================
// GET JOB
// ======================================================

export function getImportJob(
  jobId
) {
  const job =
    jobs.get(jobId);

  if (!job) {
    return null;
  }

  if (
    Date.now() -
      new Date(
        job.startedAt
      ).getTime() >
    JOB_TTL
  ) {
    jobs.delete(
      jobId
    );

    return null;
  }

  return job;
}

// ======================================================
// MAIN IMPORT JOB
// ======================================================

async function runImportJob({
  job,
  admin,
}) {
  const startTime =
    Date.now();

  try {
    // ==================================================
    // 1. READ GOOGLE DRIVE
    // ==================================================

    job.status =
      "processing";

    job.message =
      "Reading Google Drive folder...";

    const driveFiles =
      await listPublicDriveImages(
        job.driveUrl
      );

    // --------------------------------------------------
    // Remove duplicate Drive files
    // --------------------------------------------------

    const uniqueDriveFiles =
      deduplicateDriveFiles(
        driveFiles
      );

    job.summary.imagesFound =
      uniqueDriveFiles.length;

    job.progress.total =
      uniqueDriveFiles.length;

    console.log(
      "[IMAGE IMPORT] Drive files:",
      {
        found:
          driveFiles.length,

        unique:
          uniqueDriveFiles.length,
      }
    );

    if (
      !uniqueDriveFiles.length
    ) {
      job.status =
        "completed";

      job.message =
        "No supported images were found in the folder.";

      job.completedAt =
        new Date().toISOString();

      return;
    }

    // ==================================================
    // 2. LOAD SHOPIFY VARIANTS
    // ==================================================

    job.message =
      "Loading Shopify variant SKUs...";

    const variantMap =
      await loadAllVariants(
        admin
      );

    if (
      !variantMap.size
    ) {
      throw new Error(
        "No Shopify variants with SKUs were found."
      );
    }

    // ==================================================
    // 3. MATCH FILES TO VARIANTS
    // ==================================================

    const matchedFiles =
      [];

    for (
      const file of
        uniqueDriveFiles
    ) {
      const sku =
        getSkuFromFilename(
          file.name
        );

      const normalizedSku =
        normalizeSku(
          sku
        );

      console.log(
          "[IMAGE IMPORT] SKU MATCH DEBUG:",
          {
            filename: file.name,
            extractedSku: sku,
            normalizedSku,
            found: variantMap.has(normalizedSku),
          }
        );

        const variant =
          variantMap.get(
            normalizedSku
          );

      if (!variant) {
        job.summary.skuNotFound++;

        recordError(
          job,
          file,
          sku,
          new Error(
            `SKU "${sku}" was not found in Shopify.`
          )
        );

        continue;
      }

      job.summary.variantsMatched++;

      matchedFiles.push({
        file,

        sku,

        variant,
      });
    }

    if (
      !matchedFiles.length
    ) {
      finishJob(
        job,
        startTime
      );

      return;
    }

    // ==================================================
    // 4. DOWNLOAD IMAGES CONCURRENTLY
    // ==================================================

    job.message =
      `Downloading ${matchedFiles.length} image(s)...`;

    const downloadResults =
      await mapWithConcurrency(
        matchedFiles,
        DOWNLOAD_CONCURRENCY,
        async (
          item
        ) => {
          try {
            const image =
              await downloadDriveImage(
                item.file
              );

            if (
              !image?.buffer?.length
            ) {
              throw new Error(
                `Downloaded image is empty: ${item.file.name}`
              );
            }

            if (
              image.buffer.length >
              MAX_IMAGE_SIZE
            ) {
              throw new Error(
                `Image is larger than 20 MB: ${item.file.name}`
              );
            }

            return {
              ...item,

              image,
            };
          } catch (
            error
          ) {
            recordError(
              job,
              item.file,
              item.sku,
              error
            );

            return null;
          }
        }
      );

    const downloaded =
      downloadResults.filter(
        Boolean
      );

    if (
      !downloaded.length
    ) {
      finishJob(
        job,
        startTime
      );

      return;
    }

    // ==================================================
    // 5. CREATE SHOPIFY MEDIA
    // ==================================================

    job.message =
      `Uploading ${downloaded.length} image(s) to Shopify...`;

    const mediaResults =
      await mapWithConcurrency(
        downloaded,
        SHOPIFY_CONCURRENCY,
        async (
          item
        ) => {
          try {
            // ------------------------------------------
            // Create staged upload
            // ------------------------------------------

            const resourceUrl =
              await createStagedUpload(
                admin,
                {
                  filename:
                    item.file.name,

                  mimeType:
                    item.image.contentType,

                  buffer:
                    item.image.buffer,
                }
              );

            console.log(
              "[IMAGE IMPORT] Staged upload completed:",
              {
                file:
                  item.file.name,

                sku:
                  item.sku,

                resourceUrl,
              }
            );

            // ------------------------------------------
            // Create product media
            // ------------------------------------------

            const media =
              await createProductMedia(
                admin,
                {
                  productId:
                    item.variant.productId,

                  originalSource:
                    resourceUrl,

                  alt:
                    item.sku,
                }
              );

            console.log(
              "[IMAGE IMPORT] Media created:",
              {
                file:
                  item.file.name,

                sku:
                  item.sku,

                productId:
                  item.variant.productId,

                variantId:
                  item.variant.id,

                mediaId:
                  media.id,

                status:
                  media.status,
              }
            );

            // ------------------------------------------
            // Wait until Shopify is ready
            // ------------------------------------------

            await waitForMediaReady(
              admin,
              media.id
            );

            return {
              ...item,

              media,

              uploaded:
                true,
            };

          } catch (
            error
          ) {
            recordError(
              job,
              item.file,
              item.sku,
              error
            );

            return null;
          }
        }
      );

    const readyMedia =
      mediaResults.filter(
        Boolean
      );

    job.summary.imagesUploaded =
      readyMedia.filter(
        (
          item
        ) =>
          item.uploaded
      ).length;

    if (
      !readyMedia.length
    ) {
      finishJob(
        job,
        startTime
      );

      return;
    }

    // ==================================================
    // 6. GROUP BY PRODUCT
    // ==================================================

    /*
     * Important:
     *
     * Shopify's productVariantAppendMedia mutation
     * requires that each variantId occurs ONLY ONCE
     * inside variantMedia.
     *
     * Therefore:
     *
     * SAME PRODUCT
     *    ↓
     * GROUP BY VARIANT
     *    ↓
     * ONE variantMedia entry
     *
     * Example:
     *
     * TEST-001.jpg → Variant A → Media 1
     * TEST-001-2.jpg → Variant A → Media 2
     *
     * becomes:
     *
     * {
     *   variantId: VariantA,
     *   mediaIds: [Media1, Media2]
     * }
     */

    job.message =
      "Preparing variant image assignments...";

    const productGroups =
      groupMediaByProduct(
        readyMedia
      );

    console.log(
      "[IMAGE IMPORT] Product assignment groups:",
      Array.from(
        productGroups.entries()
      ).map(
        ([
          productId,
          items,
        ]) => ({
          productId,

          files:
            items.map(
              (
                item
              ) =>
                item.file.name
            ),
        })
      )
    );

    // ==================================================
    // 7. ASSIGN MEDIA BY PRODUCT
    // ==================================================

    job.message =
      "Assigning images to Shopify variants...";

    const groupResults =
      await mapWithConcurrency(
        Array.from(
          productGroups.entries()
        ),
        SHOPIFY_CONCURRENCY,
        async ([
          productId,
          items,
        ]) => {
          try {
            await assignProductMediaBatch(
              admin,
              {
                productId,
                items,
              }
            );

            return {
              success:
                true,

              items,
            };

          } catch (
            error
          ) {
            console.error(
              "[IMAGE IMPORT] Product assignment failed:",
              {
                productId,

                error:
                  error?.message,
              }
            );

            for (
              const item of
                items
            ) {
              recordError(
                job,
                item.file,
                item.sku,
                error
              );
            }

            return {
              success:
                false,

              items,
            };
          }
        }
      );

    // ==================================================
    // 8. VERIFY ASSIGNMENTS
    // ==================================================

    job.message =
      "Verifying Shopify variant assignments...";

    for (
      const result of
        groupResults
    ) {
      if (
        !result?.success
      ) {
        continue;
      }

      /*
       * Verify each image individually.
       *
       * We do NOT call the assignment mutation again.
       */

      for (
        const item of
          result.items
      ) {
        try {
          const verified =
            await verifyVariantMedia(
              admin,
              {
                variantId:
                  item.variant.id,

                mediaId:
                  item.media.id,
              }
            );

          if (
            verified
          ) {
            job.summary.imagesAssigned++;

            console.log(
              "[IMAGE IMPORT] Assignment verified:",
              {
                file:
                  item.file.name,

                sku:
                  item.sku,

                variantId:
                  item.variant.id,

                mediaId:
                  item.media.id,
              }
            );
          } else {
            recordError(
              job,
              item.file,
              item.sku,
              new Error(
                `Shopify did not confirm media ${item.media.id} on variant ${item.variant.id}.`
              )
            );
          }

        } catch (
          error
        ) {
          recordError(
            job,
            item.file,
            item.sku,
            error
          );
        }
      }
    }

    // ==================================================
    // 9. FINISH
    // ==================================================

    finishJob(
      job,
      startTime
    );

  } catch (
    error
  ) {
    console.error(
      "[IMAGE IMPORT] JOB FAILED:",
      error
    );

    job.status =
      "failed";

    job.message =
      error?.message ||
      "Import failed.";

    job.summary.errors =
      job.errors.length;

    job.completedAt =
      new Date().toISOString();
  }
}

// ======================================================
// DEDUPLICATE DRIVE FILES
// ======================================================

function deduplicateDriveFiles(
  files
) {
  const unique =
    new Map();

  for (
    const file of
      files || []
  ) {
    if (!file?.id) {
      continue;
    }

    if (
      !unique.has(
        file.id
      )
    ) {
      unique.set(
        file.id,
        file
      );
    }
  }

  return Array.from(
    unique.values()
  );
}

// ======================================================
// GROUP MEDIA BY PRODUCT + VARIANT
// ======================================================

function groupMediaByProduct(
  items
) {
  const productGroups =
    new Map();

  for (
    const item of
      items
  ) {
    const productId =
      item.variant.productId;

    if (
      !productGroups.has(
        productId
      )
    ) {
      productGroups.set(
        productId,
        []
      );
    }

    productGroups
      .get(productId)
      .push(item);
  }

  return productGroups;
}

// ======================================================
// FINISH JOB
// ======================================================

function finishJob(
  job,
  startTime
) {
  job.progress.processed =
    job.progress.total;

  job.progress.estimatedSeconds =
    0;

  job.summary.errors =
    job.errors.length;

  if (
    job.summary.errors > 0
  ) {
    job.status =
      "completed_with_errors";

    job.message =
      `Import finished with ${job.summary.errors} error(s). ${job.summary.imagesAssigned} image(s) were assigned to variants.`;
  } else {
    job.status =
      "completed";

    job.message =
      `Import completed successfully. ${job.summary.imagesAssigned} image(s) were assigned to variants.`;
  }

  job.completedAt =
    new Date().toISOString();

    saveImportHistory(job);

  console.log(
    "[IMAGE IMPORT] JOB FINISHED:",
    {
      status:
        job.status,

      imagesFound:
        job.summary.imagesFound,

      matched:
        job.summary.variantsMatched,

      uploaded:
        job.summary.imagesUploaded,

      assigned:
        job.summary.imagesAssigned,

      errors:
        job.summary.errors,

      elapsedSeconds:
        Math.round(
          (
            Date.now() -
            startTime
          ) / 1000
        ),
    }
  );
}

// ======================================================
// RECORD ERROR
// ======================================================

function recordError(
  job,
  file,
  sku,
  error
) {
  const message =
    error?.message ||
    "Unknown error.";

  console.error(
    "[IMAGE IMPORT] ERROR:",
    {
      file:
        file?.name,

      sku,

      message,

      stack:
        error?.stack,
    }
  );

  job.errors.push({
    file:
      file?.name ||
      "Unknown file",

    sku:
      sku ||
      getSkuFromFilename(
        file?.name
      ),

    message,
  });
}

// ======================================================
// CONCURRENCY HELPER
// ======================================================

async function mapWithConcurrency(
  items,
  concurrency,
  worker
) {
  const results =
    new Array(
      items.length
    );

  let nextIndex = 0;

  async function runner() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      results[index] =
        await worker(
          items[index],
          index
        );
    }
  }

  const runners =
    Math.min(
      concurrency,
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          runners,
      },
      () =>
        runner()
    )
  );

  return results;
}

// ======================================================
// LOAD ALL SHOPIFY VARIANTS
// ======================================================

async function loadAllVariants(
  admin
) {
  const map =
    new Map();

  let cursor =
    null;

  while (true) {
    const response =
      await admin.graphql(
        `#graphql
        query VariantSkuPage(
          $cursor: String
        ) {
          productVariants(
            first: 250
            after: $cursor
          ) {
            nodes {
              id
              sku

              product {
                id
              }
            }

            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
        `,
        {
          variables: {
            cursor,
          },
        }
      );

    const json =
      await response.json();

    if (
      json.errors?.length
    ) {
      throw new Error(
        json.errors
          .map(
            (
              error
            ) =>
              error.message
          )
          .join("; ")
      );
    }

    const variants =
      json.data
        ?.productVariants
        ?.nodes ||
      [];

    console.log(
      "[IMAGE IMPORT] Shopify SKU DEBUG:",
      variants
        .filter((variant) => variant.sku)
        .map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          normalizedSku: normalizeSku(variant.sku),
        }))
    );

    for (
      const variant of
        variants
    ) {
      if (
        !variant.sku ||
        !variant.product?.id
      ) {
        continue;
      }

      const normalizedSku =
        normalizeSku(
          variant.sku
        );

      /*
       * If duplicate SKUs exist in Shopify,
       * keep the first one and log the duplicate.
       */

      if (
        map.has(
          normalizedSku
        )
      ) {
        console.warn(
          "[IMAGE IMPORT] Duplicate Shopify SKU detected:",
          {
            sku:
              variant.sku,

            existingVariant:
              map.get(
                normalizedSku
              )?.id,

            duplicateVariant:
              variant.id,
          }
        );

        continue;
      }

      map.set(
        normalizedSku,
        {
          id:
            variant.id,

          productId:
            variant.product.id,

          sku:
            variant.sku,
        }
      );
    }

    const pageInfo =
      json.data
        ?.productVariants
        ?.pageInfo;

    if (
      !pageInfo?.hasNextPage
    ) {
      break;
    }

    cursor =
      pageInfo.endCursor;
  }

  console.log(
    "[IMAGE IMPORT] Shopify variants loaded:",
    map.size
  );

  return map;
}

// ======================================================
// CREATE STAGED UPLOAD
// ======================================================

async function createStagedUpload(
  admin,
  {
    filename,
    mimeType,
    buffer,
  }
) {
  const response =
    await admin.graphql(
      `#graphql
      mutation StagedUpload(
        $input: [StagedUploadInput!]!
      ) {
        stagedUploadsCreate(
          input: $input
        ) {
          stagedTargets {
            url
            resourceUrl

            parameters {
              name
              value
            }
          }

          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          input: [
            {
              filename,

              mimeType,

              httpMethod:
                "POST",

              resource:
                "PRODUCT_IMAGE",
            },
          ],
        },
      }
    );

  const json =
    await response.json();

  if (
    json.errors?.length
  ) {
    throw new Error(
      json.errors
        .map(
          (
            error
          ) =>
            error.message
        )
        .join("; ")
    );
  }

  const result =
    json.data
      ?.stagedUploadsCreate;

  if (
    result?.userErrors?.length
  ) {
    throw new Error(
      result.userErrors
        .map(
          (
            error
          ) =>
            error.message
        )
        .join("; ")
    );
  }

  const target =
    result?.stagedTargets?.[0];

  if (!target) {
    throw new Error(
      "Shopify did not return an upload target."
    );
  }

  const formData =
    new FormData();

  for (
    const parameter of
      target.parameters ||
      []
  ) {
    formData.append(
      parameter.name,
      parameter.value
    );
  }

  formData.append(
    "file",
    new Blob(
      [buffer],
      {
        type:
          mimeType,
      }
    ),
    filename
  );

  const uploadResponse =
    await fetch(
      target.url,
      {
        method:
          "POST",

        body:
          formData,
      }
    );

  if (
    !uploadResponse.ok
  ) {
    const text =
      await uploadResponse.text();

    throw new Error(
      `Shopify staged upload failed: ${text}`
    );
  }

  return target.resourceUrl;
}

// ======================================================
// CREATE PRODUCT MEDIA
// ======================================================

async function createProductMedia(
  admin,
  {
    productId,
    originalSource,
    alt,
  }
) {
  const response =
    await admin.graphql(
      `#graphql
      mutation AddProductMedia(
        $product: ProductUpdateInput!
        $media: [CreateMediaInput!]
      ) {
        productUpdate(
          product: $product
          media: $media
        ) {
          product {
            id
          }

          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          product: {
            id:
              productId,
          },

          media: [
            {
              alt,

              mediaContentType:
                "IMAGE",

              originalSource,
            },
          ],
        },
      }
    );

  const json =
    await response.json();

  if (
    json.errors?.length
  ) {
    throw new Error(
      json.errors
        .map(
          (
            error
          ) =>
            error.message
        )
        .join("; ")
    );
  }

  const result =
    json.data
      ?.productUpdate;

  if (
    result?.userErrors?.length
  ) {
    throw new Error(
      result.userErrors
        .map(
          (
            error
          ) =>
            error.message
        )
        .join("; ")
    );
  }

  /*
   * IMPORTANT:
   *
   * We intentionally do not request `fileErrors`.
   *
   * Requesting fileErrors requires additional scopes
   * such as read_files/read_themes/read_images.
   *
   * The importer does not need those scopes.
   */

  /*
   * productUpdate does not return the newly-created
   * media directly in a reliable way.
   *
   * Therefore fetch the product media after creation.
   */

  const media =
    await findProductMediaByAlt(
      admin,
      productId,
      alt
    );

  if (
    !media
  ) {
    throw new Error(
      `Shopify created the product update but the new media could not be located for SKU "${alt}".`
    );
  }

  return media;
}

// ======================================================
// FIND PRODUCT MEDIA BY ALT
// ======================================================

async function findProductMediaByAlt(
  admin,
  productId,
  alt
) {
  const response =
    await admin.graphql(
      `#graphql
      query ProductMediaAfterCreate(
        $id: ID!
      ) {
        product(
          id: $id
        ) {
          id

          media(
            first: 250
          ) {
            nodes {
              id
              alt
              status
              mediaContentType
            }
          }
        }
      }
      `,
      {
        variables: {
          id:
            productId,
        },
      }
    );

  const json =
    await response.json();

  if (
    json.errors?.length
  ) {
    throw new Error(
      json.errors
        .map(
          (
            error
          ) =>
            error.message
        )
        .join("; ")
    );
  }

  const media =
    json.data
      ?.product
      ?.media
      ?.nodes ||
    [];

  const normalizedAlt =
    normalizeSku(
      alt
    );

  const images =
    media.filter(
      (
        item
      ) =>
        item.mediaContentType ===
        "IMAGE"
    );

  /*
   * Return the newest matching media.
   *
   * Shopify generally returns recently created
   * media near the end of the connection.
   */

  for (
    let index =
      images.length - 1;
    index >= 0;
    index--
  ) {
    const item =
      images[index];

    if (
      normalizeSku(
        item.alt
      ) ===
      normalizedAlt
    ) {
      return item;
    }
  }

  return null;
}

// ======================================================
// WAIT FOR MEDIA READY
// ======================================================

async function waitForMediaReady(
  admin,
  mediaId
) {
  const startedAt =
    Date.now();

  while (
    Date.now() -
      startedAt <
    MEDIA_READY_TIMEOUT
  ) {
    const response =
      await admin.graphql(
        `#graphql
        query CheckMedia(
          $id: ID!
        ) {
          node(
            id: $id
          ) {
            ... on MediaImage {
              id
              status
            }
          }
        }
        `,
        {
          variables: {
            id:
              mediaId,
          },
        }
      );

    const json =
      await response.json();

    if (
      json.errors?.length
    ) {
      throw new Error(
        json.errors
          .map(
            (
              error
            ) =>
              error.message
          )
          .join("; ")
      );
    }

    const media =
      json.data?.node;

    if (!media) {
      throw new Error(
        `Shopify media ${mediaId} could not be found.`
      );
    }

    console.log(
      "[IMAGE IMPORT] Media status:",
      {
        mediaId,

        status:
          media.status,
      }
    );

    if (
      media.status ===
      "READY"
    ) {
      return true;
    }

    if (
      media.status ===
      "FAILED"
    ) {
      throw new Error(
        `Shopify failed to process media ${mediaId}.`
      );
    }

    await sleep(
      MEDIA_POLL_INTERVAL
    );
  }

  throw new Error(
    `Shopify image processing timed out after ${MEDIA_READY_TIMEOUT / 1000} seconds.`
  );
}

// ======================================================
// ASSIGN ALL MEDIA FOR ONE PRODUCT
// ======================================================

async function assignProductMediaBatch(
  admin,
  {
    productId,
    items,
  }
) {
  /*
   * ----------------------------------------------------
   * CRITICAL FIX
   * ----------------------------------------------------
   *
   * Group by VARIANT.
   *
   * Shopify does NOT allow:
   *
   * [
   *   {
   *     variantId: "A",
   *     mediaIds: ["1"]
   *   },
   *   {
   *     variantId: "A",
   *     mediaIds: ["2"]
   *   }
   * ]
   *
   * Instead it requires:
   *
   * [
   *   {
   *     variantId: "A",
   *     mediaIds: ["1", "2"]
   *   }
   * ]
   */

  const variantGroups =
    new Map();

  for (
    const item of
      items
  ) {
    const variantId =
      item.variant.id;

    if (
      !variantGroups.has(
        variantId
      )
    ) {
      variantGroups.set(
        variantId,
        {
          variant:
            item.variant,

          items: [],
        }
      );
    }

    variantGroups
      .get(
        variantId
      )
      .items.push(
        item
      );
  }

  console.log(
    "[IMAGE IMPORT] Variant groups:",
    Array.from(
      variantGroups.entries()
    ).map(
      ([
        variantId,
        group,
      ]) => ({
        variantId,

        sku:
          group.variant.sku,

        mediaIds:
          group.items.map(
            (
              item
            ) =>
              item.media.id
          ),
      })
    )
  );

  // ----------------------------------------------------
  // Remove already assigned media
  // ----------------------------------------------------

  const pendingVariantGroups =
    new Map();

  for (
    const [
      variantId,
      group,
    ] of variantGroups
  ) {
    const pendingMedia =
      [];

    for (
      const item of
        group.items
    ) {
      try {
        const assigned =
          await verifyVariantMedia(
            admin,
            {
              variantId,

              mediaId:
                item.media.id,
            }
          );

        if (
          assigned
        ) {
          console.log(
            "[IMAGE IMPORT] Already assigned:",
            {
              sku:
                item.sku,

              variantId,

              mediaId:
                item.media.id,
            }
          );

          continue;
        }

        pendingMedia.push(
          item
        );

      } catch (
        error
      ) {
        /*
         * If verification fails, keep the media in
         * the pending list. The actual mutation can
         * still tell us if assignment is possible.
         */

        console.warn(
          "[IMAGE IMPORT] Pre-assignment verification failed:",
          {
            variantId,

            mediaId:
              item.media.id,

            error:
              error?.message,
          }
        );

        pendingMedia.push(
          item
        );
      }
    }

    if (
      pendingMedia.length
    ) {
      pendingVariantGroups.set(
        variantId,
        {
          variant:
            group.variant,

          items:
            pendingMedia,
        }
      );
    }
  }

  if (
    !pendingVariantGroups.size
  ) {
    console.log(
      "[IMAGE IMPORT] All media already assigned."
    );

    return true;
  }

  // ----------------------------------------------------
  // Build ONE input per variant
  // ----------------------------------------------------

  const variantMedia =
    Array.from(
      pendingVariantGroups.values()
    ).map(
      (
        group
      ) => ({
        variantId:
          group.variant.id,

        mediaIds:
          uniqueIds(
            group.items.map(
              (
                item
              ) =>
                item.media.id
            )
          ),
      })
    );

  /*
   * Safety check.
   *
   * Never send the same variantId twice.
   */

  const seenVariantIds =
    new Set();

  for (
    const input of
      variantMedia
  ) {
    if (
      seenVariantIds.has(
        input.variantId
      )
    ) {
      throw new Error(
        `Internal error: duplicate variantId "${input.variantId}" detected before Shopify assignment.`
      );
    }

    seenVariantIds.add(
      input.variantId
    );
  }

  console.log(
    "[IMAGE IMPORT] FINAL Shopify variantMedia INPUT:",
    JSON.stringify(
      variantMedia,
      null,
      2
    )
  );

  // ----------------------------------------------------
  // Assign with retries
  // ----------------------------------------------------

  let lastError =
    null;

  for (
    let attempt = 1;
    attempt <=
    ASSIGN_MAX_RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `[IMAGE IMPORT] Assignment attempt ${attempt}/${ASSIGN_MAX_RETRIES}`,
        {
          productId,

          variantCount:
            variantMedia.length,
        }
      );

      const response =
        await admin.graphql(
          `#graphql
          mutation ProductVariantAppendMedia(
            $productId: ID!
            $variantMedia: [ProductVariantAppendMediaInput!]!
          ) {
            productVariantAppendMedia(
              productId: $productId
              variantMedia: $variantMedia
            ) {
              product {
                id
              }

              userErrors {
                field
                message
              }
            }
          }
          `,
          {
            variables: {
              productId,

              variantMedia,
            },
          }
        );

      const json =
        await response.json();

      console.log(
        "[IMAGE IMPORT] Shopify assignment response:",
        JSON.stringify(
          json,
          null,
          2
        )
      );

      // ----------------------------------------------
      // GraphQL errors
      // ----------------------------------------------

      if (
        json.errors?.length
      ) {
        throw new Error(
          json.errors
            .map(
              (
                error
              ) =>
                error.message
            )
            .join("; ")
        );
      }

      const result =
        json.data
          ?.productVariantAppendMedia;

      if (!result) {
        throw new Error(
          "Shopify returned no productVariantAppendMedia response."
        );
      }

      // ----------------------------------------------
      // User errors
      // ----------------------------------------------

      if (
        result.userErrors?.length
      ) {
        const message =
          result.userErrors
            .map(
              (
                error
              ) => {
                const field =
                  Array.isArray(
                    error.field
                  )
                    ? error.field.join(
                        "."
                      )
                    : "";

                return `${
                  field
                    ? `${field}: `
                    : ""
                }${error.message}`;
              }
            )
            .join("; ");

        throw new Error(
          `Shopify variant media assignment failed: ${message}`
        );
      }

      // ----------------------------------------------
      // Product confirmation
      // ----------------------------------------------

      if (
        !result.product?.id
      ) {
        throw new Error(
          "Shopify did not return the product after variant media assignment."
        );
      }

      // ----------------------------------------------
      // Give Shopify time to update the edge
      // ----------------------------------------------

      await sleep(
        ASSIGN_RETRY_DELAY
      );

      // ----------------------------------------------
      // Verify every media
      // ----------------------------------------------

      let allVerified =
        true;

      for (
        const group of
          pendingVariantGroups.values()
      ) {
        for (
          const item of
            group.items
        ) {
          const verified =
            await verifyVariantMedia(
              admin,
              {
                variantId:
                  group.variant.id,

                mediaId:
                  item.media.id,
              }
            );

          if (
            !verified
          ) {
            allVerified =
              false;

            console.warn(
              "[IMAGE IMPORT] Assignment not yet visible:",
              {
                sku:
                  item.sku,

                variantId:
                  group.variant.id,

                mediaId:
                  item.media.id,
              }
            );
          }
        }
      }

      if (
        allVerified
      ) {
        console.log(
          "[IMAGE IMPORT] PRODUCT ASSIGNMENT VERIFIED:",
          {
            productId,

            variantMedia,
          }
        );

        return true;
      }

      lastError =
        new Error(
          `Shopify accepted the assignment but verification failed for product ${productId}.`
        );

    } catch (
      error
    ) {
      lastError =
        error;

      console.error(
        "[IMAGE IMPORT] Assignment attempt failed:",
        {
          productId,

          attempt,

          error:
            error?.message,
        }
      );
    }

    if (
      attempt <
      ASSIGN_MAX_RETRIES
    ) {
      await sleep(
        ASSIGN_RETRY_DELAY
      );
    }
  }

  throw (
    lastError ||
    new Error(
      `Unable to assign media to product ${productId}.`
    )
  );
}

// ======================================================
// VERIFY VARIANT MEDIA
// ======================================================

async function verifyVariantMedia(
  admin,
  {
    variantId,
    mediaId,
  }
) {
  const response =
    await admin.graphql(
      `#graphql
      query VerifyVariantMedia(
        $id: ID!
      ) {
        productVariant(
          id: $id
        ) {
          id

          media(
            first: 250
          ) {
            nodes {
              id
            }
          }
        }
      }
      `,
      {
        variables: {
          id:
            variantId,
        },
      }
    );

  const json =
    await response.json();

  if (
    json.errors?.length
  ) {
    throw new Error(
      json.errors
        .map(
          (
            error
          ) =>
            error.message
        )
        .join("; ")
    );
  }

  const variant =
    json.data
      ?.productVariant;

  if (!variant) {
    throw new Error(
      `Shopify variant ${variantId} could not be found during verification.`
    );
  }

  const media =
    variant.media
      ?.nodes ||
    [];

  return media.some(
    (
      item
    ) =>
      item.id ===
      mediaId
  );
}

// ======================================================
// UNIQUE IDS
// ======================================================

function uniqueIds(
  ids
) {
  return Array.from(
    new Set(
      ids.filter(
        Boolean
      )
    )
  );
}

// ======================================================
// NORMALIZE SKU
// ======================================================

function normalizeSku(
  value
) {
  return String(
    value || ""
  )
    .trim()
    .toLowerCase();
}

// ======================================================
// SLEEP
// ======================================================

function sleep(
  milliseconds
) {
  return new Promise(
    (
      resolve
    ) =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}



// HISTORY FUNCTION


async function saveImportHistory(job) {
  try {
    await db.importHistory.create({
      data: {
        shop: job.shop,

        driveUrl:
          job.driveUrl || "",

        status:
          job.status,

        startedAt:
          new Date(job.startedAt),

        completedAt:
          job.completedAt
            ? new Date(job.completedAt)
            : null,

        imagesFound:
          job.summary?.imagesFound || 0,

        variantsMatched:
          job.summary?.variantsMatched || 0,

        imagesUploaded:
          job.summary?.imagesUploaded || 0,

        imagesAssigned:
          job.summary?.imagesAssigned || 0,

        skuNotFound:
          job.summary?.skuNotFound || 0,

        errors:
          job.summary?.errors || 0,

        message:
          job.message || null,

        errorDetails:
          job.errors?.length
            ? JSON.stringify(
                job.errors
              )
            : null,
      },
    });

    console.log(
      "[IMAGE IMPORT] History saved."
    );
  } catch (error) {
    console.error(
      "[IMAGE IMPORT] Failed to save history:",
      error
    );
  }
}