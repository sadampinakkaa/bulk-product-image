-- CreateTable
CREATE TABLE "ImportHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "driveUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "imagesFound" INTEGER NOT NULL DEFAULT 0,
    "variantsMatched" INTEGER NOT NULL DEFAULT 0,
    "imagesUploaded" INTEGER NOT NULL DEFAULT 0,
    "imagesAssigned" INTEGER NOT NULL DEFAULT 0,
    "skuNotFound" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "errorDetails" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ImportHistory_shop_idx" ON "ImportHistory"("shop");

-- CreateIndex
CREATE INDEX "ImportHistory_createdAt_idx" ON "ImportHistory"("createdAt");
