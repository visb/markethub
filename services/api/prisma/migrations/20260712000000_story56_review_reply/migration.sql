-- Story 56: resposta do lojista ao review (1 resposta editável, sem histórico).
-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "replyText" TEXT,
ADD COLUMN "repliedAt" TIMESTAMP(3);
