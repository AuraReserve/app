-- deploy-defaults.sql
-- Deploys essential catalog data (asset types + integrations).
-- Idempotent — safe to run multiple times via ON CONFLICT.
--
-- Quick fix (pipe into postgres container):
--   docker exec -i aurareserve-db psql -U aurareserve -d aurareserve < prisma/deploy-defaults.sql
--
-- Or from a remote host:
--   psql "$DATABASE_URL" < prisma/deploy-defaults.sql

BEGIN;

-- ── System User ────────────────────────────────────────────────────────

INSERT INTO users (id, email, name, full_name, company, role, auth_provider, is_active,
  email_verified, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    'system@aurareserve.io',
    'System',
    'System User',
    'AuraReserve',
    NULL,
    'credentials',
    true,
    true,
    NOW(),
    NOW()
  )
  ON CONFLICT (email) DO NOTHING;

-- ── Asset Types ────────────────────────────────────────────────────────

INSERT INTO asset_types (value, label, icon) VALUES
  ('gold',      'Gold',           'coins'),
  ('silver',    'Silver',         'circle-dot'),
  ('gemstones', 'Gemstones',      'gem'),
  ('platinum',  'Platinum',       'hexagon'),
  ('palladium', 'Palladium',      'shield'),
  ('diamonds',  'Diamonds',       'diamond'),
  ('crypto',    'Cryptocurrency', 'bitcoin'),
  ('other',     'Other',          'box')
ON CONFLICT (value) DO UPDATE SET
  label = EXCLUDED.label,
  icon  = EXCLUDED.icon;

-- ── Integrations ───────────────────────────────────────────────────────

INSERT INTO integrations (id, key, display_name, description, supports_input, supports_output, supported_artifact_types, is_free, supported_triggers, config_schema, default_trigger, default_schedule, is_available_self_hosted, bundle_key, is_active)
VALUES
  (gen_random_uuid(), 'manual', 'Manual Input',
   'Manually enter reserve values through the portal UI.',
   true, false,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   true,
   ARRAY[]::integration_trigger[],
   '{}',
   NULL, NULL, true, NULL, true),

  (gen_random_uuid(), 'csv-upload', 'CSV/JSON Upload',
   'Bulk import reserve data from CSV or JSON files.',
   true, false,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   true,
   ARRAY[]::integration_trigger[],
   '{}',
   NULL, NULL, true, NULL, true),

  (gen_random_uuid(), 'api', 'API Ingest',
   'Ingest data via authenticated API push.',
   true, false,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   false,
   ARRAY[]::integration_trigger[],
   '{}',
   NULL, NULL, true, NULL, true),

  (gen_random_uuid(), 'blockchain-read', 'Blockchain Read',
   'Read on-chain reserve data from EVM-compatible blockchains.',
   true, false,
   ARRAY['value','merkle_tree','merkle_sum_tree']::artifact_type[],
   false,
   ARRAY['cron','manual']::integration_trigger[],
   '{"input":{"type":"object","properties":{"rpcUrl":{"type":"string","description":"RPC endpoint URL"},"contractAddress":{"type":"string","description":"Reserve contract address"},"tokenDecimals":{"type":"number","description":"Token decimal places"}},"required":["rpcUrl","contractAddress"]}}',
   'cron', '0 */6 * * *', true, 'blockchain', true),

  (gen_random_uuid(), 'api-fetch', 'API Fetch',
   'Pull data from an external API on a schedule.',
   true, false,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   false,
   ARRAY['cron','manual']::integration_trigger[],
   '{"input":{"type":"object","properties":{"endpoint":{"type":"string","description":"External API endpoint to poll"},"headers":{"type":"object","description":"Custom headers for API requests"},"method":{"type":"string","description":"HTTP method (GET, POST)"}},"required":["endpoint"]}}',
   'cron', '0 */6 * * *', true, NULL, true),

  (gen_random_uuid(), 'api-serve', 'API Endpoint',
   'Expose reserve data through public API endpoints.',
   false, true,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   true,
   ARRAY[]::integration_trigger[],
   '{"output":{"type":"object","properties":{"rateLimit":{"type":"number","description":"Max requests per minute"}}}}',
   NULL, NULL, true, NULL, true),

  (gen_random_uuid(), 'api-serve-all', 'API Endpoint (All Streams)',
   'Expose all reserve streams through a single public API endpoint.',
   false, true,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   true,
   ARRAY[]::integration_trigger[],
   '{"output":{"type":"object","properties":{"rateLimit":{"type":"number","description":"Max requests per minute"}}}}',
   NULL, NULL, true, NULL, true),

  (gen_random_uuid(), 'webhook', 'Webhook',
   'Push reserve data to external endpoints via webhooks.',
   false, true,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   false,
   ARRAY['on_change','cron','manual']::integration_trigger[],
   '{"output":{"type":"object","properties":{"url":{"type":"string","description":"Webhook destination URL"},"secret":{"type":"string","description":"HMAC signing secret"},"headers":{"type":"object","description":"Custom headers"}},"required":["url"]}}',
   'on_change', NULL, true, NULL, true),

  (gen_random_uuid(), 'avalanche', 'Avalanche',
   'Publish proof-of-reserve attestations on Avalanche C-Chain.',
   false, true,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   false,
   ARRAY['on_change','cron','manual']::integration_trigger[],
   '{"output":{"type":"object","properties":{"rpcUrl":{"type":"string","description":"Avalanche RPC endpoint"},"contractAddress":{"type":"string","description":"Proof-of-reserve contract address"},"privateKey":{"type":"string","description":"Wallet private key (encrypted)"}},"required":["rpcUrl","contractAddress","privateKey"]}}',
   'manual', NULL, true, 'blockchain', true),

  (gen_random_uuid(), 'rwa-xyz', 'RWA.xyz',
   'Publish reserve attestations to the RWA.xyz platform.',
   false, true,
   ARRAY['value','merkle_tree','merkle_sum_tree','sparse_merkle_tree']::artifact_type[],
   false,
   ARRAY['on_change','cron','manual']::integration_trigger[],
   '{"output":{"type":"object","properties":{"apiKey":{"type":"string","description":"RWA.xyz API key"},"assetId":{"type":"string","description":"RWA.xyz asset identifier"}},"required":["apiKey","assetId"]}}',
   'manual', NULL, false, 'rwa', true)

ON CONFLICT (key) DO UPDATE SET
  display_name              = EXCLUDED.display_name,
  description               = EXCLUDED.description,
  supports_input            = EXCLUDED.supports_input,
  supports_output           = EXCLUDED.supports_output,
  supported_artifact_types  = EXCLUDED.supported_artifact_types,
  is_free                   = EXCLUDED.is_free,
  supported_triggers        = EXCLUDED.supported_triggers,
  config_schema             = EXCLUDED.config_schema,
  default_trigger           = EXCLUDED.default_trigger,
  default_schedule          = EXCLUDED.default_schedule,
  is_available_self_hosted  = EXCLUDED.is_available_self_hosted,
  bundle_key                = EXCLUDED.bundle_key,
  is_active                 = EXCLUDED.is_active;

COMMIT;
