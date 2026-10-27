CREATE TABLE "studio_data_credential" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "app_user"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "allowed_hosts" text NOT NULL,
  "encrypted_secret" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX "studio_data_credential_user_idx" ON "studio_data_credential" ("user_id");
