-- Account storage (PostgreSQL): Better Auth tables + studio pages, share
-- snapshots and user preferences. Timestamps are TIMESTAMP WITHOUT TIME ZONE
-- holding UTC values, matching the D1 schema's ISO-8601 TEXT.
CREATE TABLE IF NOT EXISTS "app_user" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" BOOLEAN NOT NULL DEFAULT FALSE,
  "image" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY,
  "expires_at" TIMESTAMP NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "ip_address" TEXT,
  "user_agent" TEXT,
  "user_id" TEXT NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" TIMESTAMP,
  "refresh_token_expires_at" TIMESTAMP,
  "scope" TEXT,
  "password" TEXT,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" TIMESTAMP NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS "studio_page" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "page" TEXT NOT NULL,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "studio_page_user_updated_idx" ON "studio_page" ("user_id", "updated_at" DESC);
CREATE TABLE IF NOT EXISTS "studio_page_share" (
  "page_id" TEXT PRIMARY KEY REFERENCES "studio_page"("id") ON DELETE CASCADE,
  "user_id" TEXT NOT NULL REFERENCES "app_user"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "snapshot" TEXT NOT NULL,
  "published_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "studio_page_share_token_idx" ON "studio_page_share" ("token");
CREATE TABLE IF NOT EXISTS "user_preference" (
  "user_id" TEXT PRIMARY KEY REFERENCES "app_user"("id") ON DELETE CASCADE,
  "studio_theme" TEXT NOT NULL DEFAULT 'light',
  "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
);
