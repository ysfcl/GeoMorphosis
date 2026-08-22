/*
  Warnings:

  - A unique constraint covering the columns `[unsubscribe_token]` on the table `periodic_subscriptions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id]` on the table `regions_analysis` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "periodic_subscriptions" ADD COLUMN "unsubscribe_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "periodic_subscriptions_unsubscribe_token_key" ON "periodic_subscriptions"("unsubscribe_token");

-- CreateIndex
CREATE UNIQUE INDEX "regions_analysis_user_id_key" ON "regions_analysis"("user_id");
