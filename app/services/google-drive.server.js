const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXTENSION_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export function extractDriveFolderId(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Invalid Google Drive folder URL."
    );
  }

  if (
    url.hostname !== "drive.google.com" &&
    !url.hostname.endsWith(".google.com")
  ) {
    throw new Error(
      "Please provide a valid Google Drive folder URL."
    );
  }

  const folderMatch =
    url.pathname.match(
      /\/folders\/([a-zA-Z0-9_-]+)/
    );

  if (folderMatch?.[1]) {
    return folderMatch[1];
  }

  const id =
    url.searchParams.get("id");

  if (id) {
    return id;
  }

  throw new Error(
    "Could not find the Google Drive folder ID."
  );
}

function getResourceKey(value) {
  try {
    const url = new URL(value);

    return (
      url.searchParams.get("resourcekey") ||
      null
    );
  } catch {
    return null;
  }
}

function getEmbeddedFolderUrl(
  folderId,
  resourceKey
) {
  const url = new URL(
    "https://drive.google.com/u/0/embeddedfolderview"
  );

  url.searchParams.set(
    "id",
    folderId
  );

  if (resourceKey) {
    url.searchParams.set(
      "resourcekey",
      resourceKey
    );
  }

  return `${url.toString()}#list`;
}

async function fetchPublicFolder(
  folderId,
  resourceKey
) {
  const urls = [
    getEmbeddedFolderUrl(
      folderId,
      resourceKey
    ),

    `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(
      folderId
    )}${
      resourceKey
        ? `&resourcekey=${encodeURIComponent(
            resourceKey
          )}`
        : ""
    }#list`,

    `https://drive.google.com/drive/folders/${encodeURIComponent(
      folderId
    )}?usp=sharing${
      resourceKey
        ? `&resourcekey=${encodeURIComponent(
            resourceKey
          )}`
        : ""
    }`,
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const response =
        await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",

            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "en-US,en;q=0.9",
          },
        });

      const html =
        await response.text();

      if (
        response.ok &&
        html.length > 500
      ) {
        return html;
      }

      lastError =
        new Error(
          `Google Drive returned HTTP ${response.status}.`
        );
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error(
      "Unable to access the public Google Drive folder."
    )
  );
}

/*
 * Google Drive embedded folder pages contain
 * file information in several different forms.
 *
 * This parser intentionally checks multiple
 * patterns so the importer can handle
 * different Drive responses.
 */

