-- ---------------------------------------------------------------------------
-- Seed data for Z-API test suite
-- Creates minimal tenant/user/contact required for tests
-- Run BEFORE the test suite on a fresh staging environment
-- ---------------------------------------------------------------------------

-- Minimal test restaurant (tenant)
INSERT INTO restaurants (id, name, slug, phone, email, plan, is_active)
VALUES (
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'Txoko QA Restaurant',
  'txoko-qa',
  '5511000000001',
  'qa@txoko.com.br',
  'pro',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Test user (linked to restaurant)
-- Password: TestQA2026! (hashed by Supabase Auth — use supabase CLI to create)
-- supabase auth admin create-user --email qa@restaurant.com --password TestQA2026!
-- Then link here:
INSERT INTO restaurant_users (user_id, restaurant_id, role)
VALUES (
  '00000000-0000-0000-0000-000000000001',  -- replace with actual auth.users.id
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'owner'
)
ON CONFLICT DO NOTHING;

-- Test contact (the TEST_TARGET_PHONE)
-- Replace 55XXXXXXXXXXX with your actual test number
INSERT INTO contacts (id, restaurant_id, phone, name, source)
VALUES (
  'cccccccc-dddd-eeee-ffff-000000000001',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  '55XXXXXXXXXXX',
  'QA Test Contact',
  'manual'
)
ON CONFLICT (restaurant_id, phone) DO NOTHING;

-- Z-API channel for the test restaurant
INSERT INTO channels (id, restaurant_id, type, name, config, is_active)
VALUES (
  'cccccccc-dddd-eeee-ffff-000000000002',
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  'whatsapp_zapi',
  'WhatsApp QA',
  '{
    "instance_id": "3EF61DE4FA8B115D5CA0026F3BBEB9E1",
    "token": "C3E5FEA0C9081FF4EA88CA1E",
    "client_token": "F10b69af196a64f898b486489574bb65fS"
  }'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;
