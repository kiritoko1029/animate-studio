-- Drizzle cannot declare triggers. SQLite serializes writes, so this check and
-- the INSERT share the same write transaction even across server instances.
CREATE TRIGGER "studio_component_folder_limit"
BEFORE INSERT ON "studio_component_folder"
WHEN (SELECT COUNT(*) FROM "studio_component_folder" WHERE "user_id" = NEW."user_id") >= 50
BEGIN
  SELECT RAISE(ABORT, 'studio_component_folder_limit');
END;
