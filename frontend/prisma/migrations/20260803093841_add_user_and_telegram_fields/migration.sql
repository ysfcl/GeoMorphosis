-- CreateTable
CREATE TABLE "periodic_subscriptions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "region_id" INTEGER,
    "notification_target" TEXT,
    "interval_minutes" INTEGER DEFAULT 120,
    "last_checked_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN DEFAULT true,
    CONSTRAINT "periodic_subscriptions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions_analysis" ("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

-- CreateTable
CREATE TABLE "regions_analysis" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ip_address" TEXT,
    "user_id" TEXT,
    "telegram_chat_id" TEXT,
    "image_no" TEXT,
    "timestamp" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "region_name" TEXT,
    "coordinates" TEXT,
    "ai_results" TEXT
);
