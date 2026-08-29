import { useEffect, useRef, useState } from "react";
import { useFetcher, useNavigate } from "react-router";

import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const CLEAR_VALUE = "__CLEAR__";

/*
 * Number of PRODUCT GROUPS processed per HTTP request.
 *
 * productVariantsBulkUpdate can update multiple variants,
 * but all variants in one mutation must belong to the same
 * product.
 */
const PRODUCT_BATCH_SIZE = 10;

const PRODUCT_ID_HEADERS = [
  "product id",
  "productid",
  "product gid",
  "product_id",
  "id",
];

const VARIANT_ID_HEADERS = [
  "variant id",
  "variantid",
  "variant gid",
  "variant_id",
];

/*
 * ============================================================
 * BASIC HELPERS
 * ============================================================
 */

function toGid(value, resourceType) {
  if (!value) {
    return "";
  }

  let cleaned = String(value)
    .trim()
    .replace(/^'/, "");

  if (!cleaned) {
    return "";
  }

  if (cleaned.startsWith("gid://shopify/")) {
    return cleaned;
  }

  return `gid://shopify/${resourceType}/${cleaned}`;
}

function normalizeHeader(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasValue(value) {
  return (
    value !== undefined &&
    value !== null &&
    String(value).trim() !== ""
  );
}

function isClearValue(value) {
  return (
    String(value || "")
      .trim()
      .toUpperCase() === CLEAR_VALUE
  );
}

function parseNumber(value, fieldName, rowNumber) {
  if (!hasValue(value)) {
    return undefined;
  }

  if (isClearValue(value)) {
    return null;
  }

  const cleaned = String(value)
    .trim()
    .replace(/,/g, "");

  const number = Number(cleaned);

  if (!Number.isFinite(number)) {
    throw new Error(
      `Row ${rowNumber}: "${fieldName}" must be a valid number.`
    );
  }

  return number;
}

function parseBoolean(value, fieldName, rowNumber) {
  if (!hasValue(value)) {
    return undefined;
  }

  if (isClearValue(value)) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .toLowerCase();

  if (["true", "yes", "1", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "no", "0", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `Row ${rowNumber}: "${fieldName}" must be TRUE/FALSE, YES/NO, or 1/0.`
  );
}

function parseString(value) {
  if (!hasValue(value)) {
    return undefined;
  }

  if (isClearValue(value)) {
    return null;
  }

  return String(value).trim();
}

function parseTags(value) {
  if (!hasValue(value)) {
    return undefined;
  }

  if (isClearValue(value)) {
    return [];
  }

  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseImageUrls(value) {
  if (!hasValue(value)) {
    return undefined;
  }

  if (isClearValue(value)) {
    return [];
  }

  return String(value)
    .split(/\||\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function normalizeWeightUnit(value) {
  if (!hasValue(value)) {
    return undefined;
  }

  const normalized = String(value)
    .trim()
    .toUpperCase();

  const aliases = {
    G: "GRAMS",
    GRAM: "GRAMS",
    GRAMS: "GRAMS",

    KG: "KILOGRAMS",
    KILO: "KILOGRAMS",
    KILOGRAM: "KILOGRAMS",
    KILOGRAMS: "KILOGRAMS",

    LB: "POUNDS",
    LBS: "POUNDS",
    POUND: "POUNDS",
    POUNDS: "POUNDS",

    OZ: "OUNCES",
    OUNCE: "OUNCES",
    OUNCES: "OUNCES",
  };

  return aliases[normalized] || null;
}

/*
 * ============================================================
 * CSV PARSER
 * ============================================================
 */

function parseCsv(csvText) {
  const rows = [];

  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < csvText.length; index++) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        cell += '"';
        index++;
        continue;
      }

      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (
      (char === "\n" || char === "\r") &&
      !insideQuotes
    ) {
      if (char === "\r" && nextChar === "\n") {
        index++;
      }

      row.push(cell);
      cell = "";

      if (
        row.some(
          (value) =>
            String(value).trim() !== ""
        )
      ) {
        rows.push(row);
      }

      row = [];
      continue;
    }

    cell += char;
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);

    if (
      row.some(
        (value) =>
          String(value).trim() !== ""
      )
    ) {
      rows.push(row);
    }
  }

  return rows;
}

/*
 * ============================================================
 * GOOGLE SHEET
 * ============================================================
 */

function getGoogleSheetCsvUrl(sheetUrl) {
  const parsedUrl = new URL(sheetUrl);

  if (
    parsedUrl.hostname !== "docs.google.com" &&
    !parsedUrl.hostname.endsWith(".docs.google.com")
  ) {
    throw new Error(
      "The URL must be a Google Sheets URL."
    );
  }

  const match = parsedUrl.pathname.match(
    /\/spreadsheets\/d\/([^/]+)/
  );

  if (!match) {
    throw new Error(
      "Could not determine the Google Sheet ID from the URL."
    );
  }

  const spreadsheetId = match[1];

  let gid = parsedUrl.searchParams.get("gid");

  if (!gid && parsedUrl.hash) {
    const hashParams = new URLSearchParams(
      parsedUrl.hash.replace(/^#/, "")
    );

    gid = hashParams.get("gid");
  }

  const exportUrl = new URL(
    `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export`
  );

  exportUrl.searchParams.set("format", "csv");

  if (gid) {
    exportUrl.searchParams.set("gid", gid);
  }

  return exportUrl.toString();
}

/*
 * ============================================================
 * GRAPHQL
 * ============================================================
 */

async function executeGraphQL(
  admin,
  query,
  variables = {}
) {
  const response = await admin.graphql(
    query,
    {
      variables,
    }
  );

  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(
      json.errors
        .map((error) => error.message)
        .join("; ")
    );
  }

  return json.data;
}

/*
 * ============================================================
 * HEADER HELPERS
 * ============================================================
 */

function findHeader(headers, aliases) {
  const normalizedAliases = aliases.map(
    normalizeHeader
  );

  for (const header of headers) {
    if (
      normalizedAliases.includes(
        normalizeHeader(header)
      )
    ) {
      return header;
    }
  }

  return null;
}

function getCell(row, headers, aliases) {
  const header = findHeader(
    headers,
    aliases
  );

  if (!header) {
    return undefined;
  }

  const index = headers.indexOf(header);

  return row[index];
}

/*
 * ============================================================
 * METAFIELD HEADER PARSER
 * ============================================================
 */

function parseMetafieldHeaders(
  headers,
  prefix
) {
  const result = [];

  const regex = new RegExp(
    `^${prefix}:\\s*([^\\.\\s]+)\\.([^\\s\\[]+)\\s*\\[([^\\]]+)\\]$`,
    "i"
  );

  headers.forEach((header) => {
    const match = header
      .trim()
      .match(regex);

    if (!match) {
      return;
    }

    result.push({
      header,
      namespace: match[1].trim(),
      key: match[2].trim(),
      type: match[3].trim(),
    });
  });

  return result;
}

/*
 * ============================================================
 * VARIANT INPUT
 * ============================================================
 */

function buildVariantInput({
  row,
  headers,
  rowNumber,
  variantMetafieldHeaders,
  defaultWeightUnit,
}) {
  const variantId = getCell(
    row,
    headers,
    VARIANT_ID_HEADERS
  );

  if (!hasValue(variantId)) {
    throw new Error(
      `Row ${rowNumber}: Variant ID is required.`
    );
  }

  const variant = {
    id: toGid(
      variantId,
      "ProductVariant"
    ),
  };

  /*
   * PRICE
   */

  const price = parseNumber(
    getCell(
      row,
      headers,
      ["Variant Price"]
    ),
    "Variant Price",
    rowNumber
  );

  if (price !== undefined) {
    if (price === null) {
      throw new Error(
        `Row ${rowNumber}: Variant Price cannot be cleared.`
      );
    }

    variant.price = price.toString();
  }

  /*
   * COMPARE AT PRICE
   */

  const compareAtPrice = parseNumber(
    getCell(
      row,
      headers,
      [
        "Variant Compare At Price",
        "Variant Compare-at Price",
        "Compare At Price",
      ]
    ),
    "Variant Compare At Price",
    rowNumber
  );

  if (compareAtPrice !== undefined) {
    variant.compareAtPrice =
      compareAtPrice === null
        ? null
        : compareAtPrice.toString();
  }

  /*
   * BARCODE
   */

  const barcode = parseString(
    getCell(
      row,
      headers,
      [
        "Variant Barcode",
        "Barcode",
      ]
    )
  );

  if (barcode !== undefined) {
    variant.barcode = barcode;
  }

  /*
   * INVENTORY ITEM
   */

  const inventoryItem = {};
  let hasInventoryItemData = false;

  /*
   * SKU
   */

  const sku = parseString(
    getCell(
      row,
      headers,
      [
        "Variant SKU",
        "SKU",
      ]
    )
  );

  if (sku !== undefined) {
    inventoryItem.sku = sku;
    hasInventoryItemData = true;
  }

  /*
   * COST
   */

  const cost = parseNumber(
    getCell(
      row,
      headers,
      [
        "Variant Cost",
        "Inventory Cost",
      ]
    ),
    "Variant Cost",
    rowNumber
  );

  if (cost !== undefined) {
    inventoryItem.cost =
      cost === null
        ? null
        : cost.toString();

    hasInventoryItemData = true;
  }

  /*
   * REQUIRES SHIPPING
   */

  const requiresShipping = parseBoolean(
    getCell(
      row,
      headers,
      [
        "Variant Requires Shipping",
        "Requires Shipping",
      ]
    ),
    "Variant Requires Shipping",
    rowNumber
  );

  if (requiresShipping !== undefined) {
    inventoryItem.requiresShipping =
      requiresShipping;

    hasInventoryItemData = true;
  }

  /*
   * TRACKED
   */

  const tracked = parseBoolean(
    getCell(
      row,
      headers,
      [
        "Variant Tracked",
        "Inventory Tracked",
        "Tracked",
      ]
    ),
    "Variant Tracked",
    rowNumber
  );

  if (tracked !== undefined) {
    inventoryItem.tracked = tracked;
    hasInventoryItemData = true;
  }

  /*
   * COUNTRY
   */

  const countryCode = parseString(
    getCell(
      row,
      headers,
      [
        "Variant Country Code",
        "Variant Country of Origin",
        "Country Code of Origin",
      ]
    )
  );

  if (countryCode !== undefined) {
    inventoryItem.countryCodeOfOrigin =
      countryCode;

    hasInventoryItemData = true;
  }

  /*
   * PROVINCE
   */

  const provinceCode = parseString(
    getCell(
      row,
      headers,
      [
        "Variant Province Code",
        "Variant Province of Origin",
        "Province Code of Origin",
      ]
    )
  );

  if (provinceCode !== undefined) {
    inventoryItem.provinceCodeOfOrigin =
      provinceCode;

    hasInventoryItemData = true;
  }

  /*
   * HS CODE
   */

  const harmonizedSystemCode =
    parseString(
      getCell(
        row,
        headers,
        [
          "Variant HS Code",
          "Variant Harmonized System Code",
          "Harmonized System Code",
        ]
      )
    );

  if (
    harmonizedSystemCode !==
    undefined
  ) {
    inventoryItem.harmonizedSystemCode =
      harmonizedSystemCode;

    hasInventoryItemData = true;
  }

  /*
   * WEIGHT
   */

  const weight = parseNumber(
    getCell(
      row,
      headers,
      [
        "Variant Weight",
        "Weight",
      ]
    ),
    "Variant Weight",
    rowNumber
  );

  const weightUnitCell = getCell(
    row,
    headers,
    [
      "Variant Weight Unit",
      "Weight Unit",
    ]
  );

  let weightUnit =
    normalizeWeightUnit(
      weightUnitCell
    );

  if (weightUnit === null) {
    throw new Error(
      `Row ${rowNumber}: Invalid Variant Weight Unit. Use GRAMS, KILOGRAMS, POUNDS, or OUNCES.`
    );
  }

  if (weight !== undefined) {
    if (weight === null) {
      throw new Error(
        `Row ${rowNumber}: Variant Weight cannot be cleared.`
      );
    }

    weightUnit =
      weightUnit ||
      defaultWeightUnit ||
      "KILOGRAMS";

    inventoryItem.measurement = {
      weight: {
        value: weight,
        unit: weightUnit,
      },
    };

    hasInventoryItemData = true;
  }

  if (hasInventoryItemData) {
    variant.inventoryItem =
      inventoryItem;
  }

  /*
   * INVENTORY POLICY
   */

  const inventoryPolicy = parseString(
    getCell(
      row,
      headers,
      [
        "Variant Inventory Policy",
        "Inventory Policy",
      ]
    )
  );

  if (inventoryPolicy !== undefined) {
    const normalized =
      String(
        inventoryPolicy
      ).toUpperCase();

    if (
      !["CONTINUE", "DENY"].includes(
        normalized
      )
    ) {
      throw new Error(
        `Row ${rowNumber}: Variant Inventory Policy must be CONTINUE or DENY.`
      );
    }

    variant.inventoryPolicy =
      normalized;
  }

  /*
   * TAXABLE
   */

  const taxable = parseBoolean(
    getCell(
      row,
      headers,
      [
        "Variant Taxable",
        "Taxable",
      ]
    ),
    "Variant Taxable",
    rowNumber
  );

  if (taxable !== undefined) {
    variant.taxable = taxable;
  }

  /*
   * TAX CODE
   */

  const taxCode = parseString(
    getCell(
      row,
      headers,
      [
        "Variant Tax Code",
        "Tax Code",
      ]
    )
  );

  if (taxCode !== undefined) {
    variant.taxCode = taxCode;
  }

  /*
   * REQUIRES COMPONENTS
   */

  const requiresComponents =
    parseBoolean(
      getCell(
        row,
        headers,
        [
          "Variant Requires Components",
          "Requires Components",
        ]
      ),
      "Variant Requires Components",
      rowNumber
    );

  if (
    requiresComponents !==
    undefined
  ) {
    variant.requiresComponents =
      requiresComponents;
  }

  /*
   * SHOW UNIT PRICE
   */

  const showUnitPrice =
    parseBoolean(
      getCell(
        row,
        headers,
        [
          "Variant Show Unit Price",
          "Show Unit Price",
        ]
      ),
      "Variant Show Unit Price",
      rowNumber
    );

  if (
    showUnitPrice !==
    undefined
  ) {
    variant.showUnitPrice =
      showUnitPrice;
  }

  /*
   * ==========================================================
   * IMAGE
   * ==========================================================
   */

  const imageUrls =
    parseImageUrls(
      getCell(
        row,
        headers,
        [
          "Variant Image Src",
          "Variant Image URL",
          "Image URL",
        ]
      )
    );

  if (
    imageUrls !== undefined
  ) {
    variant.mediaSrc = imageUrls;
  }

  /*
   * VARIANT METAFIELDS
   */

  const metafields = [];

  for (
    const metafieldHeader of
      variantMetafieldHeaders
  ) {
    const value = getCell(
      row,
      headers,
      [
        metafieldHeader.header,
      ]
    );

    if (!hasValue(value)) {
      continue;
    }

    metafields.push({
      namespace:
        metafieldHeader.namespace,
      key:
        metafieldHeader.key,
      type:
        metafieldHeader.type,
      value: isClearValue(value)
        ? ""
        : String(value).trim(),
    });
  }

  if (metafields.length) {
    variant.metafields =
      metafields;
  }

  return variant;
}

/*
 * ============================================================
 * PRODUCT INPUT
 * ============================================================
 */

function buildProductInput({
  row,
  headers,
  productId,
  productMetafieldHeaders,
}) {
  const product = {
    id: productId,
  };

  let hasChanges = false;

  const title = parseString(
    getCell(
      row,
      headers,
      ["Product Title"]
    )
  );

  if (title !== undefined) {
    if (title === null) {
      throw new Error(
        "Product Title cannot be cleared."
      );
    }

    product.title = title;
    hasChanges = true;
  }

  const handle = parseString(
    getCell(
      row,
      headers,
      [
        "Product Handle",
        "Handle",
      ]
    )
  );

  if (handle !== undefined) {
    if (handle === null) {
      throw new Error(
        "Product Handle cannot be cleared."
      );
    }

    product.handle = handle;
    hasChanges = true;
  }

  const vendor = parseString(
    getCell(
      row,
      headers,
      [
        "Product Vendor",
        "Vendor",
      ]
    )
  );

  if (vendor !== undefined) {
    product.vendor = vendor;
    hasChanges = true;
  }

  const productType = parseString(
    getCell(
      row,
      headers,
      ["Product Type"]
    )
  );

  if (productType !== undefined) {
    product.productType =
      productType;

    hasChanges = true;
  }

  const status = parseString(
    getCell(
      row,
      headers,
      [
        "Product Status",
        "Status",
      ]
    )
  );

  if (status !== undefined) {
    if (status === null) {
      throw new Error(
        "Product Status cannot be cleared."
      );
    }

    const normalized =
      String(status).toUpperCase();

    if (
      ![
        "ACTIVE",
        "DRAFT",
        "ARCHIVED",
        "UNLISTED",
      ].includes(normalized)
    ) {
      throw new Error(
        `Product Status must be ACTIVE, DRAFT, ARCHIVED or UNLISTED.`
      );
    }

    product.status =
      normalized;

    hasChanges = true;
  }

  const tags = parseTags(
    getCell(
      row,
      headers,
      [
        "Product Tags",
        "Tags",
      ]
    )
  );

  if (tags !== undefined) {
    product.tags = tags;
    hasChanges = true;
  }

  const descriptionHtml =
    parseString(
      getCell(
        row,
        headers,
        [
          "Product Description HTML",
          "Description HTML",
        ]
      )
    );

  if (descriptionHtml !== undefined) {
    product.descriptionHtml =
      descriptionHtml;

    hasChanges = true;
  }

  const templateSuffix =
    parseString(
      getCell(
        row,
        headers,
        [
          "Product Template Suffix",
          "Template Suffix",
        ]
      )
    );

  if (templateSuffix !== undefined) {
    product.templateSuffix =
      templateSuffix;

    hasChanges = true;
  }

  const requiresSellingPlan =
    parseBoolean(
      getCell(
        row,
        headers,
        [
          "Product Requires Selling Plan",
          "Requires Selling Plan",
        ]
      ),
      "Product Requires Selling Plan",
      0
    );

  if (
    requiresSellingPlan !==
    undefined
  ) {
    product.requiresSellingPlan =
      requiresSellingPlan;

    hasChanges = true;
  }

  const category = parseString(
    getCell(
      row,
      headers,
      [
        "Product Category ID",
        "Category ID",
      ]
    )
  );

  if (category !== undefined) {
    product.category = category;
    hasChanges = true;
  }

  const seoTitle = parseString(
    getCell(
      row,
      headers,
      [
        "Product SEO Title",
        "SEO Title",
      ]
    )
  );

  const seoDescription =
    parseString(
      getCell(
        row,
        headers,
        [
          "Product SEO Description",
          "SEO Description",
        ]
      )
    );

  if (
    seoTitle !== undefined ||
    seoDescription !== undefined
  ) {
    product.seo = {};

    if (seoTitle !== undefined) {
      product.seo.title =
        seoTitle;
    }

    if (
      seoDescription !==
      undefined
    ) {
      product.seo.description =
        seoDescription;
    }

    hasChanges = true;
  }

  /*
   * PRODUCT METAFIELDS
   */

  const metafields = [];

  for (
    const metafieldHeader of
      productMetafieldHeaders
  ) {
    const value = getCell(
      row,
      headers,
      [
        metafieldHeader.header,
      ]
    );

    if (!hasValue(value)) {
      continue;
    }

    metafields.push({
      namespace:
        metafieldHeader.namespace,
      key:
        metafieldHeader.key,
      type:
        metafieldHeader.type,
      value: isClearValue(value)
        ? ""
        : String(value).trim(),
    });
  }

  if (metafields.length) {
    product.metafields =
      metafields;

    hasChanges = true;
  }

  return hasChanges
    ? product
    : null;
}

/*
 * ============================================================
 * FETCH + NORMALIZE SHEET
 * ============================================================
 */

async function loadSheet({
  sheetUrl,
  admin,
}) {
  const csvUrl =
    getGoogleSheetCsvUrl(
      sheetUrl
    );

  const sheetResponse =
    await fetch(
      csvUrl,
      {
        method: "GET",
        headers: {
          Accept:
            "text/csv,text/plain,*/*",
          "User-Agent":
            "Shopify Variant Bulk Update App",
        },
      }
    );

  if (!sheetResponse.ok) {
    throw new Error(
      `Google Sheets returned HTTP ${sheetResponse.status}.`
    );
  }

  const csvText =
    await sheetResponse.text();

  const trimmedCsv =
    csvText.trim();

  if (
    trimmedCsv.startsWith("<!DOCTYPE") ||
    trimmedCsv.startsWith("<html") ||
    trimmedCsv.includes("Sign in")
  ) {
    throw new Error(
      "Google Sheet could not be read. Please make the sheet accessible to anyone with the link."
    );
  }

  const csvRows =
    parseCsv(csvText);

  if (csvRows.length < 2) {
    throw new Error(
      "The Google Sheet does not contain any data rows."
    );
  }

  const headers =
    csvRows[0].map(
      (header) =>
        String(
          header || ""
        ).trim()
    );

  const dataRows =
    csvRows
      .slice(1)
      .filter(
        (row) =>
          row.some(
            (cell) =>
              String(
                cell || ""
              ).trim() !== ""
          )
      );

  if (!dataRows.length) {
    throw new Error(
      "The Google Sheet contains no update rows."
    );
  }

  const variantIdHeader =
    findHeader(
      headers,
      VARIANT_ID_HEADERS
    );

  if (!variantIdHeader) {
    throw new Error(
      'Missing required column: "Variant ID".'
    );
  }

  const productIdHeader =
    findHeader(
      headers,
      PRODUCT_ID_HEADERS
    );

  const productMetafieldHeaders =
    parseMetafieldHeaders(
      headers,
      "Product Metafield"
    );

  const variantMetafieldHeaders =
    parseMetafieldHeaders(
      headers,
      "Variant Metafield"
    );

  const hasWeightColumn =
    Boolean(
      findHeader(
        headers,
        [
          "Variant Weight",
          "Weight",
        ]
      )
    );

  let defaultWeightUnit =
    "KILOGRAMS";

  if (hasWeightColumn) {
    const shopData =
      await executeGraphQL(
        admin,
        `#graphql
          query GetShopWeightUnit {
            shop {
              weightUnit
            }
          }
        `
      );

    defaultWeightUnit =
      shopData.shop?.weightUnit ||
      "KILOGRAMS";
  }

  const errors = [];
  const normalizedRows = [];

  for (
    let index = 0;
    index < dataRows.length;
    index++
  ) {
    const row =
      dataRows[index];

    const rowNumber =
      index + 2;

    try {
      const rawVariantId =
        getCell(
          row,
          headers,
          VARIANT_ID_HEADERS
        );

      if (!hasValue(rawVariantId)) {
        throw new Error(
          `Row ${rowNumber}: Variant ID is required.`
        );
      }

      let productId;

      if (productIdHeader) {
        const rawProductId =
          getCell(
            row,
            headers,
            [
              productIdHeader,
            ]
          );

        if (hasValue(rawProductId)) {
          productId =
            toGid(
              rawProductId,
              "Product"
            );
        }
      }

      const variant =
        buildVariantInput({
          row,
          headers,
          rowNumber,
          variantMetafieldHeaders,
          defaultWeightUnit,
        });

      const product =
        productId
          ? buildProductInput({
              row,
              headers,
              productId,
              productMetafieldHeaders,
            })
          : null;

      normalizedRows.push({
        rowNumber,
        sourceRowIndex: index,
        productId,
        variant,
        product,
      });
    } catch (error) {
      errors.push({
        row: rowNumber,
        message:
          error?.message ||
          "Invalid row.",
      });
    }
  }

  /*
   * Resolve missing product IDs.
   */

  const missingProductRows =
    normalizedRows.filter(
      (item) =>
        !item.productId
    );

  if (
    missingProductRows.length
  ) {
    const variantIds =
      missingProductRows.map(
        (item) =>
          item.variant.id
      );

    for (
      let start = 0;
      start < variantIds.length;
      start += 100
    ) {
      const batch =
        variantIds.slice(
          start,
          start + 100
        );

      const lookupData =
        await executeGraphQL(
          admin,
          `#graphql
            query GetVariantProducts(
              $ids: [ID!]!
            ) {
              nodes(ids: $ids) {
                ... on ProductVariant {
                  id
                  product {
                    id
                  }
                }
              }
            }
          `,
          {
            ids: batch,
          }
        );

      const lookupMap =
        new Map();

      (
        lookupData.nodes || []
      ).forEach((node) => {
        if (
          node?.id &&
          node?.product?.id
        ) {
          lookupMap.set(
            node.id,
            node.product.id
          );
        }
      });

      missingProductRows.forEach(
        (item) => {
          if (
            !item.productId &&
            lookupMap.has(
              item.variant.id
            )
          ) {
            item.productId =
              lookupMap.get(
                item.variant.id
              );

            item.product =
              buildProductInput({
                row:
                  dataRows[
                    item.sourceRowIndex
                  ],
                headers,
                productId:
                  item.productId,
                productMetafieldHeaders,
              });
          }
        }
      );
    }
  }

  normalizedRows.forEach(
    (item) => {
      if (!item.productId) {
        errors.push({
          row:
            item.rowNumber,
          message:
            "Could not determine the Shopify Product ID for this Variant ID.",
        });
      }
    }
  );

  const validRows =
    normalizedRows.filter(
      (item) =>
        Boolean(
          item.productId
        )
    );

  /*
   * Group by product.
   */

  const productGroups =
    new Map();

  validRows.forEach(
    (item) => {
      if (
        !productGroups.has(
          item.productId
        )
      ) {
        productGroups.set(
          item.productId,
          []
        );
      }

      productGroups
        .get(item.productId)
        .push(item);
    }
  );

  return {
    headers,
    dataRows,
    validRows,
    productGroups,
    errors,
  };
}

/*
 * ============================================================
 * IMAGE URL HELPERS
 * ============================================================
 */

function getImageUrlsFromRows(
  rows
) {
  const urls = [];

  rows.forEach((row) => {
    const mediaSrc =
      row.variant?.mediaSrc;

    if (
      Array.isArray(mediaSrc)
    ) {
      mediaSrc.forEach((url) => {
        if (
          hasValue(url) &&
          !urls.includes(url)
        ) {
          urls.push(url);
        }
      });
    }
  });

  return urls;
}

/*
 * ============================================================
 * UPDATE ONE PRODUCT GROUP
 * ============================================================
 */

async function updateProductGroup({
  admin,
  productId,
  rows,
}) {
  const errors = [];

  let updatedVariants = 0;
  let updatedProducts = 0;
  let imagesSubmitted = 0;

  const uniqueVariants =
    Array.from(
      new Map(
        rows.map(
          (item) => [
            item.variant.id,
            item.variant,
          ]
        )
      ).values()
    );

  /*
   * MEDIA
   */

  const imageUrls =
    getImageUrlsFromRows(
      rows
    );

  const media =
    imageUrls.map(
      (url) => ({
        originalSource: url,
        mediaContentType:
          "IMAGE",
      })
    );

  imagesSubmitted =
    media.length;

  /*
   * VARIANT MUTATION
   */

  if (uniqueVariants.length) {
    try {
      const variantData =
        await executeGraphQL(
          admin,
          `#graphql
            mutation UpdateProductVariants(
              $productId: ID!
              $variants: [ProductVariantsBulkInput!]!
              $media: [CreateMediaInput!]
            ) {
              productVariantsBulkUpdate(
                productId: $productId
                variants: $variants
                media: $media
                allowPartialUpdates: true
              ) {
                product {
                  id

                  media(first: 100) {
                    nodes {
                      id
                      alt
                      mediaContentType

                      preview {
                        status
                      }
                    }
                  }
                }

                productVariants {
                  id

                  media(first: 20) {
                    nodes {
                      id
                      alt
                      mediaContentType

                      preview {
                        status
                      }
                    }
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
            productId,
            variants:
              uniqueVariants,
            media:
              media.length
                ? media
                : undefined,
          }
        );

      const payload =
        variantData
          .productVariantsBulkUpdate;

      if (
        payload.userErrors?.length
      ) {
        payload.userErrors.forEach(
          (error) => {
            const field =
              Array.isArray(
                error.field
              )
                ? error.field.join(".")
                : "";

            errors.push({
              row:
                rows[0]
                  ?.rowNumber ||
                "unknown",

              message:
                `Variant update error${field ? ` (${field})` : ""}: ${error.message}`,
            });
          }
        );
      }

      updatedVariants =
        payload
          .productVariants
          ?.length || 0;

      /*
       * IMAGE VERIFICATION
       */

      if (
        imageUrls.length &&
        payload.productVariants
      ) {
        const variantsWithMedia =
          payload.productVariants.filter(
            (variant) =>
              variant?.media?.nodes
                ?.length
          );

        if (
          variantsWithMedia.length === 0
        ) {
          errors.push({
            row:
              rows[0]
                ?.rowNumber ||
              "unknown",

            message:
              "Variant data was updated, but Shopify did not return attached variant media yet. The image may still be processing asynchronously.",

            warning: true,
          });
        }
      }
    } catch (error) {
      rows.forEach((row) => {
        errors.push({
          row: row.rowNumber,

          message:
            `Variant update failed: ${error.message}`,
        });
      });
    }
  }

  /*
   * PRODUCT UPDATE
   */

  const productChanges = {};

  rows.forEach((row) => {
    if (!row.product) {
      return;
    }

    Object.entries(
      row.product
    ).forEach(
      ([key, value]) => {
        if (key === "id") {
          return;
        }

        if (
          value === undefined ||
          value === null
        ) {
          return;
        }

        productChanges[key] =
          value;
      }
    );
  });

  if (
    Object.keys(productChanges)
      .length
  ) {
    productChanges.id =
      productId;

    try {
      const productData =
        await executeGraphQL(
          admin,
          `#graphql
            mutation UpdateProduct(
              $product: ProductUpdateInput!
            ) {
              productUpdate(
                product: $product
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
            product:
              productChanges,
          }
        );

      const payload =
        productData.productUpdate;

      if (
        payload.userErrors?.length
      ) {
        payload.userErrors.forEach(
          (error) => {
            errors.push({
              row:
                rows[0]
                  ?.rowNumber ||
                "unknown",

              message:
                `Product update error: ${error.message}`,
            });
          }
        );
      } else {
        updatedProducts = 1;
      }
    } catch (error) {
      rows.forEach((row) => {
        errors.push({
          row: row.rowNumber,

          message:
            `Product update failed: ${error.message}`,
        });
      });
    }
  }

  return {
    updatedVariants,
    updatedProducts,
    imagesSubmitted,
    errors,
  };
}

/*
 * ============================================================
 * ACTION
 * ============================================================
 */

export const action = async ({
  request,
}) => {
  try {
    const { admin } =
      await authenticate.admin(
        request
      );

    const formData =
      await request.formData();

    const sheetUrl =
      String(
        formData.get(
          "sheetUrl"
        ) || ""
      ).trim();

    const batchIndex =
      Math.max(
        0,
        Number(
          formData.get(
            "batchIndex"
          ) || 0
        )
      );

    if (!sheetUrl) {
      return Response.json(
        {
          ok: false,

          message:
            "Please enter your Google Sheets URL.",
        },

        {
          status: 400,
        }
      );
    }

    /*
     * Load + normalize sheet.
     */

    const sheet =
      await loadSheet({
        sheetUrl,
        admin,
      });

    const productGroups =
      Array.from(
        sheet.productGroups.entries()
      );

    const totalGroups =
      productGroups.length;

    const totalRows =
      sheet.validRows.length;

    if (!totalGroups) {
      return Response.json(
        {
          ok: false,

          message:
            "No rows could be matched to Shopify products.",

          errors:
            sheet.errors,
        },

        {
          status: 400,
        }
      );
    }

    /*
     * Determine current batch.
     */

    const start =
      batchIndex *
      PRODUCT_BATCH_SIZE;

    const end = Math.min(
      start +
        PRODUCT_BATCH_SIZE,
      totalGroups
    );

    const currentGroups =
      productGroups.slice(
        start,
        end
      );

    let updatedProducts = 0;
    let updatedVariants = 0;
    let imagesSubmitted = 0;

    const batchErrors = [];

    /*
     * PROCESS GROUPS SEQUENTIALLY
     */

    for (
      const [
        productId,
        rows,
      ] of currentGroups
    ) {
      const result =
        await updateProductGroup({
          admin,
          productId,
          rows,
        });

      updatedProducts +=
        result.updatedProducts;

      updatedVariants +=
        result.updatedVariants;

      imagesSubmitted +=
        result.imagesSubmitted;

      batchErrors.push(
        ...result.errors
      );
    }

    const processedGroups =
      end;

    const finished =
      processedGroups >=
      totalGroups;

    const progress =
      totalGroups
        ? Math.round(
            (processedGroups /
              totalGroups) *
              100
          )
        : 100;

    return Response.json({
      ok:
        finished &&
        !(
          sheet.errors.length ||
          batchErrors.length
        ),

      finished,

      message: finished
        ? (
            sheet.errors.length ||
            batchErrors.length
          )
          ? "The update completed with some errors."
          : "Google Sheet synchronization completed successfully."
        : `Batch ${batchIndex + 1} completed successfully.`,

      progress,

      batch: {
        index: batchIndex,
        start,
        end,
        size:
          currentGroups.length,
      },

      summary: {
        rowsRead:
          sheet.dataRows.length,

        validRows:
          totalRows,

        productGroups:
          totalGroups,

        processedGroups,

        productsUpdated:
          updatedProducts,

        variantsUpdated:
          updatedVariants,

        imagesSubmitted,

        errors:
          sheet.errors.length +
          batchErrors.length,
      },

      errors: [
        ...sheet.errors,
        ...batchErrors,
      ].slice(0, 500),
    });
  } catch (error) {
    console.error(
      "Google Sheet variant update error:",
      error
    );

    return Response.json(
      {
        ok: false,

        finished: true,

        message:
          error?.message ||
          "Unable to update Shopify variants.",
      },

      {
        status: 500,
      }
    );
  }
};

/*
 * ============================================================
 * COMPONENT
 * ============================================================
 */

export default function UpdateVariants() {
  const navigate =
    useNavigate();

  const fetcher =
    useFetcher();

  const [sheetUrl, setSheetUrl] =
    useState("");

  const [urlError, setUrlError] =
    useState("");

  const [isBulkRunning, setIsBulkRunning] =
    useState(false);

  const [progress, setProgress] =
    useState(0);

  const [batchNumber, setBatchNumber] =
    useState(0);

  const [finalResult, setFinalResult] =
    useState(null);

  /*
   * ----------------------------------------------------------
   * KEEP TRACK OF CURRENT RUN
   * ----------------------------------------------------------
   *
   * This prevents the same response from being processed
   * multiple times by useEffect.
   */

  const processedBatchRef =
    useRef(-1);

  /*
   * Accumulate results from all batches.
   */

  const accumulatedResultRef =
    useRef({
      rowsRead: 0,
      validRows: 0,
      productGroups: 0,
      processedGroups: 0,
      productsUpdated: 0,
      variantsUpdated: 0,
      imagesSubmitted: 0,
      errors: [],
    });

  /*
   * ----------------------------------------------------------
   * GOOGLE SHEET URL VALIDATION
   * ----------------------------------------------------------
   */

  const isValidGoogleSheetUrl =
    (value) => {
      if (!value) {
        return false;
      }

      try {
        const parsedUrl =
          new URL(value);

        return (
          parsedUrl.protocol ===
            "https:" &&
          (
            parsedUrl.hostname ===
              "docs.google.com" ||
            parsedUrl.hostname.endsWith(
              ".docs.google.com"
            )
          )
        );
      } catch {
        return false;
      }
    };

  /*
   * ----------------------------------------------------------
   * SUBMIT ONE BATCH
   * ----------------------------------------------------------
   */

  const submitBatch = (
    url,
    index
  ) => {
    setBatchNumber(index);

    fetcher.submit(
      {
        sheetUrl: url,
        batchIndex:
          String(index),
      },
      {
        method: "post",
      }
    );
  };

  /*
   * ----------------------------------------------------------
   * START UPDATE
   * ----------------------------------------------------------
   */

  const handleUpdateVariants =
    () => {
      const value =
        sheetUrl.trim();

      setUrlError("");
      setFinalResult(null);
      setProgress(0);
      setBatchNumber(0);

      /*
       * Reset batch tracking.
       */

      processedBatchRef.current =
        -1;

      accumulatedResultRef.current = {
        rowsRead: 0,
        validRows: 0,
        productGroups: 0,
        processedGroups: 0,
        productsUpdated: 0,
        variantsUpdated: 0,
        imagesSubmitted: 0,
        errors: [],
      };

      if (!value) {
        setUrlError(
          "Please enter your Google Sheets URL."
        );

        return;
      }

      if (
        !isValidGoogleSheetUrl(
          value
        )
      ) {
        setUrlError(
          "Please enter a valid Google Sheets URL."
        );

        return;
      }

      /*
       * Start bulk process.
       */

      setIsBulkRunning(true);

      submitBatch(
        value,
        0
      );
    };

  /*
   * ----------------------------------------------------------
   * HANDLE BATCH RESPONSES
   * ----------------------------------------------------------
   *
   * THIS IS THE IMPORTANT FIX.
   *
   * When fetcher.data arrives:
   *
   * 1. Update progress.
   * 2. Accumulate result.
   * 3. If finished -> stop loading.
   * 4. Otherwise -> submit next batch.
   */

  useEffect(() => {
    if (!isBulkRunning) {
      return;
    }

    const result =
      fetcher.data;

    if (!result) {
      return;
    }

    /*
     * Only process responses generated by our batch action.
     */

    if (!result.batch) {
      return;
    }

    const currentBatchIndex =
      Number(
        result.batch.index
      );

    /*
     * Prevent duplicate processing.
     */

    if (
      currentBatchIndex <=
      processedBatchRef.current
    ) {
      return;
    }

    /*
     * Do not process until request is idle.
     */

    if (
      fetcher.state !== "idle"
    ) {
      return;
    }

    processedBatchRef.current =
      currentBatchIndex;

    /*
     * Update progress.
     */

    setProgress(
      Number(
        result.progress || 0
      )
    );

    /*
     * Accumulate batch summary.
     */

    const currentSummary =
      result.summary || {};

    const accumulated =
      accumulatedResultRef.current;

    accumulated.rowsRead =
      Number(
        currentSummary.rowsRead ||
        accumulated.rowsRead
      );

    accumulated.validRows =
      Number(
        currentSummary.validRows ||
        accumulated.validRows
      );

    accumulated.productGroups =
      Number(
        currentSummary.productGroups ||
        accumulated.productGroups
      );

    accumulated.processedGroups =
      Number(
        currentSummary.processedGroups ||
        accumulated.processedGroups
      );

    accumulated.productsUpdated +=
      Number(
        currentSummary.productsUpdated ||
        0
      );

    accumulated.variantsUpdated +=
      Number(
        currentSummary.variantsUpdated ||
        0
      );

    accumulated.imagesSubmitted +=
      Number(
        currentSummary.imagesSubmitted ||
        0
      );

    /*
     * Add errors.
     *
     * Warnings are also preserved.
     */

    if (
      Array.isArray(
        result.errors
      ) &&
      result.errors.length
    ) {
      accumulated.errors.push(
        ...result.errors
      );
    }

    /*
     * --------------------------------------------------------
     * FINAL BATCH
     * --------------------------------------------------------
     */

    if (result.finished) {
      /*
       * IMPORTANT:
       *
       * This is what stops the buffering/loading UI.
       */

      setProgress(100);

      setFinalResult({
        ok:
          result.ok,

        finished: true,

        message:
          result.message,

        summary: {
          ...accumulated,

          errors:
            accumulated.errors.length,
        },

        errors:
          accumulated.errors.slice(
            0,
            500
          ),
      });

      /*
       * Stop the bulk process.
       */

      setIsBulkRunning(false);

      return;
    }

    /*
     * --------------------------------------------------------
     * NEXT BATCH
     * --------------------------------------------------------
     */

    const nextBatch =
      currentBatchIndex + 1;

    setBatchNumber(
      nextBatch
    );

    /*
     * Submit next batch only after current request has
     * completely finished.
     */

    submitBatch(
      sheetUrl.trim(),
      nextBatch
    );
  }, [
    fetcher.data,
    fetcher.state,
    isBulkRunning,
    sheetUrl,
  ]);

  /*
   * ----------------------------------------------------------
   * REQUEST STATUS
   * ----------------------------------------------------------
   */

  const isRequestRunning =
    fetcher.state !== "idle";

  /*
   * ----------------------------------------------------------
   * UI
   * ----------------------------------------------------------
   */

  return (
    <s-page
      heading="Update Variants"
      inline-size="large"
    >
      <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() =>
            navigate("/app/instructions")
        }
        disabled={isBulkRunning}
        >
        Instructions
        </s-button>

        <s-button
        slot="secondary-actions"
        variant="secondary"
        onClick={() =>
            navigate("/app")
        }
        disabled={isBulkRunning}
        >
        Back to Dashboard
        </s-button>

      <s-section>
        <s-stack
          direction="block"
          gap="base"
        >
          <s-heading>
            Bulk update Shopify variants
          </s-heading>

          <s-text color="subdued">
            Update Shopify variants and
            products directly from a Google
            Sheet.
          </s-text>

          <s-text color="subdued">
            Large sheets are processed in
            smaller batches to avoid one
            extremely long Shopify request.
          </s-text>
        </s-stack>
      </s-section>

      {/* ================================================== */}
      {/* GOOGLE SHEET */}
      {/* ================================================== */}

      <s-section heading="Google Sheet">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="base"
        >
          <s-stack
            direction="block"
            gap="base"
          >
            <s-heading>
              Enter your Google Sheet URL
            </s-heading>

            <s-text color="subdued">
              Set the Google Sheet to
              "Anyone with the link can view".
            </s-text>

            <s-text-field
              label="Google Sheet URL"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              disabled={
                isBulkRunning
              }
              onInput={(event) => {
                setSheetUrl(
                  event.currentTarget
                    .value
                );

                setUrlError("");
              }}
            />

            {urlError && (
              <s-text tone="critical">
                {urlError}
              </s-text>
            )}

            {/* ================================================= */}
            {/* PROGRESS */}
            {/* ================================================= */}

            {isBulkRunning && (
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack
                  direction="block"
                  gap="small"
                >
                  <s-heading>
                    Updating Shopify
                  </s-heading>

                  <s-text>
                    Progress:{" "}
                    {progress}%
                  </s-text>

                  <s-progress-bar
                    value={
                      progress
                    }
                  />

                  <s-text color="subdued">
                    Batch{" "}
                    {batchNumber + 1}
                    {" "}is being processed...
                  </s-text>

                  <s-text color="subdued">
                    Please keep this page open
                    until the update completes.
                  </s-text>
                </s-stack>
              </s-box>
            )}

            {/* ================================================= */}
            {/* RESULT */}
            {/* ================================================= */}

            {finalResult?.message && (
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack
                  direction="block"
                  gap="small"
                >
                  <s-text
                    tone={
                      finalResult.ok
                        ? "success"
                        : "critical"
                    }
                  >
                    {
                      finalResult.message
                    }
                  </s-text>

                  {finalResult.summary && (
                    <s-stack
                      direction="block"
                      gap="small"
                    >
                      <s-text>
                        Rows read:{" "}
                        {
                          finalResult
                            .summary
                            .rowsRead
                        }
                      </s-text>

                      <s-text>
                        Valid rows:{" "}
                        {
                          finalResult
                            .summary
                            .validRows
                        }
                      </s-text>

                      <s-text>
                        Product groups:{" "}
                        {
                          finalResult
                            .summary
                            .productGroups
                        }
                      </s-text>

                      <s-text>
                        Products updated:{" "}
                        {
                          finalResult
                            .summary
                            .productsUpdated
                        }
                      </s-text>

                      <s-text>
                        Variants updated:{" "}
                        {
                          finalResult
                            .summary
                            .variantsUpdated
                        }
                      </s-text>

                      <s-text>
                        Images submitted:{" "}
                        {
                          finalResult
                            .summary
                            .imagesSubmitted
                        }
                      </s-text>

                      <s-text>
                        Errors:{" "}
                        {
                          finalResult
                            .summary
                            .errors
                        }
                      </s-text>
                    </s-stack>
                  )}
                </s-stack>
              </s-box>
            )}

            {/* ================================================= */}
            {/* ERRORS */}
            {/* ================================================= */}

            {finalResult?.errors?.length >
              0 && (
              <s-box
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack
                  direction="block"
                  gap="small"
                >
                  <s-heading>
                    Update errors
                  </s-heading>

                  {finalResult.errors
                    .slice(0, 100)
                    .map(
                      (
                        error,
                        index
                      ) => (
                        <s-text
                          key={`${error.row}-${index}`}
                          tone={
                            error.warning
                              ? "caution"
                              : "critical"
                          }
                        >
                          Row{" "}
                          {
                            error.row
                          }
                          :{" "}
                          {
                            error.message
                          }
                        </s-text>
                      )
                    )}
                </s-stack>
              </s-box>
            )}

            {/* ================================================= */}
            {/* BUTTONS */}
            {/* ================================================= */}

            <s-stack
              direction="inline"
              gap="small"
            >
              <s-button
                variant="primary"
                onClick={
                  handleUpdateVariants
                }
                disabled={
                  isBulkRunning ||
                  isRequestRunning
                }
                {...(
                  isBulkRunning ||
                  isRequestRunning
                    ? {
                        loading:
                          true,
                      }
                    : {}
                )}
              >
                {isBulkRunning
                  ? `Updating ${progress}%`
                  : "Update Variants"}
              </s-button>

              <s-button
                variant="secondary"
                onClick={() =>
                  navigate("/app")
                }
                disabled={
                  isBulkRunning
                }
              >
                Cancel
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      {/* ================================================== */}
      {/* SUPPORTED COLUMNS */}
      {/* ================================================== */}

      <s-section heading="Supported columns">
        <s-stack
          direction="block"
          gap="base"
        >
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="base"
          >
            <s-stack
              direction="block"
              gap="small"
            >
              <s-heading>
                Required
              </s-heading>

              <s-text>
                • Variant ID
              </s-text>

              <s-text color="subdued">
                The "ID" column can be used as
                Product ID.
              </s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="base"
          >
            <s-stack
              direction="block"
              gap="small"
            >
              <s-heading>
                Variant fields
              </s-heading>

              <s-text>
                • Variant Price
              </s-text>

              <s-text>
                • Variant Compare At Price
              </s-text>

              <s-text>
                • Variant SKU
              </s-text>

              <s-text>
                • Variant Barcode
              </s-text>

              <s-text>
                • Variant Weight
              </s-text>

              <s-text>
                • Variant Weight Unit
              </s-text>

              <s-text>
                • Variant Image Src
              </s-text>

              <s-text>
                • Variant Inventory Policy
              </s-text>

              <s-text>
                • Variant Taxable
              </s-text>

              <s-text>
                • Variant Tax Code
              </s-text>

              <s-text>
                • Variant Requires Shipping
              </s-text>

              <s-text>
                • Variant Tracked
              </s-text>

              <s-text>
                • Variant Cost
              </s-text>

              <s-text>
                • Variant Country Code
              </s-text>

              <s-text>
                • Variant Province Code
              </s-text>

              <s-text>
                • Variant HS Code
              </s-text>

              <s-text>
                • Variant Requires Components
              </s-text>

              <s-text>
                • Variant Show Unit Price
              </s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="base"
          >
            <s-stack
              direction="block"
              gap="small"
            >
              <s-heading>
                Product fields
              </s-heading>

              <s-text>
                • Product Title
              </s-text>

              <s-text>
                • Product Handle
              </s-text>

              <s-text>
                • Product Vendor
              </s-text>

              <s-text>
                • Product Type
              </s-text>

              <s-text>
                • Product Status
              </s-text>

              <s-text>
                • Product Tags
              </s-text>

              <s-text>
                • Product Description HTML
              </s-text>

              <s-text>
                • Product Template Suffix
              </s-text>

              <s-text>
                • Product SEO Title
              </s-text>

              <s-text>
                • Product SEO Description
              </s-text>

              <s-text>
                • Product Category ID
              </s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="base"
          >
            <s-stack
              direction="block"
              gap="small"
            >
              <s-heading>
                Metafields
              </s-heading>

              <s-text color="subdued">
                Product:
              </s-text>

              <s-text>
                Product Metafield:
                namespace.key [type]
              </s-text>

              <s-text color="subdued">
                Variant:
              </s-text>

              <s-text>
                Variant Metafield:
                namespace.key [type]
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* ================================================== */}
      {/* CURRENT SHEET FORMAT */}
      {/* ================================================== */}

      <s-section heading="Your current sheet format">
        <s-box
          padding="base"
          borderWidth="base"
          borderRadius="base"
          background="subdued"
        >
          <s-stack
            direction="block"
            gap="base"
          >
            <s-table>
              <s-table-header-row>
                <s-table-header>
                  ID
                </s-table-header>

                <s-table-header>
                  Variant ID
                </s-table-header>

                <s-table-header>
                  Variant Price
                </s-table-header>

                <s-table-header>
                  Variant Compare At Price
                </s-table-header>

                <s-table-header>
                  Variant SKU
                </s-table-header>

                <s-table-header>
                  Variant Barcode
                </s-table-header>

                <s-table-header>
                  Variant Weight
                </s-table-header>

                <s-table-header>
                  Variant Image Src
                </s-table-header>

                <s-table-header>
                  Product Metafield:
                  test_data.snowboard_length
                  [dimension]
                </s-table-header>

                <s-table-header>
                  Product Metafield:
                  test_data.binding_mount
                  [single_line_text_field]
                </s-table-header>
              </s-table-header-row>

              <s-table-body>
                <s-table-row>
                  <s-table-cell>
                    16019193954607
                  </s-table-cell>

                  <s-table-cell>
                    58059027415334
                  </s-table-cell>

                  <s-table-cell>
                    9
                  </s-table-cell>

                  <s-table-cell>
                    120
                  </s-table-cell>

                  <s-table-cell>
                    GHS-7-0021-test-pinakka-gus-check
                  </s-table-cell>

                  <s-table-cell>
                    899999999913
                  </s-table-cell>

                  <s-table-cell>
                    10
                  </s-table-cell>

                  <s-table-cell>
                    https://cdn.shopify.com/...
                  </s-table-cell>

                  <s-table-cell>
                    {'{"value":200,"unit":"CENTIMETERS"}'}
                  </s-table-cell>

                  <s-table-cell>
                    Burton EST
                  </s-table-cell>
                </s-table-row>
              </s-table-body>
            </s-table>
          </s-stack>
        </s-box>
      </s-section>

      {/* ================================================== */}
      {/* IMPORTANT */}
      {/* ================================================== */}

      <s-section
        slot="aside"
        heading="Before you update"
      >
        <s-stack
          direction="block"
          gap="base"
        >
          <s-text color="subdued">
            Make a backup of your product
            data before performing a large
            bulk update.
          </s-text>

          <s-text color="subdued">
            Variant ID must belong to the
            Product ID specified in the same
            row.
          </s-text>

          <s-text color="subdued">
            Blank cells are ignored.
          </s-text>

          <s-text color="subdued">
            Use __CLEAR__ only when you
            intentionally want to clear a
            supported nullable value.
          </s-text>

          <s-text color="subdued">
            Image URLs must be publicly
            accessible.
          </s-text>

          <s-text color="subdued">
            Shopify processes uploaded media
            asynchronously, so an image can
            take a short time to finish
            processing after the variant
            update.
          </s-text>
        </s-stack>
      </s-section>

      {/* ================================================== */}
      {/* STATUS */}
      {/* ================================================== */}

      <s-section
        slot="aside"
        heading="Status"
      >
        <s-stack
          direction="block"
          gap="base"
        >
          <s-stack
            direction="inline"
            gap="small"
          >
            <s-badge tone="success">
              Connected
            </s-badge>

            <s-text>
              Shopify
            </s-text>
          </s-stack>

          <s-stack
            direction="inline"
            gap="small"
          >
            <s-badge tone="success">
              Connected
            </s-badge>

            <s-text>
              Google Sheets
            </s-text>
          </s-stack>

          <s-stack
            direction="inline"
            gap="small"
          >
            <s-badge tone="info">
              Batch processing
            </s-badge>

            <s-text>
              Large sheets supported
            </s-text>
          </s-stack>
        </s-stack>
      </s-section>
    </s-page>
  );
}

/*
 * ============================================================
 * HEADERS
 * ============================================================
 */

export const headers = (
  headersArgs
) => {
  return boundary.headers(
    headersArgs
  );
};