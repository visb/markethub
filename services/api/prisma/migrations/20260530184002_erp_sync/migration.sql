-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('full', 'prices', 'stock');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('running', 'success', 'failed');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "connectorConfig" JSONB,
ADD COLUMN     "connectorType" TEXT;

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "SyncType" NOT NULL,
    "status" "SyncStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "itemsUpdated" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_runs_storeId_startedAt_idx" ON "sync_runs"("storeId", "startedAt");
