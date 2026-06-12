## Set admin password for lucast@anser.com

Run a one-time migration that upserts the auth user with password `SpeedCruise2024!` (bcrypt-hashed in SQL), marks the email confirmed, and lets the existing `link_authorized_user` trigger link it to the whitelist row.

### SQL (single migration)

```sql
-- Ensure pgcrypto is available for crypt()/gen_salt()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'lucast@anser.com';

  IF v_user_id IS NULL THEN
    -- Create confirmed user
    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token,
      email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'lucast@anser.com',
      crypt('SpeedCruise2024!', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now(), '', '', '', ''
    );
  ELSE
    -- Reset password + confirm
    UPDATE auth.users
       SET encrypted_password = crypt('SpeedCruise2024!', gen_salt('bf')),
           email_confirmed_at = COALESCE(email_confirmed_at, now()),
           updated_at = now()
     WHERE id = v_user_id;
  END IF;

  -- Ensure whitelist link
  UPDATE public.authorized_users
     SET user_id = (SELECT id FROM auth.users WHERE email = 'lucast@anser.com'),
         status = 'active'
   WHERE email = 'lucast@anser.com'::citext
     AND (user_id IS NULL OR user_id = (SELECT id FROM auth.users WHERE email = 'lucast@anser.com'));
END $$;
```

### After it runs

1. Go to `/auth`.
2. Sign in with `lucast@anser.com` / `SpeedCruise2024!`.
3. Change the password from your account afterwards (we can add a Change Password UI in a follow-up if you want — not in this change).

### Notes
- Password is bcrypt-hashed inside the SQL — never stored as plaintext.
- Touches only the one admin row + its whitelist link. No schema or policy changes.
- This bypass is one-time; the login screen itself remains the only normal entry point.