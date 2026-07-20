-- GoTrue scans several auth.users string columns that cannot be NULL. Manually
-- seeded users (migration 07) leave them NULL, which breaks sign in with
-- "converting NULL to string is unsupported". Set them to empty string for the
-- demo accounts. Runs after 07 so a fresh replay produces working demo logins.
update auth.users
set
  confirmation_token = coalesce(confirmation_token, ''),
  recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''),
  email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''),
  reauthentication_token = coalesce(reauthentication_token, '')
where email in ('admin@kariba.com','tigerfish@kariba.com','tourist@kariba.com','caribbea@kariba.com');