function extractFilesFromHtml(
  html,
  resourceKey
) {
  const files = new Map();

  /*
   * ----------------------------------------------------
   * Pattern 1
   *
   * Drive file links:
   * /file/d/FILE_ID/
   * ----------------------------------------------------
   */

  const fileLinkRegex =
    /\/file\/d\/([a-zA-Z0-9_-]+)[^"'<>]*[^"'<>]*["'][^>]*>([^<]+)/gi;

  for (
    const match of html.matchAll(
      fileLinkRegex
    )
  ) {
    const id = match[1];

    const possibleName =
      cleanText(match[2]);

    if (
      id &&
      possibleName
    ) {
      addImageFile(
        files,
        id,
        possibleName,
        resourceKey
      );
    }
  }

  /*
   * ----------------------------------------------------
   * Pattern 2
   *
   * /file/d/FILE_ID
   * followed somewhere by filename.
   * ----------------------------------------------------
   */

  const idRegex =
    /(?:\/file\/d\/|[?&]id=)([a-zA-Z0-9_-]{10,})/gi;

  const ids = [];

  for (
    const match of html.matchAll(
      idRegex
    )
  ) {
    ids.push(
      match[1]
    );
  }

  for (
    const id of ids
  ) {
    const nearby =
      getNearbyFilename(
        html,
        id
      );

    if (nearby) {
      addImageFile(
        files,
        id,
        nearby,
        resourceKey
      );
    }
  }

  /*
   * ----------------------------------------------------
   * Pattern 3
   *
   * Google internal metadata sometimes exposes:
   *
   * ["FILE_ID","filename.jpg"]
   * ----------------------------------------------------
   */

  const metadataRegex =
    /["']([a-zA-Z0-9_-]{15,})["']\s*,\s*["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["']/gi;

  for (
    const match of html.matchAll(
      metadataRegex
    )
  ) {
    addImageFile(
      files,
      match[1],
      cleanText(match[2]),
      resourceKey
    );
  }

  /*
   * ----------------------------------------------------
   * Pattern 4
   *
   * Filename first, ID second.
   * ----------------------------------------------------
   */

  const reverseMetadataRegex =
    /["']([^"']+\.(?:jpg|jpeg|png|webp|gif))["']\s*,\s*["']([a-zA-Z0-9_-]{15,})["']/gi;

  for (
    const match of html.matchAll(
      reverseMetadataRegex
    )
  ) {
    addImageFile(
      files,
      match[2],
      cleanText(match[1]),
      resourceKey
    );
  }

  return Array.from(
    files.values()
  );
}

function getNearbyFilename(
  html,
  fileId
) {
  const index =
    html.indexOf(fileId);

  if (index === -1) {
    return null;
  }

  const start =
    Math.max(
      0,
      index - 500
    );

  const end =
    Math.min(
      html.length,
      index + 1500
    );

  const nearby =
    html.slice(
      start,
      end
    );

  const match =
    nearby.match(
      /([^"'<>\\]{1,250}\.(?:jpg|jpeg|png|webp|gif))/i
    );

  if (!match) {
    return null;
  }

  return cleanText(
    match[1]
  );
}

function addImageFile(
  files,
  id,
  name,
  resourceKey
) {
  const cleanName =
    cleanText(name);

  const mimeType =
    getImageMimeType(
      cleanName,
      null
    );

  if (
    !mimeType
  ) {
    return;
  }

  files.set(
    id,
    {
      id,

      name:
        cleanName,

      mimeType,

      size: 0,

      downloadUrl:
        buildDownloadUrl(
          id,
          resourceKey
        ),
    }
  );
}

function cleanText(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /\\u003d/g,
      "="
    )
    .replace(
      /\\u0026/g,
      "&"
    )
    .replace(
      /\\"/g,
      '"'
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&#x27;/gi,
      "'"
    )
    .trim();
}

function buildDownloadUrl(
  fileId,
  resourceKey
) {
  const url =
    new URL(
      "https://drive.google.com/uc"
    );

  url.searchParams.set(
    "export",
    "download"
  );

  url.searchParams.set(
    "id",
    fileId
  );

  if (resourceKey) {
    url.searchParams.set(
      "resourcekey",
      resourceKey
    );
  }

  return url.toString();
}

export async function listPublicDriveImages(
  folderUrl
) {
  const folderId =
    extractDriveFolderId(
      folderUrl
    );

  const resourceKey =
    getResourceKey(
      folderUrl
    );

  const html =
    await fetchPublicFolder(
      folderId,
      resourceKey
    );

  const files =
    extractFilesFromHtml(
      html,
      resourceKey
    );

  if (!files.length) {
    throw new Error(
      "Google Drive is accessible, but no image files could be detected in the public folder. Make sure the images are directly inside the folder and the folder is shared as Anyone with the link → Viewer."
    );
  }

  return files;
}

function getImageMimeType(
  filename,
  mimeType
) {
  if (
    mimeType &&
    IMAGE_TYPES.has(
      mimeType
    )
  ) {
    return mimeType;
  }

  const extension =
    filename
      ?.split(".")
      .pop()
      ?.toLowerCase();

  return (
    EXTENSION_TYPES[
      extension
    ] || null
  );
}

export function getSkuFromFilename(
  filename
) {
  const cleanName =
    String(
      filename || ""
    ).trim();

  const lastDot =
    cleanName.lastIndexOf(
      "."
    );

  if (
    lastDot === -1
  ) {
    return cleanName;
  }

  return cleanName
    .slice(
      0,
      lastDot
    )
    .trim();
}

export async function downloadDriveImage(
  file
) {
  let response =
    await fetch(
      file.downloadUrl,
      {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",

          Accept:
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      }
    );

  let contentType =
    (
      response.headers.get(
        "content-type"
      ) || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  /*
   * Google sometimes sends a confirmation page.
   */

  if (
    response.ok &&
    !IMAGE_TYPES.has(
      contentType
    )
  ) {
    const html =
      await response.text();

    const confirmationUrl =
      findConfirmationUrl(
        html,
        file.downloadUrl
      );

    if (
      confirmationUrl
    ) {
      response =
        await fetch(
          confirmationUrl,
          {
            method: "GET",
            redirect: "follow",
            headers: {
              "User-Agent":
                "Mozilla/5.0",
            },
          }
        );

      contentType =
        (
          response.headers.get(
            "content-type"
          ) || ""
        )
          .split(";")[0]
          .trim()
          .toLowerCase();
    }
  }

  if (
    !response.ok
  ) {
    throw new Error(
      `Unable to download ${file.name} from Google Drive. HTTP ${response.status}.`
    );
  }

  if (
    !IMAGE_TYPES.has(
      contentType
    )
  ) {
    throw new Error(
      `Google Drive did not return an image for ${file.name}.`
    );
  }

  const buffer =
    Buffer.from(
      await response.arrayBuffer()
    );

  if (!buffer.length) {
    throw new Error(
      `Downloaded image is empty: ${file.name}`
    );
  }

  return {
    buffer,

    contentType:
      normalizeContentType(
        contentType
      ),
  };
}

function findConfirmationUrl(
  html,
  originalUrl
) {
  const form =
    html.match(
      /<form[^>]+action=["']([^"']+)["']/i
    );

  if (
    !form?.[1]
  ) {
    return null;
  }

  let action =
    cleanText(
      form[1]
    );

  if (
    action.startsWith("/")
  ) {
    action =
      `https://drive.google.com${action}`;
  }

  if (
    !action.startsWith(
      "http"
    )
  ) {
    return null;
  }

  let url;

  try {
    url =
      new URL(
        action
      );
  } catch {
    return null;
  }

  const inputs =
    /<input[^>]+type=["']hidden["'][^>]+name=["']([^"']+)["'][^>]+value=["']([^"']*)["']/gi;

  for (
    const match of html.matchAll(
      inputs
    )
  ) {
    url.searchParams.set(
      cleanText(match[1]),
      cleanText(match[2])
    );
  }

  try {
    const original =
      new URL(
        originalUrl
      );

    for (
      const [
        key,
        value,
      ] of original.searchParams.entries()
    ) {
      if (
        !url.searchParams.has(
          key
        )
      ) {
        url.searchParams.set(
          key,
          value
        );
      }
    }
  } catch {
    // Ignore.
  }

  return url.toString();
}

function normalizeContentType(
  value
) {
  const clean =
    String(
      value || ""
    )
      .split(";")[0]
      .trim()
      .toLowerCase();

  if (
    IMAGE_TYPES.has(
      clean
    )
  ) {
    return clean;
  }

  return "image/jpeg";
}