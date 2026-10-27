CREATE TABLE "studio_media" (
  "id" text PRIMARY KEY NOT NULL,
  "page_id" text NOT NULL REFERENCES "studio_page"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "hash" text NOT NULL,
  "storage_key" text NOT NULL,
  "created_at" text NOT NULL,
  "deleted_at" text
);
CREATE UNIQUE INDEX "studio_media_storage_key_idx" ON "studio_media" ("storage_key");
CREATE INDEX "studio_media_owner_page_idx" ON "studio_media" ("user_id", "page_id", "created_at");
CREATE TRIGGER "studio_media_count_limit"
BEFORE INSERT ON "studio_media"
WHEN (SELECT COUNT(*) FROM "studio_media" WHERE "page_id" = NEW."page_id") >= 100
BEGIN SELECT RAISE(ABORT, 'studio_media_count_limit'); END;
CREATE TRIGGER "studio_media_bytes_limit"
BEFORE INSERT ON "studio_media"
WHEN (SELECT COALESCE(SUM("size"), 0) + NEW."size" FROM "studio_media" WHERE "page_id" = NEW."page_id") > 52428800
BEGIN SELECT RAISE(ABORT, 'studio_media_bytes_limit'); END;
