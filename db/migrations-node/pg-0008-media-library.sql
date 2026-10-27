CREATE TABLE "studio_media" (
  "id" text PRIMARY KEY NOT NULL,
  "page_id" text NOT NULL REFERENCES "studio_page"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "app_user"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "mime" text NOT NULL,
  "size" integer NOT NULL,
  "hash" text NOT NULL,
  "storage_key" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "deleted_at" timestamp
);
CREATE UNIQUE INDEX "studio_media_storage_key_idx" ON "studio_media" ("storage_key");
CREATE INDEX "studio_media_owner_page_idx" ON "studio_media" ("user_id", "page_id", "created_at");
CREATE FUNCTION enforce_studio_media_limits() RETURNS trigger
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM 1 FROM "studio_page" WHERE "id" = NEW."page_id" FOR UPDATE;
  IF (SELECT COUNT(*) FROM "studio_media" WHERE "page_id" = NEW."page_id") >= 100 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'studio_media_count_limit';
  END IF;
  IF (SELECT COALESCE(SUM("size"), 0) + NEW."size" FROM "studio_media" WHERE "page_id" = NEW."page_id") > 52428800 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'studio_media_bytes_limit';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "studio_media_limits"
BEFORE INSERT ON "studio_media"
FOR EACH ROW EXECUTE FUNCTION enforce_studio_media_limits();
