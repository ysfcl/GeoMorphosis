-- CreateTable
CREATE TABLE "notification_channels" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "verification_code" TEXT,
    "verified_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_channels_user_id_channel_key" ON "notification_channels"("user_id", "channel");
