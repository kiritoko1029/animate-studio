-- Custom components saved to accounts and their published share snapshots
-- (PostgreSQL). Timestamps hold UTC wall-clock values, like 0001.
CREATE TABLE IF NOT EXISTS "studio_component" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "definition" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "studio_component_user_updated_idx" ON "studio_component" ("user_id", "updated_at");
CREATE TABLE IF NOT EXISTS "studio_component_share" (
  "component_id" TEXT PRIMARY KEY REFERENCES "studio_component"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "snapshot" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "published_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
