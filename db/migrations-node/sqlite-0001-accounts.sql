-- Account storage: Better Auth tables + studio pages, share snapshots and
-- user preferences. All timestamps are ISO-8601 TEXT (UTC).
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "expires_at" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TEXT,
  "refresh_token_expires_at" TEXT,
  "scope" TEXT,
  "password" TEXT,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "studio_page" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "studio_page_user_updated_idx" ON "studio_page" ("user_id", "updated_at" DESC);
CREATE TABLE IF NOT EXISTS "studio_page_share" (
  "page_id" TEXT PRIMARY KEY REFERENCES "studio_page"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "snapshot" TEXT NOT NULL,
  "published_at" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "studio_page_share_token_idx" ON "studio_page_share" ("token");
CREATE TABLE IF NOT EXISTS "user_preference" (
  "user_id" TEXT PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
  "studio_theme" TEXT NOT NULL DEFAULT 'light',
  "updated_at" TEXT NOT NULL
);
