-- SECURITY NOTE: this migration originally seeded the first admin's auth.users
-- row with a hardcoded plaintext password. That credential must be treated as
-- compromised and rotated (Supabase Dashboard -> Authentication -> Users, or
-- the password-reset flow). The password-setting statements have been removed
-- from this file; migration content edits do not re-run in environments where
-- the migration already applied, and fresh environments should create the
-- first admin through the Supabase dashboard instead.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  -- Link the seeded allowlist row to the auth user if it exists.
  UPDATE public.authorized_users
     SET user_id = (SELECT id FROM auth.users WHERE email = 'lucast@anser.com'),
         status = 'active'
   WHERE email = 'lucast@anser.com'::citext;
END $$;
