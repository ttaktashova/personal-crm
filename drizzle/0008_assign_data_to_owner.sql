-- Gives everything that was in the database before sign-in to the owner: the user with the email
-- of OWNER_EMAIL. The migration runner puts it into the setting app.owner_email of its connection
-- (src/db/migrate.ts, scripts/migrate.mjs). Without the setting, or with something that is not an
-- email, the migration stops and every migration of this run is rolled back: nothing changes.
-- The email is never written into the error: the deploy log is public.
-- Revenge records and who is in which group belong to the contact: they are not touched.
DO $$
DECLARE
  owner_email text := lower(btrim(coalesce(current_setting('app.owner_email', true), '')));
  owner_user_id integer;
BEGIN
  -- The same simple rule as isOwnerEmail in src/db/migrate.ts: "x@y.z" without spaces, at most 254.
  IF length(owner_email) > 254
    OR owner_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'OWNER_EMAIL is not set or is not an email';
  END IF;

  -- The owner signs in later with this email and finds everything; a user who already has it is kept.
  INSERT INTO users (name, email, email_verified, created_at, updated_at)
  VALUES ('', owner_email, true, now(), now())
  ON CONFLICT (email) DO NOTHING;

  SELECT id INTO STRICT owner_user_id FROM users WHERE email = owner_email;

  UPDATE contacts SET owner_id = owner_user_id WHERE owner_id IS NULL;
  UPDATE groups SET owner_id = owner_user_id WHERE owner_id IS NULL;
END
$$;
