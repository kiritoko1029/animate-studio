-- Library folders are owner-scoped metadata; deleting one keeps its components.
CREATE TABLE "studio_component_folder" (
  "id" TEXT PRIMARY KEY,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
CREATE UNIQUE INDEX "studio_component_folder_user_name_idx" ON "studio_component_folder" ("user_id", "name");
ALTER TABLE "studio_component" ADD COLUMN "folder_id" TEXT REFERENCES "studio_component_folder"("id") ON DELETE SET NULL;
