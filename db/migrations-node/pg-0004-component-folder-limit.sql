-- Kept explicitly in migrations because Drizzle cannot declare triggers.
-- Lock the owner row before counting to serialize concurrent creates for that
-- account, including requests handled by different application instances.
CREATE FUNCTION enforce_studio_component_folder_limit() RETURNS trigger
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  PERFORM 1 FROM "app_user" WHERE "id" = NEW."user_id" FOR UPDATE;
  IF (SELECT COUNT(*) FROM "studio_component_folder" WHERE "user_id" = NEW."user_id") >= 50 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'studio_component_folder_limit';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "studio_component_folder_limit"
BEFORE INSERT ON "studio_component_folder"
FOR EACH ROW EXECUTE FUNCTION enforce_studio_component_folder_limit();
