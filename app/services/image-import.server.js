import {
  listPublicDriveImages,
  getSkuFromFilename,
  downloadDriveImage,
} from "./google-drive.server.js";

import db from "../db.server";

const jobs = new Map();

const MAX_IMAGE_SIZE =
  20 * 1024 * 1024;

const JOB_TTL =
  1000 * 60 * 60;

// ------------------------------------------------------
// Concurrency
// ------------------------------------------------------

const DOWNLOAD_CONCURRENCY = 3;
const SHOPIFY_CONCURRENCY = 3;

// ------------------------------------------------------
// Shopify media
// ------------------------------------------------------

const MEDIA_READY_TIMEOUT =
  120000;

const MEDIA_POLL_INTERVAL =
  2500;

// ------------------------------------------------------
// Assignment
// ------------------------------------------------------

const ASSIGN_MAX_RETRIES =
  5;

const ASSIGN_RETRY_DELAY =
  2500;

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

    status:
      "starting",

    message:
      "Preparing your import...",

    driveUrl,

    startedAt:
      new Date().toISOString(),

    completedAt:
      null,

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
  }).catch(
    (error) => {
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
    }
  );

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

      await saveImportHistory(
        job
      );

      return;
    }

    // ==================================================
    // 2. LOAD SHOPIFY VARIANTS
    // ==================================================

    job.message =
      "Loading Shopify variant SKUs...";

    const {
      map: variantMap,
      mediaUsage,
    } =
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
    // 4. DOWNLOAD IMAGES
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
    // 5. CREATE OR UPDATE PRODUCT MEDIA
    // ==================================================

    job.message =
      "Preparing Shopify images...";

    const mediaResults =
      await mapWithConcurrency(
        downloaded,
        SHOPIFY_CONCURRENCY,
        async (
          item
        ) => {
          try {
            const mediaResult =
              await prepareMediaForItem(
                admin,
                item,
                mediaUsage
              );

            if (
              mediaResult.created ||
              mediaResult.updated
            ) {
              job.summary.imagesUploaded++;
            }

            return {
              ...item,

              media:
                mediaResult.media,

              mediaAction:
                mediaResult.action,

              uploaded:
                mediaResult.created ||
                mediaResult.updated,
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
    // 6. ASSIGN MEDIA TO CORRECT VARIANTS
    // ==================================================

    job.message =
      "Assigning images to Shopify variants...";

    const assignmentResults =
      await mapWithConcurrency(
        readyMedia,
        SHOPIFY_CONCURRENCY,
        async (
          item
        ) => {
          try {
            await ensureVariantHasOnlyTargetMedia(
              admin,
              {
                productId:
                  item.variant.productId,

                variantId:
                  item.variant.id,

                targetMediaId:
                  item.media.id,

                sku:
                  item.sku,
              }
            );

            return {
              success:
                true,

              item,
            };
          } catch (
            error
          ) {
            console.error(
              "[IMAGE IMPORT] Variant assignment failed:",
              {
                sku:
                  item.sku,

                variantId:
                  item.variant.id,

                mediaId:
                  item.media.id,

                error:
                  error?.message,
              }
            );

            recordError(
              job,
              item.file,
              item.sku,
              error
            );

            return {
              success:
                false,

              item,
            };
          }
        }
      );

    // ==================================================
    // 7. FINAL VERIFICATION
    // ==================================================

    job.message =
      "Verifying Shopify variant assignments...";

    for (
      const result of
        assignmentResults
    ) {
      if (
        !result?.success
      ) {
        continue;
      }

      const item =
        result.item;

      try {
        const verified =
          await waitForVariantMediaAssignment(
            admin,
            {
              variantId:
                item.variant.id,

              mediaId:
                item.media.id,
            }
          );

        if (!verified) {
          throw new Error(
            `Shopify did not confirm media ${item.media.id} on variant ${item.variant.id}.`
          );
        }

        job.summary.imagesAssigned++;

        console.log(
          "[IMAGE IMPORT] FINAL ASSIGNMENT VERIFIED:",
          {
            sku:
              item.sku,

            variantId:
              item.variant.id,

            mediaId:
              item.media.id,

            action:
              item.mediaAction,
          }
        );
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

    // ==================================================
    // 8. FINISH
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

    await saveImportHistory(
      job
    );
  }
}

// ======================================================
// PREPARE MEDIA
// ======================================================

async function prepareMediaForItem(
  admin,
  item,
  mediaUsage
) {
  const {
    variant,
    sku,
    image,
  } = item;

  const productId =
    variant.productId;

  // ----------------------------------------------------
  // Get current product media
  // ----------------------------------------------------

  const productMedia =
    await getAllProductMedia(
      admin,
      productId
    );

  const normalizedSku =
    normalizeSku(
      sku
    );

  const matchingMedia =
    productMedia
      .filter(
        (
          media
        ) =>
          media.mediaContentType ===
            "IMAGE" &&
          normalizeSku(
            media.alt
          ) ===
            normalizedSku
      )
      .sort(
        (
          a,
          b
        ) =>
          new Date(
            b.createdAt || 0
          ).getTime() -
          new Date(
            a.createdAt || 0
          ).getTime()
      );

  let targetMedia =
    matchingMedia[0] ||
    null;

  // ----------------------------------------------------
  // If SKU media belongs to another variant too,
  // DO NOT modify the shared media.
  //
  // Create a separate media for this SKU instead.
  // ----------------------------------------------------

  if (
    targetMedia &&
    isMediaUsedByAnotherVariant(
      mediaUsage,
      targetMedia.id,
      variant.id
    )
  ) {
    console.warn(
      "[IMAGE IMPORT] Existing SKU media is shared with another variant. Creating a separate media:",
      {
        sku,
        mediaId:
          targetMedia.id,
        variantId:
          variant.id,
      }
    );

    targetMedia =
      null;
  }

  // ----------------------------------------------------
  // EXISTING MEDIA
  // ----------------------------------------------------

  if (
    targetMedia
  ) {
    console.log(
      "[IMAGE IMPORT] Existing SKU media found. Updating in place:",
      {
        sku,

        mediaId:
          targetMedia.id,

        variantId:
          variant.id,
      }
    );

    // fileUpdate requires the file to be READY.
    await waitForMediaReady(
      admin,
      targetMedia.id
    );

    const resourceUrl =
      await createStagedUpload(
        admin,
        {
          filename:
            item.file.name,

          mimeType:
            image.contentType,

          buffer:
            image.buffer,
        }
      );

    const updatedMedia =
      await updateExistingMedia(
        admin,
        {
          mediaId:
            targetMedia.id,

          resourceUrl,

          alt:
            sku,
        }
      );

    await waitForMediaReady(
      admin,
      updatedMedia.id
    );

    console.log(
      "[IMAGE IMPORT] Existing media updated:",
      {
        sku,

        mediaId:
          updatedMedia.id,
      }
    );

    return {
      media:
        updatedMedia,

      created:
        false,

      updated:
        true,

      action:
        "updated",
    };
  }

  // ----------------------------------------------------
  // NO EXISTING MEDIA
  // ----------------------------------------------------

  console.log(
    "[IMAGE IMPORT] No existing SKU media. Creating new media:",
    {
      sku,

      productId,
    }
  );

  const resourceUrl =
    await createStagedUpload(
      admin,
      {
        filename:
          item.file.name,

        mimeType:
          image.contentType,

        buffer:
          image.buffer,
      }
    );

  const createdMedia =
    await createProductMedia(
      admin,
      {
        productId,

        originalSource:
          resourceUrl,

        alt:
          sku,
      }
    );

  await waitForMediaReady(
    admin,
    createdMedia.id
  );

  console.log(
    "[IMAGE IMPORT] New product media created:",
    {
      sku,

      mediaId:
        createdMedia.id,

      productId,
    }
  );

  return {
    media:
      createdMedia,

    created:
      true,

    updated:
      false,

    action:
      "created",
  };
}

// ======================================================
// UPDATE EXISTING MEDIA USING fileUpdate
// ======================================================

async function updateExistingMedia(
  admin,
  {
    mediaId,
    resourceUrl,
    alt,
  }
) {
  const response =
    await admin.graphql(
      `#graphql
      mutation UpdateExistingImage(
        $files: [FileUpdateInput!]!
      ) {
        fileUpdate(
          files: $files
        ) {
          files {
            id
            alt
            fileStatus
            ... on MediaImage {
              status
            }
          }

          userErrors {
            field
            message
            code
          }
        }
      }
      `,
      {
        variables: {
          files: [
            {
              id:
                mediaId,

              originalSource:
                resourceUrl,

              alt,
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
      ?.fileUpdate;

  if (
    result?.userErrors?.length
  ) {
    throw new Error(
      result.userErrors
        .map(
          (
            error
          ) =>
            `${
              error.code
                ? `[${error.code}] `
                : ""
            }${error.message}`
        )
        .join("; ")
    );
  }

  const updated =
    result?.files?.[0];

  if (
    !updated?.id
  ) {
    throw new Error(
      `Shopify did not return the updated media "${mediaId}".`
    );
  }

  return updated;
}

// ======================================================
// CREATE NEW PRODUCT MEDIA
// ======================================================
//
// Uses productUpdate because productCreateMedia is
// deprecated in the current Admin API.
//
// productUpdate returns the updated product. We then
// query product media and identify the newest media
// with the requested SKU in ALT.
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

  if (
    !result?.product?.id
  ) {
    throw new Error(
      "Shopify did not return the product after creating media."
    );
  }

  // ----------------------------------------------------
  // Shopify media creation is asynchronous.
  // Poll product media until the new SKU media appears.
  // ----------------------------------------------------

  const media =
    await waitForNewProductMedia(
      admin,
      {
        productId,

        alt,
      }
    );

  return media;
}

// ======================================================
// WAIT FOR NEW PRODUCT MEDIA
// ======================================================

async function waitForNewProductMedia(
  admin,
  {
    productId,
    alt,
  }
) {
  const startedAt =
    Date.now();

  while (
    Date.now() -
      startedAt <
    MEDIA_READY_TIMEOUT
  ) {
    const media =
      await getAllProductMedia(
        admin,
        productId
      );

    const normalizedAlt =
      normalizeSku(
        alt
      );

    const matching =
      media
        .filter(
          (
            item
          ) =>
            item.mediaContentType ===
              "IMAGE" &&
            normalizeSku(
              item.alt
            ) ===
              normalizedAlt
        )
        .sort(
          (
            a,
            b
          ) =>
            new Date(
              b.createdAt || 0
            ).getTime() -
            new Date(
              a.createdAt || 0
            ).getTime()
        );

    if (
      matching.length
    ) {
      const newest =
        matching[0];

      if (
        newest.status ===
          "FAILED" ||
        newest.fileStatus ===
          "FAILED"
      ) {
        throw new Error(
          `Shopify failed to process media for SKU "${alt}".`
        );
      }

      return newest;
    }

    await sleep(
      MEDIA_POLL_INTERVAL
    );
  }

  throw new Error(
    `Shopify created the product update but the new media could not be located for SKU "${alt}".`
  );
}

// ======================================================
// GET ALL PRODUCT MEDIA
// ======================================================

async function getAllProductMedia(
  admin,
  productId
) {
  const results =
    [];

  let cursor =
    null;

  while (true) {
    const response =
      await admin.graphql(
        `#graphql
        query ProductMediaList(
          $id: ID!
          $cursor: String
        ) {
          product(
            id: $id
          ) {
            id

            media(
              first: 250
              after: $cursor
            ) {
              nodes {
                id
                alt
                mediaContentType
                status
                createdAt
                updatedAt

                ... on MediaImage {
                  fileStatus
                }
              }

              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        `,
        {
          variables: {
            id:
              productId,

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

    const product =
      json.data?.product;

    if (!product) {
      throw new Error(
        `Shopify product ${productId} could not be found.`
      );
    }

    const connection =
      product.media;

    results.push(
      ...(connection?.nodes ||
        [])
    );

    if (
      !connection?.pageInfo
        ?.hasNextPage
    ) {
      break;
    }

    cursor =
      connection.pageInfo
        .endCursor;
  }

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

  const mediaUsage =
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

              media(
                first: 250
              ) {
                nodes {
                  id
                  alt
                  mediaContentType
                  status

                  ... on MediaImage {
                    fileStatus
                  }
                }
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

      const variantMedia =
        variant.media
          ?.nodes ||
        [];

      // ------------------------------------------------
      // Track which variants use each media ID.
      // ------------------------------------------------

      for (
        const media of
          variantMedia
      ) {
        if (
          !mediaUsage.has(
            media.id
          )
        ) {
          mediaUsage.set(
            media.id,
            new Set()
          );
        }

        mediaUsage
          .get(
            media.id
          )
          .add(
            variant.id
          );
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

          media:
            variantMedia,
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

  console.log(
    "[IMAGE IMPORT] Shopify media usage map:",
    mediaUsage.size
  );

  return {
    map,

    mediaUsage,
  };
}

// ======================================================
// CHECK IF MEDIA IS USED BY ANOTHER VARIANT
// ======================================================

function isMediaUsedByAnotherVariant(
  mediaUsage,
  mediaId,
  currentVariantId
) {
  const users =
    mediaUsage.get(
      mediaId
    );

  if (!users) {
    return false;
  }

  for (
    const variantId of
      users
  ) {
    if (
      variantId !==
      currentVariantId
    ) {
      return true;
    }
  }

  return false;
}

// ======================================================
// ENSURE VARIANT HAS TARGET MEDIA
// ======================================================

async function ensureVariantHasOnlyTargetMedia(
  admin,
  {
    productId,
    variantId,
    targetMediaId,
    sku,
  }
) {
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
        `[IMAGE IMPORT] Variant assignment ${attempt}/${ASSIGN_MAX_RETRIES}:`,
        {
          sku,

          productId,

          variantId,

          targetMediaId,
        }
      );

      const variant =
        await getVariantMedia(
          admin,
          variantId
        );

      if (!variant) {
        throw new Error(
          `Shopify variant ${variantId} could not be found.`
        );
      }

      const currentMedia =
        variant.media
          ?.nodes ||
        [];

      const currentMediaIds =
        uniqueIds(
          currentMedia.map(
            (
              media
            ) =>
              media.id
          )
        );

      // ------------------------------------------------
      // Already correct.
      // ------------------------------------------------

      if (
        currentMediaIds.includes(
          targetMediaId
        )
      ) {
        console.log(
          "[IMAGE IMPORT] Target media is already assigned:",
          {
            sku,

            variantId,

            mediaId:
              targetMediaId,
          }
        );

        return true;
      }

      // ------------------------------------------------
      // IMPORTANT:
      //
      // Shopify can reject append when a variant
      // already has media.
      //
      // Detach existing media first.
      // ------------------------------------------------

      if (
        currentMediaIds.length
      ) {
        console.log(
          "[IMAGE IMPORT] Existing variant media detected. Detaching before assignment:",
          {
            sku,

            variantId,

            existingMedia:
              currentMediaIds,

            targetMedia:
              targetMediaId,
          }
        );

        await detachVariantMedia(
          admin,
          {
            productId,

            variantId,

            mediaIds:
              currentMediaIds,
          }
        );

        await waitForVariantMediaDetached(
          admin,
          {
            variantId,

            mediaIds:
              currentMediaIds,
          }
        );
      }

      // ------------------------------------------------
      // Append ONLY the target media.
      // ------------------------------------------------

      await appendVariantMedia(
        admin,
        {
          productId,

          variantId,

          mediaId:
            targetMediaId,
        }
      );

      // ------------------------------------------------
      // Verify.
      // ------------------------------------------------

      const verified =
        await waitForVariantMediaAssignment(
          admin,
          {
            variantId,

            mediaId:
              targetMediaId,
          }
        );

      if (
        verified
      ) {
        console.log(
          "[IMAGE IMPORT] Variant assignment successful:",
          {
            sku,

            variantId,

            mediaId:
              targetMediaId,
          }
        );

        return true;
      }

      throw new Error(
        `Shopify accepted the media assignment but variant ${variantId} does not yet show media ${targetMediaId}.`
      );
    } catch (
      error
    ) {
      lastError =
        error;

      console.error(
        "[IMAGE IMPORT] Assignment attempt failed:",
        {
          sku,

          productId,

          variantId,

          targetMediaId,

          attempt,

          error:
            error?.message,
        }
      );

      // ------------------------------------------------
      // If Shopify says the variant already has media,
      // re-read the variant and retry the detach/append
      // sequence.
      // ------------------------------------------------

      if (
        isVariantAlreadyHasMediaError(
          error
        )
      ) {
        console.warn(
          "[IMAGE IMPORT] Shopify reports that the variant already has media. Retrying with a fresh variant state."
        );
      }
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
      `Unable to assign media ${targetMediaId} to variant ${variantId}.`
    )
  );
}

// ======================================================
// GET VARIANT MEDIA
// ======================================================

async function getVariantMedia(
  admin,
  variantId
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
              alt
              mediaContentType
              status

              ... on MediaImage {
                fileStatus
              }
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

  return (
    json.data
      ?.productVariant ||
    null
  );
}

// ======================================================
// DETACH VARIANT MEDIA
// ======================================================

async function detachVariantMedia(
  admin,
  {
    productId,
    variantId,
    mediaIds,
  }
) {
  if (
    !mediaIds?.length
  ) {
    return;
  }

  const response =
    await admin.graphql(
      `#graphql
      mutation ProductVariantDetachMedia(
        $productId: ID!
        $variantMedia: [ProductVariantDetachMediaInput!]!
      ) {
        productVariantDetachMedia(
          productId: $productId
          variantMedia: $variantMedia
        ) {
          product {
            id
          }

          productVariants {
            id
          }

          userErrors {
            field
            message
            code
          }
        }
      }
      `,
      {
        variables: {
          productId,

          variantMedia: [
            {
              variantId,

              mediaIds:
                uniqueIds(
                  mediaIds
                ),
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
      ?.productVariantDetachMedia;

  if (
    result?.userErrors?.length
  ) {
    throw new Error(
      result.userErrors
        .map(
          (
            error
          ) =>
            `${
              error.code
                ? `[${error.code}] `
                : ""
            }${error.message}`
        )
        .join("; ")
    );
  }

  if (
    !result?.product?.id
  ) {
    throw new Error(
      "Shopify did not confirm the variant media detach operation."
    );
  }

  console.log(
    "[IMAGE IMPORT] Variant media detached:",
    {
      productId,

      variantId,

      mediaIds,
    }
  );
}

// ======================================================
// APPEND VARIANT MEDIA
// ======================================================

async function appendVariantMedia(
  admin,
  {
    productId,
    variantId,
    mediaId,
  }
) {
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

          productVariants {
            id
          }

          userErrors {
            field
            message
            code
          }
        }
      }
      `,
      {
        variables: {
          productId,

          variantMedia: [
            {
              variantId,

              mediaIds: [
                mediaId,
              ],
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
      ?.productVariantAppendMedia;

  if (
    !result
  ) {
    throw new Error(
      "Shopify returned no productVariantAppendMedia response."
    );
  }

  if (
    result.userErrors?.length
  ) {
    throw new Error(
      result.userErrors
        .map(
          (
            error
          ) =>
            `${
              error.code
                ? `[${error.code}] `
                : ""
            }${error.message}`
        )
        .join("; ")
    );
  }

  if (
    !result.product?.id
  ) {
    throw new Error(
      "Shopify did not confirm the product after variant media assignment."
    );
  }

  console.log(
    "[IMAGE IMPORT] Variant media appended:",
    {
      productId,

      variantId,

      mediaId,
    }
  );
}

// ======================================================
// WAIT FOR VARIANT MEDIA ASSIGNMENT
// ======================================================

async function waitForVariantMediaAssignment(
  admin,
  {
    variantId,
    mediaId,
  }
) {
  const startedAt =
    Date.now();

  while (
    Date.now() -
      startedAt <
    MEDIA_READY_TIMEOUT
  ) {
    const variant =
      await getVariantMedia(
        admin,
        variantId
      );

    if (!variant) {
      throw new Error(
        `Shopify variant ${variantId} could not be found during verification.`
      );
    }

    const media =
      variant.media
        ?.nodes ||
      [];

    if (
      media.some(
        (
          item
        ) =>
          item.id ===
          mediaId
      )
    ) {
      return true;
    }

    await sleep(
      MEDIA_POLL_INTERVAL
    );
  }

  return false;
}

// ======================================================
// WAIT UNTIL MEDIA IS DETACHED
// ======================================================

async function waitForVariantMediaDetached(
  admin,
  {
    variantId,
    mediaIds,
  }
) {
  const startedAt =
    Date.now();

  const ids =
    new Set(
      mediaIds
    );

  while (
    Date.now() -
      startedAt <
    MEDIA_READY_TIMEOUT
  ) {
    const variant =
      await getVariantMedia(
        admin,
        variantId
      );

    if (!variant) {
      throw new Error(
        `Shopify variant ${variantId} could not be found while verifying media removal.`
      );
    }

    const current =
      variant.media
        ?.nodes ||
      [];

    const stillAttached =
      current.some(
        (
          item
        ) =>
          ids.has(
            item.id
          )
      );

    if (
      !stillAttached
    ) {
      return true;
    }

    await sleep(
      MEDIA_POLL_INTERVAL
    );
  }

  throw new Error(
    `Shopify did not remove the previous media from variant ${variantId}.`
  );
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
            id

            ... on MediaImage {
              id
              status
              fileStatus
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

        fileStatus:
          media.fileStatus,
      }
    );

    if (
      media.status ===
        "READY" ||
      media.fileStatus ===
        "READY"
    ) {
      return true;
    }

    if (
      media.status ===
        "FAILED" ||
      media.fileStatus ===
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

  if (
    !target.resourceUrl
  ) {
    throw new Error(
      "Shopify did not return a staged resource URL."
    );
  }

  return target.resourceUrl;
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

  saveImportHistory(
    job
  ).catch(
    (
      error
    ) =>
      console.error(
        "[IMAGE IMPORT] History save error:",
        error
      )
  );

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

  let nextIndex =
    0;

  async function runner() {
    while (
      true
    ) {
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
// UNIQUE IDS
// ======================================================

function uniqueIds(
  ids
) {
  return Array.from(
    new Set(
      (ids || []).filter(
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
// SHOPIFY ALREADY HAS MEDIA ERROR
// ======================================================

function isVariantAlreadyHasMediaError(
  error
) {
  const message =
    String(
      error?.message ||
        ""
    ).toLowerCase();

  return (
    message.includes(
      "already has media"
    ) ||
    message.includes(
      "product_variant_already_has_media"
    )
  );
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

// ======================================================
// HISTORY
// ======================================================

async function saveImportHistory(
  job
) {
  try {
    await db.importHistory.create({
      data: {
        shop:
          job.shop,

        driveUrl:
          job.driveUrl ||
          "",

        status:
          job.status,

        startedAt:
          new Date(
            job.startedAt
          ),

        completedAt:
          job.completedAt
            ? new Date(
                job.completedAt
              )
            : null,

        imagesFound:
          job.summary
            ?.imagesFound ||
          0,

        variantsMatched:
          job.summary
            ?.variantsMatched ||
          0,

        imagesUploaded:
          job.summary
            ?.imagesUploaded ||
          0,

        imagesAssigned:
          job.summary
            ?.imagesAssigned ||
          0,

        skuNotFound:
          job.summary
            ?.skuNotFound ||
          0,

        errors:
          job.summary
            ?.errors ||
          0,

        message:
          job.message ||
          null,

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
  } catch (
    error
  ) {
    console.error(
      "[IMAGE IMPORT] Failed to save history:",
      error
    );
  }
}