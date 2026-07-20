-- Email confirmation is ON, so seeded users set email_confirmed_at directly.
-- Real signups still go through the confirmation flow.
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_tourist uuid := gen_random_uuid();
  v_hotel uuid := gen_random_uuid();
  v_hotel_id uuid;
begin
  insert into public.hotels (name, location, commission_rate, is_verified)
  values ('Caribbea Bay Resort', 'Kariba Town', 8, true)
  returning id into v_hotel_id;

  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_admin, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'admin@kariba.com', crypt('admin123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Kariba Admin","role":"tourist"}', now(), now()),
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'tigerfish@kariba.com', crypt('operator123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Blessing Ncube","role":"owner","business_name":"Tiger Fish Charters","phone":"+263 77 345 6789"}',
     now(), now()),
    (v_tourist, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'tourist@kariba.com', crypt('tourist123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Grace Ndlovu","role":"tourist","phone":"+263 71 999 0000"}', now(), now()),
    (v_hotel, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'caribbea@kariba.com', crypt('hotel123', gen_salt('bf')), now(),
     '{"provider":"email","providers":["email"]}',
     '{"full_name":"Caribbea Bay Front Desk","role":"hotel"}', now(), now());

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  select u.id, u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now()
  from auth.users u where u.id in (v_admin, v_owner, v_tourist, v_hotel);

  -- The guard trigger refuses role/verification/trust changes unless is_admin(),
  -- which is false in a migration (no auth.uid()). Disable it for the privileged
  -- seed writes only, then restore it. This is the server side grant the design wants.
  -- The signup trigger whitelist still refuses 'admin' from user metadata, so this
  -- is the only place admin is granted, proving the whitelist held.
  alter table public.profiles disable trigger profiles_guard_privileges;

  update public.profiles set role = 'admin' where id = v_admin;
  update public.profiles set hotel_id = v_hotel_id where id = v_hotel;
  update public.profiles set is_verified = true, trust_score = 95 where id = v_owner;

  alter table public.profiles enable trigger profiles_guard_privileges;
end $$;
