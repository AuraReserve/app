/**
 * Database Seed Script
 * Populates the database with initial data for development and testing
 * Supports both PostgreSQL and SQLite
 */

import {
  ApiIdentifierSource,
  ArtifactType,
  AuditAction,
  AuthProvider,
  EntitlementStatus,
  IntegrationDirection,
  IntegrationStatus,
  IntegrationTrigger,
  PrismaClient,
  ResourceType,
  SpaceRole,
  UserRole,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { defaultIntegrations } from '../src/lib/integrations/default-integrations';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

// Detect if we're using SQLite based on DATABASE_URL
const isSQLite = process.env.DATABASE_URL?.startsWith('file:') ?? false;
const prisma = isSQLite
  ? new PrismaClient()
  : new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });

// Helper to serialize arrays for SQLite, passthrough for PostgreSQL
const serializeArray = <T>(arr: T[]): any => {
  return isSQLite ? JSON.stringify(arr) : arr;
};

// Helper to serialize JSON for SQLite, passthrough for PostgreSQL
const serializeJson = <T>(obj: T): any => {
  return isSQLite ? JSON.stringify(obj) : obj;
};

// Prisma enum writes currently expect enum keys (e.g. OWNER) in this runtime setup.
const enumKey = <T>(key: string) => key as unknown as T;

const USER_ROLE_OWNER = enumKey<UserRole>('OWNER');
const USER_ROLE_ADMIN = enumKey<UserRole>('ADMIN');
const AUTH_PROVIDER_CREDENTIALS = enumKey<AuthProvider>('CREDENTIALS');
const SPACE_ROLE_ADMIN = enumKey<SpaceRole>('ADMIN');
const SPACE_ROLE_AUDITOR = enumKey<SpaceRole>('AUDITOR');
const SPACE_ROLE_MEMBER = enumKey<SpaceRole>('MEMBER');
const API_IDENTIFIER_SOURCE_SLUG = enumKey<ApiIdentifierSource>('SLUG');
const INTEGRATION_DIR_INPUT = enumKey<IntegrationDirection>('INPUT');
const INTEGRATION_DIR_OUTPUT = enumKey<IntegrationDirection>('OUTPUT');
const INTEGRATION_STATUS_ACTIVE = enumKey<IntegrationStatus>('ACTIVE');
const ENTITLEMENT_STATUS_ACTIVE = enumKey<EntitlementStatus>('ACTIVE');
const ARTIFACT_TYPE_VALUE = enumKey<ArtifactType>('VALUE');
const ARTIFACT_TYPE_MERKLE_TREE = enumKey<ArtifactType>('MERKLE_TREE');
const ARTIFACT_TYPE_MERKLE_SUM_TREE = enumKey<ArtifactType>('MERKLE_SUM_TREE');
const ARTIFACT_TYPE_SPARSE_MERKLE_TREE = enumKey<ArtifactType>('SPARSE_MERKLE_TREE');
const INTEGRATION_TRIGGER_MANUAL = enumKey<IntegrationTrigger>('MANUAL');
const INTEGRATION_TRIGGER_CRON = enumKey<IntegrationTrigger>('CRON');
const INTEGRATION_TRIGGER_ON_CHANGE = enumKey<IntegrationTrigger>('ON_CHANGE');

/**
 * Helper to upsert a SpaceIntegration by its composite key fields.
 * The old @@unique was removed in favor of @@index, so we use findFirst + create/update.
 */
async function upsertSpaceIntegration(
  where: { spaceId: string; integrationId: string; streamId: string; direction: IntegrationDirection },
  createData: Record<string, unknown>,
) {
  const existing = await prisma.spaceIntegration.findFirst({ where });
  if (existing) {
    return prisma.spaceIntegration.update({ where: { id: existing.id }, data: {} });
  }
  return prisma.spaceIntegration.create({ data: { ...where, ...createData } as any });
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'space';

// Hash password using bcrypt to match auth.ts configuration (which uses @/lib/password)
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log('🌱 Seeding database...');

  // Hash passwords using bcrypt (matching @/lib/password used by auth.ts)
  // Password must meet validation: uppercase, lowercase, numbers, symbols
  const defaultPassword = await hashPassword('Password123!');

  // Create owner user (super admin)
  const owner = await prisma.user.upsert({
    where: { email: 'owner@aurareserve.io' },
    update: {},
    create: {
      email: 'owner@aurareserve.io',
      name: 'Owner User',
      fullName: 'Owner User',
      company: 'AuraReserve',
      role: USER_ROLE_OWNER,
      authProvider: AUTH_PROVIDER_CREDENTIALS,
      isActive: true,
      emailVerified: true,
    },
  });

  // Create credential account for owner (Better Auth stores passwords in Account table)
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: owner.id } },
    update: { password: defaultPassword },
    create: {
      userId: owner.id,
      providerId: 'credential',
      accountId: owner.id,
      password: defaultPassword,
    },
  });

  console.log('✓ Created owner user:', owner.email, '(password: Password123!)');

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@aurareserve.io' },
    update: {},
    create: {
      email: 'admin@aurareserve.io',
      name: 'Admin User',
      fullName: 'Admin User',
      company: 'AuraReserve',
      role: USER_ROLE_ADMIN,
      authProvider: AUTH_PROVIDER_CREDENTIALS,
      isActive: true,
      emailVerified: true,
    },
  });

  // Create credential account for admin
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: admin.id } },
    update: { password: defaultPassword },
    create: {
      userId: admin.id,
      providerId: 'credential',
      accountId: admin.id,
      password: defaultPassword,
    },
  });

  console.log('✓ Created admin user:', admin.email, '(password: Password123!)');

  // Create space-only users (users with no platform role, only space permissions)
  const auditorUser = await prisma.user.upsert({
    where: { email: 'auditor@aurareserve.io' },
    update: {},
    create: {
      email: 'auditor@aurareserve.io',
      name: 'Auditor User',
      fullName: 'Auditor User',
      company: 'Gold Auditing Co.',
      role: null, // No platform role, only space permissions
      authProvider: AUTH_PROVIDER_CREDENTIALS,
      isActive: true,
      emailVerified: true,
    },
  });

  // Create credential account for auditor
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: auditorUser.id } },
    update: { password: defaultPassword },
    create: {
      userId: auditorUser.id,
      providerId: 'credential',
      accountId: auditorUser.id,
      password: defaultPassword,
    },
  });

  console.log('✓ Created auditor user:', auditorUser.email, '(password: Password123!)');

  const memberUser = await prisma.user.upsert({
    where: { email: 'member@aurareserve.io' },
    update: {},
    create: {
      email: 'member@aurareserve.io',
      name: 'Member User',
      fullName: 'Member User',
      company: 'Viewer Corp',
      role: null, // No platform role, only space permissions
      authProvider: AUTH_PROVIDER_CREDENTIALS,
      isActive: true,
      emailVerified: true,
    },
  });

  // Create credential account for member
  await prisma.account.upsert({
    where: { providerId_accountId: { providerId: 'credential', accountId: memberUser.id } },
    update: { password: defaultPassword },
    create: {
      userId: memberUser.id,
      providerId: 'credential',
      accountId: memberUser.id,
      password: defaultPassword,
    },
  });

  console.log('✓ Created member user:', memberUser.email, '(password: Password123!)');

  // Create system user (used by input plugins for automated reserve creation)
  const systemUser = await prisma.user.upsert({
    where: { email: 'system@aurareserve.io' },
    update: {},
    create: {
      email: 'system@aurareserve.io',
      name: 'System',
      fullName: 'System User',
      company: 'AuraReserve',
      role: null, // No platform role — only used internally by plugins
      authProvider: AUTH_PROVIDER_CREDENTIALS,
      isActive: true,
      emailVerified: true,
    },
  });

  console.log('✓ Created system user:', systemUser.email);

  // Ensure asset types exist
  const assetTypes = [
    { value: 'gold', label: 'Gold', icon: 'coins' },
    { value: 'silver', label: 'Silver', icon: 'circle-dot' },
    { value: 'gemstones', label: 'Gemstones', icon: 'gem' },
    { value: 'platinum', label: 'Platinum', icon: 'hexagon' },
    { value: 'palladium', label: 'Palladium', icon: 'shield' },
    { value: 'diamonds', label: 'Diamonds', icon: 'diamond' },
    { value: 'crypto', label: 'Cryptocurrency', icon: 'bitcoin' },
    { value: 'other', label: 'Other', icon: 'box' },
  ];

  await Promise.all(
    assetTypes.map(({ value, label, icon }) =>
      prisma.assetType.upsert({
        where: { value },
        update: { label, icon },
        create: { value, label, icon },
      })
    )
  );

  console.log('✓ Ensured asset types table is populated');

  // Create sample spaces
  const goldSpaceName = 'ACC Gold Reserve';
  const goldSpace = await prisma.space.upsert({
    where: { id: 'demo-gold-space' },
    update: {
      name: goldSpaceName,
      description: 'Gold reserves audited and tracked for ACC',
      slug: slugify(goldSpaceName),
      apiIdentifier: slugify(goldSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
      isActive: true,
    },
    create: {
      id: 'demo-gold-space',
      name: goldSpaceName,
      slug: slugify(goldSpaceName),
      description: 'Gold reserves audited and tracked for ACC',
      createdBy: admin.id,
      isActive: true,
      apiIdentifier: slugify(goldSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
    },
  });

  console.log('✓ Created space:', goldSpace.name);

  const silverSpaceName = 'Silver Bullion Vault';
  const silverSpace = await prisma.space.upsert({
    where: { id: 'demo-silver-space' },
    update: {
      name: silverSpaceName,
      description: 'Physical silver bullion reserves',
      slug: slugify(silverSpaceName),
      apiIdentifier: slugify(silverSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
      isActive: true,
    },
    create: {
      id: 'demo-silver-space',
      name: silverSpaceName,
      slug: slugify(silverSpaceName),
      description: 'Physical silver bullion reserves',
      createdBy: admin.id,
      isActive: true,
      apiIdentifier: slugify(silverSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
    },
  });

  console.log('✓ Created space:', silverSpace.name);

  // Add auditor to gold space
  await prisma.spaceUser.upsert({
    where: {
      userId_spaceId: {
        userId: auditorUser.id,
        spaceId: goldSpace.id,
      },
    },
    update: {},
    create: {
      userId: auditorUser.id,
      spaceId: goldSpace.id,
      role: SPACE_ROLE_AUDITOR,
    },
  });

  // Add member (read-only) to both spaces
  await prisma.spaceUser.upsert({
    where: {
      userId_spaceId: {
        userId: memberUser.id,
        spaceId: goldSpace.id,
      },
    },
    update: {},
    create: {
      userId: memberUser.id,
      spaceId: goldSpace.id,
      role: SPACE_ROLE_MEMBER,
    },
  });

  await prisma.spaceUser.upsert({
    where: {
      userId_spaceId: {
        userId: memberUser.id,
        spaceId: silverSpace.id,
      },
    },
    update: {},
    create: {
      userId: memberUser.id,
      spaceId: silverSpace.id,
      role: SPACE_ROLE_MEMBER,
    },
  });

  // Add admin as space admin to silver space
  await prisma.spaceUser.upsert({
    where: {
      userId_spaceId: {
        userId: admin.id,
        spaceId: silverSpace.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      spaceId: silverSpace.id,
      role: SPACE_ROLE_ADMIN,
    },
  });

  console.log('✓ Added users to spaces with appropriate roles');

  // Create Crypto Exchange Reserves space
  console.log('🌱 Creating Crypto Exchange Reserves space...');

  const exchangeSpaceName = 'Crypto Exchange Reserves';
  const exchangeSpace = await prisma.space.upsert({
    where: { id: 'demo-exchange-space' },
    update: {
      name: exchangeSpaceName,
      description: 'Cryptocurrency exchange user balances using Merkle Sum Trees for privacy-preserving proof of reserves',
      slug: slugify(exchangeSpaceName),
      apiIdentifier: slugify(exchangeSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
      isActive: true,
    },
    create: {
      id: 'demo-exchange-space',
      name: exchangeSpaceName,
      slug: slugify(exchangeSpaceName),
      description: 'Cryptocurrency exchange user balances using Merkle Sum Trees for privacy-preserving proof of reserves',
      createdBy: owner.id,
      isActive: true,
      apiIdentifier: slugify(exchangeSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
    },
  });

  console.log('✓ Created space:', exchangeSpace.name);

  // Add owner as space admin
  await prisma.spaceUser.upsert({
    where: {
      userId_spaceId: {
        userId: owner.id,
        spaceId: exchangeSpace.id,
      },
    },
    update: {},
    create: {
      userId: owner.id,
      spaceId: exchangeSpace.id,
      role: SPACE_ROLE_ADMIN,
    },
  });

  // API keys are now managed via IntegrationApiKey (per-integration), not the old ApiKey model

  // Create audit log
  await prisma.auditLog.create({
    data: {
      action: enumKey<AuditAction>('CREATE'),
      resourceType: enumKey<ResourceType>('SPACE'),
      resourceId: goldSpace.id,
      userEmail: admin.email,
      spaceId: goldSpace.id,
      ipAddress: '127.0.0.1',
      userAgent: 'Seed Script',
      details: serializeJson({ message: 'Space created during database seeding' }),
    },
  });

  console.log('✓ Created audit log entries');

  // Create initial settings
  const initialSettings = [
    {
      key: 'signup_enabled',
      value: 'true',
      description: 'Allow new users to sign up for accounts',
    },
    {
      key: 'allow_self_registration',
      value: 'true',
      description: 'Allow users to register without invitation',
    },
    {
      key: 'require_email_verification',
      value: 'false',
      description: 'Require email verification for new accounts',
    },
    {
      key: 'maintenance_mode',
      value: 'false',
      description: 'Put the application in maintenance mode',
    },
    {
      key: 'app_name',
      value: 'AuraReserve',
      description: 'Application name displayed in UI',
    },
    {
      key: 'max_api_keys_per_space',
      value: '10',
      description: 'Maximum number of API keys allowed per space',
    },
  ];

  await Promise.all(
    initialSettings.map(({ key, value, description }) =>
      prisma.setting.upsert({
        where: { key },
        update: { value, description },
        create: { key, value, description, updatedBy: owner.id },
      })
    )
  );

  console.log('✓ Created initial settings');

  // Seed integration catalog
  // Map lowercase enum values back to uppercase keys for Prisma runtime
  const artifactTypeMap: Record<string, ArtifactType> = {
    value: enumKey<ArtifactType>('VALUE'),
    merkle_tree: enumKey<ArtifactType>('MERKLE_TREE'),
    merkle_sum_tree: enumKey<ArtifactType>('MERKLE_SUM_TREE'),
    sparse_merkle_tree: enumKey<ArtifactType>('SPARSE_MERKLE_TREE'),
  };
  const triggerMap: Record<string, IntegrationTrigger> = {
    MANUAL: enumKey<IntegrationTrigger>('MANUAL'),
    CRON: enumKey<IntegrationTrigger>('CRON'),
    ON_CHANGE: enumKey<IntegrationTrigger>('ON_CHANGE'),
  };

  for (const integration of defaultIntegrations) {
    const mappedArtifactTypes = integration.supportedArtifactTypes.map(
      (t) => artifactTypeMap[t] ?? t
    ) as ArtifactType[];
    const mappedTriggers = integration.supportedTriggers.map(
      (t) => triggerMap[t] ?? t
    ) as IntegrationTrigger[];
    const mappedDefaultTrigger = integration.defaultTrigger
      ? (triggerMap[integration.defaultTrigger] ?? integration.defaultTrigger)
      : null;

    await prisma.integration.upsert({
      where: { key: integration.key },
      update: {
        displayName: integration.displayName,
        description: integration.description,
        supportsInput: integration.supportsInput,
        supportsOutput: integration.supportsOutput,
        supportedArtifactTypes: mappedArtifactTypes,
        isFree: integration.isFree,
        supportedTriggers: mappedTriggers,
        configSchema: serializeJson(integration.configSchema),
        defaultTrigger: mappedDefaultTrigger,
        defaultSchedule: integration.defaultSchedule,
        isAvailableSelfHosted: integration.isAvailableSelfHosted,
        bundleKey: integration.bundleKey,
      },
      create: {
        key: integration.key,
        displayName: integration.displayName,
        description: integration.description,
        supportsInput: integration.supportsInput,
        supportsOutput: integration.supportsOutput,
        supportedArtifactTypes: mappedArtifactTypes,
        isFree: integration.isFree,
        supportedTriggers: mappedTriggers,
        configSchema: serializeJson(integration.configSchema),
        defaultTrigger: mappedDefaultTrigger,
        defaultSchedule: integration.defaultSchedule,
        isAvailableSelfHosted: integration.isAvailableSelfHosted,
        bundleKey: integration.bundleKey,
      },
    });
  }

  console.log(`✓ Seeded ${defaultIntegrations.length} integrations (${defaultIntegrations.filter(i => i.isFree).length} free, ${defaultIntegrations.filter(i => !i.isFree).length} paid)`);

  // ── Look up integration records by key ──────────────────────────────
  const manualIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'manual' } });
  const apiServeIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'api-serve' } });
  const webhookIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'webhook' } });
  const avalancheIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'avalanche' } });
  const apiFetchIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'api-fetch' } });
  const blockchainReadIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'blockchain-read' } });
  const apiIngestIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'api' } });
  const rwaXyzIntegration = await prisma.integration.findUniqueOrThrow({ where: { key: 'rwa-xyz' } });

  // ── Gold Space: DataStreams, Integrations, Entries ───────────────────

  // Gold stream: manual input → API serve + Avalanche output
  const goldStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: goldSpace.id, slug: 'gold-bars' } },
    update: {},
    create: {
      spaceId: goldSpace.id,
      name: 'Gold Bars',
      slug: 'gold-bars',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'gold',
      unit: 'troy oz',
      description: 'Physical gold bar inventory tracked in troy ounces',
      createdBy: admin.id,
    },
  });

  const goldCoinsStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: goldSpace.id, slug: 'gold-coins' } },
    update: {},
    create: {
      spaceId: goldSpace.id,
      name: 'Gold Coins',
      slug: 'gold-coins',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'gold',
      unit: 'troy oz',
      description: 'Gold coin collection tracked in troy ounces',
      createdBy: admin.id,
    },
  });

  console.log('✓ Created gold space data streams');

  // Gold space: manual input integration
  const goldManualInput = await upsertSpaceIntegration({ spaceId: goldSpace.id, integrationId: manualIntegration.id, streamId: goldStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  await upsertSpaceIntegration({ spaceId: goldSpace.id, integrationId: manualIntegration.id, streamId: goldCoinsStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  // Gold space: API serve output
  await upsertSpaceIntegration({ spaceId: goldSpace.id, integrationId: apiServeIntegration.id, streamId: goldStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 60 }) });

  // Gold space: Avalanche output (paid — needs entitlement)
  await prisma.integrationEntitlement.upsert({
    where: { spaceId_integrationKey: { spaceId: goldSpace.id, integrationKey: 'avalanche' } },
    update: {},
    create: {
      spaceId: goldSpace.id,
      integrationKey: 'avalanche',
      status: ENTITLEMENT_STATUS_ACTIVE,
      source: 'seed',
    },
  });

  await upsertSpaceIntegration({ spaceId: goldSpace.id, integrationId: avalancheIntegration.id, streamId: goldStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_MANUAL, config: serializeJson({ rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', contractAddress: '0x0000000000000000000000000000000000000000', privateKey: 'encrypted:demo' }) });

  console.log('✓ Created gold space integrations (input: manual, output: api-serve + avalanche)');

  // ── Helper: generate monthly timestamps for the last N months ─────
  const now = new Date();
  const MONTHS = 24; // 2 years of data

  function monthsAgoDate(m: number): Date {
    const d = new Date(now);
    d.setMonth(d.getMonth() - (MONTHS - m));
    d.setDate(1);
    d.setHours(10, 0, 0, 0);
    return d;
  }

  // Seeded PRNG for reproducible "random" fluctuations
  let _seed = 42;
  function seededRandom(): number {
    _seed = (_seed * 16807 + 0) % 2147483647;
    return (_seed - 1) / 2147483646;
  }

  // ── Gold Bars: 24 monthly entries ───────────────────────────────────
  // Starts ~8000 oz, general uptrend with deliveries/withdrawals, ends ~12600 oz
  const goldBarNotes = [
    'Monthly vault inventory audit',
    'Post-delivery vault count',
    'Quarterly audit — external auditor confirmed',
    'Vault inventory after client redemption',
    'New delivery received from refinery',
    'Re-count after vault reorganization',
  ];

  let goldBarValue = 8000;
  const goldBarDeltas = [
    +250, +120, -80, +310, +50, -200, +400, +180, -150, +350, +90, -60,
    +500, -300, +420, +200, -100, +600, +150, -250, +380, +270, -120, +340,
  ];

  for (let m = 0; m < MONTHS; m++) {
    goldBarValue += goldBarDeltas[m];
    goldBarValue = Math.round(goldBarValue * 100) / 100;
    await prisma.streamEntry.create({
      data: {
        streamId: goldStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: goldBarValue,
        submittedBy: auditorUser.id,
        sourceIntegrationId: goldManualInput.id,
        isAutomated: false,
        timestamp: monthsAgoDate(m),
        notes: goldBarNotes[m % goldBarNotes.length],
        metadata: serializeJson({}),
      },
    });
  }

  // ── Gold Coins: 24 monthly entries ──────────────────────────────────
  // Starts ~180 oz, slower growth, some dips, ends ~360 oz
  let goldCoinValue = 180;
  const goldCoinDeltas = [
    +12, +8, -5, +15, +3, -10, +20, +6, +10, -8, +18, +5,
    +14, -12, +22, +9, -6, +16, +11, -4, +13, +17, -7, +19,
  ];

  for (let m = 0; m < MONTHS; m++) {
    goldCoinValue += goldCoinDeltas[m];
    goldCoinValue = Math.round(goldCoinValue * 10) / 10;
    await prisma.streamEntry.create({
      data: {
        streamId: goldCoinsStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: goldCoinValue,
        submittedBy: auditorUser.id,
        isAutomated: false,
        timestamp: monthsAgoDate(m),
        notes: m % 3 === 0 ? 'Quarterly coin audit' : 'Monthly coin inventory',
        metadata: serializeJson({}),
      },
    });
  }

  console.log(`✓ Created gold space test entries (${MONTHS} monthly gold bar + ${MONTHS} monthly gold coin entries)`);

  // ── Silver Space: DataStreams, Integrations, Entries ─────────────────

  const silverStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: silverSpace.id, slug: 'silver-bullion' } },
    update: {},
    create: {
      spaceId: silverSpace.id,
      name: 'Silver Bullion',
      slug: 'silver-bullion',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'silver',
      unit: 'troy oz',
      description: 'Physical silver bullion reserves',
      createdBy: admin.id,
    },
  });

  console.log('✓ Created silver space data stream');

  // Silver space: API fetch input (paid — needs entitlement)
  await prisma.integrationEntitlement.upsert({
    where: { spaceId_integrationKey: { spaceId: silverSpace.id, integrationKey: 'api-fetch' } },
    update: {},
    create: {
      spaceId: silverSpace.id,
      integrationKey: 'api-fetch',
      status: ENTITLEMENT_STATUS_ACTIVE,
      source: 'seed',
    },
  });

  const silverApiFetchInput = await upsertSpaceIntegration({ spaceId: silverSpace.id, integrationId: apiFetchIntegration.id, streamId: silverStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_CRON, schedule: '0 */6 * * *', config: serializeJson({ endpoint: 'https://vault-api.example.com/silver/balance', method: 'GET' }), lastRunAt: new Date(now.getTime() - 6 * 3600000), lastRunStatus: 'success' });

  // Silver space: webhook output (paid — needs entitlement)
  await prisma.integrationEntitlement.upsert({
    where: { spaceId_integrationKey: { spaceId: silverSpace.id, integrationKey: 'webhook' } },
    update: {},
    create: {
      spaceId: silverSpace.id,
      integrationKey: 'webhook',
      status: ENTITLEMENT_STATUS_ACTIVE,
      source: 'seed',
    },
  });

  await upsertSpaceIntegration({ spaceId: silverSpace.id, integrationId: webhookIntegration.id, streamId: silverStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_ON_CHANGE, config: serializeJson({ url: 'https://hooks.example.com/silver-reserve', secret: 'whsec_demo_secret' }) });

  // Silver space: API serve output (free)
  await upsertSpaceIntegration({ spaceId: silverSpace.id, integrationId: apiServeIntegration.id, streamId: silverStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 120 }) });

  console.log('✓ Created silver space integrations (input: api-fetch, output: webhook + api-serve)');

  // Silver space: 24 monthly entries with more volatility (up and down)
  // Starts ~60000 oz, swings between ~50k-95k, ends ~88750 oz
  let silverValue = 60000;
  const silverDeltas = [
    +3500, -2000, +5000, -4500, +6000, +2500, -8000, +7000, -3000, +4000, -1500, +5500,
    -6000, +8000, +3000, -5000, +7500, -2500, +4500, -3500, +6500, +2000, -4000, +5250,
  ];
  const silverNotes = [
    'Automated fetch — delivery from Perth Mint',
    'Automated fetch — client redemption processed',
    'Automated fetch — large institutional purchase stored',
    'Automated fetch — partial vault transfer to Vault B',
    'Automated fetch — refinery delivery received',
    'Automated fetch — confirmed, no change',
    'Automated fetch — large withdrawal for ETF backing',
    'Automated fetch — new bars from Heraeus',
    'Automated fetch — redemption batch processed',
    'Automated fetch — quarterly delivery',
    'Automated fetch — minor withdrawal',
    'Automated fetch — year-end delivery',
  ];

  for (let m = 0; m < MONTHS; m++) {
    silverValue += silverDeltas[m];
    silverValue = Math.round(silverValue);
    await prisma.streamEntry.create({
      data: {
        streamId: silverStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: silverValue,
        submittedBy: admin.id,
        sourceIntegrationId: silverApiFetchInput.id,
        isAutomated: true,
        timestamp: monthsAgoDate(m),
        notes: silverNotes[m % silverNotes.length],
        metadata: serializeJson({}),
      },
    });
  }

  console.log(`✓ Created silver space test entries (${MONTHS} monthly entries)`);

  // ── Crypto Exchange Space: DataStreams, Integrations, Entries ────────

  const btcStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: exchangeSpace.id, slug: 'btc-reserves' } },
    update: {},
    create: {
      spaceId: exchangeSpace.id,
      name: 'BTC Reserves',
      slug: 'btc-reserves',
      artifactType: ARTIFACT_TYPE_MERKLE_SUM_TREE,
      assetType: 'crypto',
      unit: 'BTC',
      valueField: 'balance',
      description: 'Bitcoin user balances verified via Merkle Sum Tree',
      createdBy: owner.id,
    },
  });

  const ethStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: exchangeSpace.id, slug: 'eth-reserves' } },
    update: {},
    create: {
      spaceId: exchangeSpace.id,
      name: 'ETH Reserves',
      slug: 'eth-reserves',
      artifactType: ARTIFACT_TYPE_MERKLE_SUM_TREE,
      assetType: 'crypto',
      unit: 'ETH',
      valueField: 'balance',
      description: 'Ethereum user balances verified via Merkle Sum Tree',
      createdBy: owner.id,
    },
  });

  console.log('✓ Created crypto exchange data streams (BTC + ETH)');

  // Crypto exchange: API ingest input (paid) + blockchain read (paid)
  await prisma.integrationEntitlement.upsert({
    where: { spaceId_integrationKey: { spaceId: exchangeSpace.id, integrationKey: 'api' } },
    update: {},
    create: {
      spaceId: exchangeSpace.id,
      integrationKey: 'api',
      status: ENTITLEMENT_STATUS_ACTIVE,
      source: 'seed',
    },
  });

  const btcApiInput = await upsertSpaceIntegration({ spaceId: exchangeSpace.id, integrationId: apiIngestIntegration.id, streamId: btcStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  await upsertSpaceIntegration({ spaceId: exchangeSpace.id, integrationId: apiIngestIntegration.id, streamId: ethStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  // Blockchain read for on-chain verification
  await prisma.integrationEntitlement.upsert({
    where: { spaceId_integrationKey: { spaceId: exchangeSpace.id, integrationKey: 'blockchain-read' } },
    update: {},
    create: {
      spaceId: exchangeSpace.id,
      integrationKey: 'blockchain-read',
      status: ENTITLEMENT_STATUS_ACTIVE,
      source: 'seed',
    },
  });

  await upsertSpaceIntegration({ spaceId: exchangeSpace.id, integrationId: blockchainReadIntegration.id, streamId: btcStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_CRON, schedule: '0 */6 * * *', config: serializeJson({ rpcUrl: 'https://btc-rpc.example.com', contractAddress: '0x0000000000000000000000000000000000000000' }) });

  // Crypto exchange: API serve output (free) + RWA.xyz output (paid)
  await upsertSpaceIntegration({ spaceId: exchangeSpace.id, integrationId: apiServeIntegration.id, streamId: btcStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 300 }) });

  await upsertSpaceIntegration({ spaceId: exchangeSpace.id, integrationId: apiServeIntegration.id, streamId: ethStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 300 }) });

  console.log('✓ Created crypto exchange integrations (input: api-ingest + blockchain-read, output: api-serve)');

  // Crypto exchange: 24 monthly BTC merkle sum tree entries
  // BTC: starts ~800 BTC, grows with user adoption, some dips from withdrawals, ends ~1290 BTC
  let btcBalance = 800;
  let btcUsers = 8500;
  let btcBlock = 780000;
  const btcDeltas = [
    +35, +20, -15, +45, +10, -30, +55, +25, -20, +40, +15, -10,
    +60, -40, +50, +30, -25, +70, +20, -35, +45, +35, -15, +42.75,
  ];
  const btcUserDeltas = [
    +320, +180, -50, +420, +90, -150, +500, +210, -80, +380, +120, -30,
    +550, -200, +450, +250, -100, +620, +170, -180, +400, +300, -70, +383,
  ];

  function fakeHash(idx: number, prefix: string): string {
    const chars = '0123456789abcdef';
    let h = '';
    _seed = (_seed * 16807 + idx) % 2147483647;
    for (let i = 0; i < 64; i++) {
      h += chars[Math.abs((_seed * (i + 1) * (idx + 1)) % chars.length)];
    }
    return h;
  }

  let latestBtcEntry: any = null;
  for (let m = 0; m < MONTHS; m++) {
    btcBalance += btcDeltas[m];
    btcBalance = Math.round(btcBalance * 100) / 100;
    btcUsers += btcUserDeltas[m];
    btcBlock += 4320; // ~1 month of BTC blocks

    const rootHash = fakeHash(m, 'btc');
    const streamEntry = await prisma.streamEntry.create({
      data: {
        streamId: btcStream.id,
        artifactType: ARTIFACT_TYPE_MERKLE_SUM_TREE,
        value: btcBalance,
        artifactData: serializeJson({
          rootHash,
          totalBalance: btcBalance,
          userCount: btcUsers,
          treeDepth: 14,
        }),
        submittedBy: owner.id,
        sourceIntegrationId: btcApiInput.id,
        isAutomated: true,
        timestamp: monthsAgoDate(m),
        notes: 'Monthly proof-of-reserve snapshot',
        metadata: serializeJson({ snapshotBlock: btcBlock }),
      },
    });

    if (m === MONTHS - 1) latestBtcEntry = { id: streamEntry.id, rootHash };
  }

  // Add sample leaves for the latest BTC entry
  if (latestBtcEntry) {
    const sampleLeaves = [
      { leafId: 'user_001', balance: 2.5 },
      { leafId: 'user_002', balance: 0.75 },
      { leafId: 'user_003', balance: 15.0 },
      { leafId: 'user_004', balance: 0.01 },
      { leafId: 'user_005', balance: 5.25 },
      { leafId: 'user_006', balance: 0.1 },
      { leafId: 'user_007', balance: 42.0 },
      { leafId: 'user_008', balance: 0.005 },
    ];

    for (let i = 0; i < sampleLeaves.length; i++) {
      const leaf = sampleLeaves[i];
      await prisma.streamEntryLeaf.create({
        data: {
          entryId: latestBtcEntry.id,
          leafId: leaf.leafId,
          leafHash: `hash_${leaf.leafId}_${latestBtcEntry.rootHash.substring(0, 8)}`,
          value: leaf.balance,
          leafData: serializeJson({ userId: leaf.leafId, balance: leaf.balance, currency: 'BTC' }),
          leafIndex: i,
        },
      });
    }
  }

  // Crypto exchange: 24 monthly ETH merkle sum tree entries
  // ETH: starts ~25000, more volatile, some big swings, ends ~43250 ETH
  let ethBalance = 25000;
  let ethUsers = 18000;
  let ethBlock = 18000000;
  const ethDeltas = [
    +1200, +800, -2000, +1500, +600, -1200, +2500, +1000, -1800, +2000, +700, -500,
    +3000, -2500, +2200, +1300, -800, +3500, +900, -1500, +2800, +1500, -1000, +2450.5,
  ];
  const ethUserDeltas = [
    +500, +350, -200, +600, +150, -300, +750, +400, -250, +550, +200, -100,
    +800, -500, +650, +350, -200, +900, +250, -400, +700, +450, -150, +602,
  ];

  for (let m = 0; m < MONTHS; m++) {
    ethBalance += ethDeltas[m];
    ethBalance = Math.round(ethBalance * 10) / 10;
    ethUsers += ethUserDeltas[m];
    ethBlock += 216000; // ~1 month of ETH blocks

    const rootHash = fakeHash(m + 100, 'eth');
    await prisma.streamEntry.create({
      data: {
        streamId: ethStream.id,
        artifactType: ARTIFACT_TYPE_MERKLE_SUM_TREE,
        value: ethBalance,
        artifactData: serializeJson({
          rootHash,
          totalBalance: ethBalance,
          userCount: ethUsers,
          treeDepth: 15,
        }),
        submittedBy: owner.id,
        sourceIntegrationId: btcApiInput.id,
        isAutomated: true,
        timestamp: monthsAgoDate(m),
        notes: 'Monthly proof-of-reserve snapshot',
        metadata: serializeJson({ snapshotBlock: ethBlock }),
      },
    });
  }

  console.log(`✓ Created crypto exchange test entries (${MONTHS} monthly BTC + ${MONTHS} monthly ETH snapshots with sample leaves)`);

  // ══════════════════════════════════════════════════════════════════════
  // SPACE 4: Emerald Vault Geneva
  // ══════════════════════════════════════════════════════════════════════
  console.log('🌱 Creating Emerald Vault Geneva space...');

  const emeraldSpaceName = 'Emerald Vault Geneva';
  const emeraldSpace = await prisma.space.upsert({
    where: { id: 'demo-emerald-space' },
    update: {
      name: emeraldSpaceName,
      description: 'Certified gemstone reserves stored in Geneva freeport — each stone tracked by GIA certificate hash',
      slug: slugify(emeraldSpaceName),
      apiIdentifier: slugify(emeraldSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
      isActive: true,
    },
    create: {
      id: 'demo-emerald-space',
      name: emeraldSpaceName,
      slug: slugify(emeraldSpaceName),
      description: 'Certified gemstone reserves stored in Geneva freeport — each stone tracked by GIA certificate hash',
      createdBy: admin.id,
      isActive: true,
      apiIdentifier: slugify(emeraldSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
    },
  });

  // Add auditor to emerald space
  await prisma.spaceUser.upsert({
    where: { userId_spaceId: { userId: auditorUser.id, spaceId: emeraldSpace.id } },
    update: {},
    create: { userId: auditorUser.id, spaceId: emeraldSpace.id, role: SPACE_ROLE_AUDITOR },
  });

  console.log('✓ Created space:', emeraldSpace.name);

  // Emerald stream: merkle_tree — each leaf is a certified gemstone
  const emeraldStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: emeraldSpace.id, slug: 'certified-emeralds' } },
    update: {},
    create: {
      spaceId: emeraldSpace.id,
      name: 'Certified Emeralds',
      slug: 'certified-emeralds',
      artifactType: ARTIFACT_TYPE_MERKLE_TREE,
      assetType: 'gemstones',
      unit: 'carats',
      description: 'Individual GIA-certified emeralds, each stone a merkle leaf',
      createdBy: admin.id,
    },
  });

  const rubyStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: emeraldSpace.id, slug: 'certified-rubies' } },
    update: {},
    create: {
      spaceId: emeraldSpace.id,
      name: 'Certified Rubies',
      slug: 'certified-rubies',
      artifactType: ARTIFACT_TYPE_MERKLE_TREE,
      assetType: 'gemstones',
      unit: 'carats',
      description: 'Individual GIA-certified rubies tracked in merkle tree',
      createdBy: admin.id,
    },
  });

  // Emerald space: manual input + API serve output
  const emeraldManualInput = await upsertSpaceIntegration({ spaceId: emeraldSpace.id, integrationId: manualIntegration.id, streamId: emeraldStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  await upsertSpaceIntegration({ spaceId: emeraldSpace.id, integrationId: manualIntegration.id, streamId: rubyStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  await upsertSpaceIntegration({ spaceId: emeraldSpace.id, integrationId: apiServeIntegration.id, streamId: emeraldStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 30 }) });

  console.log('✓ Created emerald vault integrations (input: manual, output: api-serve)');

  // Emerald: 24 monthly merkle tree entries — stone count grows from ~45 to ~120
  let emeraldStones = 45;
  let emeraldCarats = 112.5; // avg ~2.5ct per stone
  const emeraldStoneDeltas = [
    +3, +2, -1, +4, +1, -2, +5, +3, +2, -1, +4, +2,
    +3, -2, +5, +3, +1, +4, +2, -1, +6, +3, -2, +4,
  ];

  for (let m = 0; m < MONTHS; m++) {
    emeraldStones += emeraldStoneDeltas[m];
    const avgCarat = 2.2 + seededRandom() * 0.8;
    emeraldCarats += emeraldStoneDeltas[m] * avgCarat;
    emeraldCarats = Math.round(emeraldCarats * 10) / 10;

    const rootHash = fakeHash(m + 200, 'emerald');
    const streamEntry = await prisma.streamEntry.create({
      data: {
        streamId: emeraldStream.id,
        artifactType: ARTIFACT_TYPE_MERKLE_TREE,
        value: emeraldCarats,
        artifactData: serializeJson({
          rootHash,
          stoneCount: emeraldStones,
          totalCarats: emeraldCarats,
          treeDepth: 7,
        }),
        submittedBy: auditorUser.id,
        sourceIntegrationId: emeraldManualInput.id,
        isAutomated: false,
        timestamp: monthsAgoDate(m),
        notes: emeraldStoneDeltas[m] > 0
          ? `Added ${emeraldStoneDeltas[m]} certified stones from dealer`
          : emeraldStoneDeltas[m] < 0
            ? `Removed ${Math.abs(emeraldStoneDeltas[m])} stones — sold to collector`
            : 'Monthly vault audit — no change',
        metadata: serializeJson({}),
      },
    });

    // Add sample leaves for the latest entry
    if (m === MONTHS - 1) {
      const sampleStones = [
        { leafId: 'GIA-EM-2024-001', carats: 3.2, color: 'vivid green', clarity: 'VS1' },
        { leafId: 'GIA-EM-2024-002', carats: 1.8, color: 'deep green', clarity: 'VS2' },
        { leafId: 'GIA-EM-2024-003', carats: 5.1, color: 'vivid green', clarity: 'VVS2' },
        { leafId: 'GIA-EM-2024-004', carats: 2.4, color: 'medium green', clarity: 'SI1' },
        { leafId: 'GIA-EM-2023-089', carats: 4.7, color: 'vivid green', clarity: 'VVS1' },
        { leafId: 'GIA-EM-2023-112', carats: 1.2, color: 'light green', clarity: 'VS1' },
      ];

      for (let i = 0; i < sampleStones.length; i++) {
        const stone = sampleStones[i];
        await prisma.streamEntryLeaf.create({
          data: {
            entryId: streamEntry.id,
            leafId: stone.leafId,
            leafHash: fakeHash(i + 300, 'stone'),
            value: stone.carats,
            leafData: serializeJson({ certificateId: stone.leafId, carats: stone.carats, color: stone.color, clarity: stone.clarity }),
            leafIndex: i,
          },
        });
      }
    }
  }

  // Ruby stream: 24 monthly entries — smaller collection, ~15 to ~40 stones
  let rubyStones = 15;
  let rubyCarats = 22.5;
  const rubyStoneDeltas = [
    +1, +2, 0, +1, -1, +2, +1, 0, +2, -1, +1, +2,
    +1, -1, +2, +1, 0, +3, +1, -1, +2, +1, 0, +2,
  ];

  for (let m = 0; m < MONTHS; m++) {
    rubyStones += rubyStoneDeltas[m];
    const avgCarat = 1.3 + seededRandom() * 0.6;
    rubyCarats += rubyStoneDeltas[m] * avgCarat;
    rubyCarats = Math.round(rubyCarats * 10) / 10;

    const rootHash = fakeHash(m + 400, 'ruby');
    await prisma.streamEntry.create({
      data: {
        streamId: rubyStream.id,
        artifactType: ARTIFACT_TYPE_MERKLE_TREE,
        value: rubyCarats,
        artifactData: serializeJson({
          rootHash,
          stoneCount: rubyStones,
          totalCarats: rubyCarats,
          treeDepth: 6,
        }),
        submittedBy: auditorUser.id,
        isAutomated: false,
        timestamp: monthsAgoDate(m),
        notes: rubyStoneDeltas[m] > 0
          ? `Added ${rubyStoneDeltas[m]} certified rubies`
          : rubyStoneDeltas[m] < 0
            ? `Removed ${Math.abs(rubyStoneDeltas[m])} ruby — private sale`
            : 'Monthly vault audit — no change',
        metadata: serializeJson({}),
      },
    });
  }

  console.log(`✓ Created emerald vault test entries (${MONTHS} monthly emerald + ${MONTHS} monthly ruby entries)`);

  // ══════════════════════════════════════════════════════════════════════
  // SPACE 5: TrueUSD Stablecoin Backing
  // ══════════════════════════════════════════════════════════════════════
  console.log('🌱 Creating TrueUSD Stablecoin Backing space...');

  const stablecoinSpaceName = 'TrueUSD Backing';
  const stablecoinSpace = await prisma.space.upsert({
    where: { id: 'demo-stablecoin-space' },
    update: {
      name: stablecoinSpaceName,
      description: 'Proof-of-reserves for TrueUSD stablecoin — mixed collateral backing (cash, treasuries, gold)',
      slug: slugify(stablecoinSpaceName),
      apiIdentifier: slugify(stablecoinSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
      isActive: true,
    },
    create: {
      id: 'demo-stablecoin-space',
      name: stablecoinSpaceName,
      slug: slugify(stablecoinSpaceName),
      description: 'Proof-of-reserves for TrueUSD stablecoin — mixed collateral backing (cash, treasuries, gold)',
      createdBy: owner.id,
      isActive: true,
      apiIdentifier: slugify(stablecoinSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
    },
  });

  await prisma.spaceUser.upsert({
    where: { userId_spaceId: { userId: owner.id, spaceId: stablecoinSpace.id } },
    update: {},
    create: { userId: owner.id, spaceId: stablecoinSpace.id, role: SPACE_ROLE_ADMIN },
  });
  await prisma.spaceUser.upsert({
    where: { userId_spaceId: { userId: auditorUser.id, spaceId: stablecoinSpace.id } },
    update: {},
    create: { userId: auditorUser.id, spaceId: stablecoinSpace.id, role: SPACE_ROLE_AUDITOR },
  });

  console.log('✓ Created space:', stablecoinSpace.name);

  // 3 streams: cash reserves, US treasuries, gold collateral
  const cashStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: stablecoinSpace.id, slug: 'cash-reserves' } },
    update: {},
    create: {
      spaceId: stablecoinSpace.id,
      name: 'Cash Reserves',
      slug: 'cash-reserves',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'other',
      unit: 'USD',
      description: 'Cash and cash equivalents held in custodial bank accounts',
      createdBy: owner.id,
    },
  });

  const treasuryStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: stablecoinSpace.id, slug: 'us-treasuries' } },
    update: {},
    create: {
      spaceId: stablecoinSpace.id,
      name: 'US Treasuries',
      slug: 'us-treasuries',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'other',
      unit: 'USD',
      description: 'Short-term US Treasury bills held as collateral',
      createdBy: owner.id,
    },
  });

  const goldCollateralStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: stablecoinSpace.id, slug: 'gold-collateral' } },
    update: {},
    create: {
      spaceId: stablecoinSpace.id,
      name: 'Gold Collateral',
      slug: 'gold-collateral',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'gold',
      unit: 'USD',
      description: 'Gold reserves valued in USD as stablecoin backing',
      createdBy: owner.id,
    },
  });

  // Stablecoin integrations: blockchain-read input + api-fetch, avalanche + api-serve + rwa.xyz output
  // Entitlements for paid integrations
  for (const key of ['blockchain-read', 'api-fetch', 'avalanche', 'rwa-xyz']) {
    await prisma.integrationEntitlement.upsert({
      where: { spaceId_integrationKey: { spaceId: stablecoinSpace.id, integrationKey: key } },
      update: {},
      create: { spaceId: stablecoinSpace.id, integrationKey: key, status: ENTITLEMENT_STATUS_ACTIVE, source: 'seed' },
    });
  }

  // Blockchain read for on-chain token supply verification
  const stablecoinBcInput = await upsertSpaceIntegration({ spaceId: stablecoinSpace.id, integrationId: blockchainReadIntegration.id, streamId: cashStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_CRON, schedule: '0 */4 * * *', config: serializeJson({ rpcUrl: 'https://mainnet.infura.io/v3/demo', contractAddress: '0x0000000000000000000000000000000000000001', tokenDecimals: 18 }) });

  // API fetch for bank balance
  await upsertSpaceIntegration({ spaceId: stablecoinSpace.id, integrationId: apiFetchIntegration.id, streamId: treasuryStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_CRON, schedule: '0 8 * * 1', // weekly Monday 8am
      config: serializeJson({ endpoint: 'https://custody-api.example.com/treasuries/balance', method: 'GET' }) });

  // Manual for gold collateral
  await upsertSpaceIntegration({ spaceId: stablecoinSpace.id, integrationId: manualIntegration.id, streamId: goldCollateralStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  // Outputs: API serve (all streams), Avalanche (cash), RWA.xyz (cash)
  for (const stream of [cashStream, treasuryStream, goldCollateralStream]) {
    await upsertSpaceIntegration({ spaceId: stablecoinSpace.id, integrationId: apiServeIntegration.id, streamId: stream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 200 }) });
  }

  await upsertSpaceIntegration({ spaceId: stablecoinSpace.id, integrationId: avalancheIntegration.id, streamId: cashStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_ON_CHANGE, config: serializeJson({ rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', contractAddress: '0x0000000000000000000000000000000000000002', privateKey: 'encrypted:demo' }) });

  await upsertSpaceIntegration({ spaceId: stablecoinSpace.id, integrationId: rwaXyzIntegration.id, streamId: cashStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_ON_CHANGE, config: serializeJson({ apiKey: 'rwa_demo_key', assetId: 'trueusd-collateral' }) });

  console.log('✓ Created stablecoin space integrations');

  // Cash reserves: starts ~150M, grows to ~420M with volatility
  let cashValue = 150_000_000;
  const cashDeltas = [
    +12_000_000, +8_000_000, -5_000_000, +18_000_000, +6_000_000, -10_000_000,
    +22_000_000, +14_000_000, -8_000_000, +16_000_000, -12_000_000, +20_000_000,
    +25_000_000, -15_000_000, +18_000_000, +10_000_000, -7_000_000, +30_000_000,
    +12_000_000, -20_000_000, +28_000_000, +15_000_000, -8_000_000, +22_000_000,
  ];

  for (let m = 0; m < MONTHS; m++) {
    cashValue += cashDeltas[m];
    await prisma.streamEntry.create({
      data: {
        streamId: cashStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: cashValue,
        submittedBy: owner.id,
        sourceIntegrationId: stablecoinBcInput.id,
        isAutomated: true,
        timestamp: monthsAgoDate(m),
        notes: cashDeltas[m] > 0 ? 'Net minting — collateral increased' : 'Net redemption — collateral decreased',
        metadata: serializeJson({}),
      },
    });
  }

  // Treasuries: starts ~80M, grows to ~250M
  let treasuryValue = 80_000_000;
  const treasuryDeltas = [
    +5_000_000, +3_000_000, +8_000_000, -2_000_000, +10_000_000, +4_000_000,
    -3_000_000, +12_000_000, +6_000_000, -4_000_000, +8_000_000, +5_000_000,
    +15_000_000, -8_000_000, +10_000_000, +7_000_000, +3_000_000, +12_000_000,
    -5_000_000, +9_000_000, +14_000_000, -6_000_000, +8_000_000, +10_000_000,
  ];

  for (let m = 0; m < MONTHS; m++) {
    treasuryValue += treasuryDeltas[m];
    await prisma.streamEntry.create({
      data: {
        streamId: treasuryStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: treasuryValue,
        submittedBy: owner.id,
        isAutomated: true,
        timestamp: monthsAgoDate(m),
        notes: 'Weekly T-bill portfolio valuation',
        metadata: serializeJson({}),
      },
    });
  }

  // Gold collateral: starts ~20M USD, grows modestly to ~35M
  let goldCollateralValue = 20_000_000;
  const goldCollateralDeltas = [
    +500_000, +300_000, -200_000, +800_000, +400_000, -600_000,
    +1_000_000, +200_000, +500_000, -300_000, +700_000, +400_000,
    +1_200_000, -800_000, +600_000, +900_000, -400_000, +1_500_000,
    +300_000, -500_000, +1_100_000, +700_000, -300_000, +800_000,
  ];

  for (let m = 0; m < MONTHS; m++) {
    goldCollateralValue += goldCollateralDeltas[m];
    await prisma.streamEntry.create({
      data: {
        streamId: goldCollateralStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: goldCollateralValue,
        submittedBy: auditorUser.id,
        isAutomated: false,
        timestamp: monthsAgoDate(m),
        notes: 'Gold collateral mark-to-market valuation',
        metadata: serializeJson({}),
      },
    });
  }

  console.log(`✓ Created stablecoin test entries (${MONTHS} monthly x 3 streams = ${MONTHS * 3} entries)`);

  // ══════════════════════════════════════════════════════════════════════
  // SPACE 6: Platinum Group Metals — Industrial Supply
  // ══════════════════════════════════════════════════════════════════════
  console.log('🌱 Creating Platinum Group Metals space...');

  const pgmSpaceName = 'PGM Industrial Supply';
  const pgmSpace = await prisma.space.upsert({
    where: { id: 'demo-pgm-space' },
    update: {
      name: pgmSpaceName,
      description: 'Platinum and palladium reserves for automotive catalyst supply chain',
      slug: slugify(pgmSpaceName),
      apiIdentifier: slugify(pgmSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
      isActive: true,
    },
    create: {
      id: 'demo-pgm-space',
      name: pgmSpaceName,
      slug: slugify(pgmSpaceName),
      description: 'Platinum and palladium reserves for automotive catalyst supply chain',
      createdBy: admin.id,
      isActive: true,
      apiIdentifier: slugify(pgmSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
    },
  });

  await prisma.spaceUser.upsert({
    where: { userId_spaceId: { userId: admin.id, spaceId: pgmSpace.id } },
    update: {},
    create: { userId: admin.id, spaceId: pgmSpace.id, role: SPACE_ROLE_ADMIN },
  });
  await prisma.spaceUser.upsert({
    where: { userId_spaceId: { userId: memberUser.id, spaceId: pgmSpace.id } },
    update: {},
    create: { userId: memberUser.id, spaceId: pgmSpace.id, role: SPACE_ROLE_MEMBER },
  });

  console.log('✓ Created space:', pgmSpace.name);

  const platinumStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: pgmSpace.id, slug: 'platinum-sponge' } },
    update: {},
    create: {
      spaceId: pgmSpace.id,
      name: 'Platinum Sponge',
      slug: 'platinum-sponge',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'platinum',
      unit: 'troy oz',
      description: 'Platinum sponge inventory for catalyst manufacturing',
      createdBy: admin.id,
    },
  });

  const palladiumStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: pgmSpace.id, slug: 'palladium-ingots' } },
    update: {},
    create: {
      spaceId: pgmSpace.id,
      name: 'Palladium Ingots',
      slug: 'palladium-ingots',
      artifactType: ARTIFACT_TYPE_VALUE,
      assetType: 'palladium',
      unit: 'troy oz',
      description: 'Palladium ingot reserves for automotive industry',
      createdBy: admin.id,
    },
  });

  // PGM: API fetch input (warehouse management system) + webhook output to supply chain
  for (const key of ['api-fetch', 'webhook']) {
    await prisma.integrationEntitlement.upsert({
      where: { spaceId_integrationKey: { spaceId: pgmSpace.id, integrationKey: key } },
      update: {},
      create: { spaceId: pgmSpace.id, integrationKey: key, status: ENTITLEMENT_STATUS_ACTIVE, source: 'seed' },
    });
  }

  const ptApiFetchInput = await upsertSpaceIntegration({ spaceId: pgmSpace.id, integrationId: apiFetchIntegration.id, streamId: platinumStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_CRON, schedule: '0 6 * * *', config: serializeJson({ endpoint: 'https://wms.pgm-supply.example.com/api/platinum/balance', method: 'GET' }), lastRunAt: new Date(now.getTime() - 18 * 3600000), lastRunStatus: 'success' });

  await upsertSpaceIntegration({ spaceId: pgmSpace.id, integrationId: apiFetchIntegration.id, streamId: palladiumStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_CRON, schedule: '0 6 * * *', config: serializeJson({ endpoint: 'https://wms.pgm-supply.example.com/api/palladium/balance', method: 'GET' }), lastRunAt: new Date(now.getTime() - 18 * 3600000), lastRunStatus: 'success' });

  // Webhook output to OEM partners
  await upsertSpaceIntegration({ spaceId: pgmSpace.id, integrationId: webhookIntegration.id, streamId: platinumStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_ON_CHANGE, config: serializeJson({ url: 'https://oem-portal.example.com/webhooks/pgm', secret: 'whsec_pgm_demo' }) });

  // API serve for both
  for (const stream of [platinumStream, palladiumStream]) {
    await upsertSpaceIntegration({ spaceId: pgmSpace.id, integrationId: apiServeIntegration.id, streamId: stream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 60 }) });
  }

  console.log('✓ Created PGM integrations (input: api-fetch, output: webhook + api-serve)');

  // Platinum: starts ~3200 oz, industrial consumption + restocking, ends ~4500 oz
  let platinumValue = 3200;
  const platinumDeltas = [
    +150, -80, +200, -120, +180, -60, +250, -150, +100, +200, -90, +160,
    -200, +300, -100, +180, +120, -80, +250, -140, +200, +170, -60, +220,
  ];

  for (let m = 0; m < MONTHS; m++) {
    platinumValue += platinumDeltas[m];
    await prisma.streamEntry.create({
      data: {
        streamId: platinumStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: platinumValue,
        submittedBy: admin.id,
        sourceIntegrationId: ptApiFetchInput.id,
        isAutomated: true,
        timestamp: monthsAgoDate(m),
        notes: platinumDeltas[m] > 0 ? 'Restocking from refinery' : 'Consumed in catalyst production',
        metadata: serializeJson({}),
      },
    });
  }

  // Palladium: starts ~1800 oz, more volatile (supply crunches), ends ~2600 oz
  let palladiumValue = 1800;
  const palladiumDeltas = [
    +80, +50, -120, +150, -80, +100, -200, +250, +60, -90, +180, -40,
    +200, -150, +120, +80, -60, +300, -180, +100, +220, -70, +150, +100,
  ];

  for (let m = 0; m < MONTHS; m++) {
    palladiumValue += palladiumDeltas[m];
    await prisma.streamEntry.create({
      data: {
        streamId: palladiumStream.id,
        artifactType: ARTIFACT_TYPE_VALUE,
        value: palladiumValue,
        submittedBy: admin.id,
        isAutomated: true,
        timestamp: monthsAgoDate(m),
        notes: palladiumDeltas[m] > 0 ? 'Shipment from South Africa' : 'Drawn for OEM order fulfillment',
        metadata: serializeJson({}),
      },
    });
  }

  console.log(`✓ Created PGM test entries (${MONTHS} monthly platinum + ${MONTHS} monthly palladium entries)`);

  // ══════════════════════════════════════════════════════════════════════
  // SPACE 7: Diamond Grading House — Sparse Merkle Tree
  // ══════════════════════════════════════════════════════════════════════
  console.log('🌱 Creating Diamond Grading House space...');

  const diamondSpaceName = 'DeBeers Certified Diamonds';
  const diamondSpace = await prisma.space.upsert({
    where: { id: 'demo-diamond-space' },
    update: {
      name: diamondSpaceName,
      description: 'Diamond reserve certification using sparse merkle trees for membership proofs — verify if a specific diamond is in the reserve',
      slug: slugify(diamondSpaceName),
      apiIdentifier: slugify(diamondSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
      isActive: true,
    },
    create: {
      id: 'demo-diamond-space',
      name: diamondSpaceName,
      slug: slugify(diamondSpaceName),
      description: 'Diamond reserve certification using sparse merkle trees for membership proofs — verify if a specific diamond is in the reserve',
      createdBy: owner.id,
      isActive: true,
      apiIdentifier: slugify(diamondSpaceName),
      apiIdentifierSource: API_IDENTIFIER_SOURCE_SLUG,
    },
  });

  await prisma.spaceUser.upsert({
    where: { userId_spaceId: { userId: owner.id, spaceId: diamondSpace.id } },
    update: {},
    create: { userId: owner.id, spaceId: diamondSpace.id, role: SPACE_ROLE_ADMIN },
  });
  await prisma.spaceUser.upsert({
    where: { userId_spaceId: { userId: auditorUser.id, spaceId: diamondSpace.id } },
    update: {},
    create: { userId: auditorUser.id, spaceId: diamondSpace.id, role: SPACE_ROLE_AUDITOR },
  });

  console.log('✓ Created space:', diamondSpace.name);

  const diamondStream = await prisma.dataStream.upsert({
    where: { spaceId_slug: { spaceId: diamondSpace.id, slug: 'certified-diamonds' } },
    update: {},
    create: {
      spaceId: diamondSpace.id,
      name: 'Certified Diamonds',
      slug: 'certified-diamonds',
      artifactType: ARTIFACT_TYPE_SPARSE_MERKLE_TREE,
      assetType: 'diamonds',
      unit: 'carats',
      description: 'GIA-certified diamonds tracked via sparse merkle tree for inclusion/exclusion proofs',
      createdBy: owner.id,
    },
  });

  // Diamond space: manual input + API ingest, API serve + avalanche output
  for (const key of ['api', 'avalanche']) {
    await prisma.integrationEntitlement.upsert({
      where: { spaceId_integrationKey: { spaceId: diamondSpace.id, integrationKey: key } },
      update: {},
      create: { spaceId: diamondSpace.id, integrationKey: key, status: ENTITLEMENT_STATUS_ACTIVE, source: 'seed' },
    });
  }

  const diamondManualInput = await upsertSpaceIntegration({ spaceId: diamondSpace.id, integrationId: manualIntegration.id, streamId: diamondStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  await upsertSpaceIntegration({ spaceId: diamondSpace.id, integrationId: apiIngestIntegration.id, streamId: diamondStream.id, direction: INTEGRATION_DIR_INPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({}) });

  await upsertSpaceIntegration({ spaceId: diamondSpace.id, integrationId: apiServeIntegration.id, streamId: diamondStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, config: serializeJson({ rateLimit: 100 }) });

  await upsertSpaceIntegration({ spaceId: diamondSpace.id, integrationId: avalancheIntegration.id, streamId: diamondStream.id, direction: INTEGRATION_DIR_OUTPUT }, { status: INTEGRATION_STATUS_ACTIVE, trigger: INTEGRATION_TRIGGER_MANUAL, config: serializeJson({ rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', contractAddress: '0x0000000000000000000000000000000000000003', privateKey: 'encrypted:demo' }) });

  console.log('✓ Created diamond grading house integrations');

  // Diamond: 24 monthly sparse merkle tree snapshots
  // Starts with ~200 diamonds, grows to ~480
  // Sparse merkle tree: fixed-size tree where empty slots have default hashes
  let diamondCount = 200;
  let diamondCarats = 320.0; // avg ~1.6ct
  const diamondDeltas = [
    +8, +5, -3, +12, +4, -6, +15, +7, -4, +10, +6, -2,
    +14, -8, +11, +9, -5, +18, +6, -7, +13, +10, -3, +12,
  ];

  for (let m = 0; m < MONTHS; m++) {
    diamondCount += diamondDeltas[m];
    const avgCarat = 1.4 + seededRandom() * 0.5;
    diamondCarats += diamondDeltas[m] * avgCarat;
    diamondCarats = Math.round(diamondCarats * 10) / 10;

    const rootHash = fakeHash(m + 500, 'diamond');
    const treeSize = 1024; // fixed sparse tree size
    const streamEntry = await prisma.streamEntry.create({
      data: {
        streamId: diamondStream.id,
        artifactType: ARTIFACT_TYPE_SPARSE_MERKLE_TREE,
        value: diamondCarats,
        artifactData: serializeJson({
          rootHash,
          treeSize,
          occupiedSlots: diamondCount,
          totalCarats: diamondCarats,
          defaultLeafHash: '0000000000000000000000000000000000000000000000000000000000000000',
        }),
        submittedBy: owner.id,
        sourceIntegrationId: diamondManualInput.id,
        isAutomated: false,
        timestamp: monthsAgoDate(m),
        notes: diamondDeltas[m] > 0
          ? `Certified ${diamondDeltas[m]} new diamonds into reserve`
          : diamondDeltas[m] < 0
            ? `Released ${Math.abs(diamondDeltas[m])} diamonds — sold at auction`
            : 'Monthly snapshot — no change',
        metadata: serializeJson({}),
      },
    });

    // Sample leaves for latest entry
    if (m === MONTHS - 1) {
      const sampleDiamonds = [
        { leafId: 'GIA-DIA-2024-0001', carats: 2.01, cut: 'Excellent', color: 'D', clarity: 'IF' },
        { leafId: 'GIA-DIA-2024-0015', carats: 1.50, cut: 'Very Good', color: 'E', clarity: 'VVS1' },
        { leafId: 'GIA-DIA-2023-0422', carats: 3.75, cut: 'Excellent', color: 'D', clarity: 'VVS2' },
        { leafId: 'GIA-DIA-2023-0891', carats: 0.90, cut: 'Excellent', color: 'F', clarity: 'VS1' },
        { leafId: 'GIA-DIA-2024-0102', carats: 5.12, cut: 'Excellent', color: 'D', clarity: 'IF' },
        { leafId: 'GIA-DIA-2022-1204', carats: 1.20, cut: 'Good', color: 'G', clarity: 'VS2' },
        { leafId: 'GIA-DIA-2024-0088', carats: 2.33, cut: 'Excellent', color: 'E', clarity: 'IF' },
      ];

      for (let i = 0; i < sampleDiamonds.length; i++) {
        const d = sampleDiamonds[i];
        // Sparse merkle tree: leafIndex is the slot position in the fixed-size tree
        const slotIndex = 50 + i * 137; // spread across tree
        await prisma.streamEntryLeaf.create({
          data: {
            entryId: streamEntry.id,
            leafId: d.leafId,
            leafHash: fakeHash(i + 600, 'dia'),
            value: d.carats,
            leafData: serializeJson({ certificateId: d.leafId, carats: d.carats, cut: d.cut, color: d.color, clarity: d.clarity }),
            leafIndex: slotIndex,
          },
        });
      }
    }
  }

  console.log(`✓ Created diamond test entries (${MONTHS} monthly sparse merkle tree snapshots with sample leaves)`);

  // ── Integration run logs ────────────────────────────────────────────

  // Add some run logs for the silver API fetch
  const runLogTimes = [12, 6, 0]; // hours ago
  for (const hoursAgo of runLogTimes) {
    await prisma.integrationRunLog.create({
      data: {
        spaceIntegrationId: silverApiFetchInput.id,
        status: 'success',
        message: 'Fetched silver balance: 88750.0 oz',
        durationMs: 250 + Math.floor(Math.random() * 200),
        requestPayload: serializeJson({ endpoint: 'https://vault-api.example.com/silver/balance' }),
        responsePayload: serializeJson({ balance: 88750.0, unit: 'troy_oz', timestamp: new Date(now.getTime() - hoursAgo * 3600000).toISOString() }),
        createdDate: new Date(now.getTime() - hoursAgo * 3600000),
      },
    });
  }

  console.log('✓ Created integration run logs');

  // ── Additional audit logs ───────────────────────────────────────────

  await prisma.auditLog.create({
    data: {
      action: enumKey<AuditAction>('CREATE'),
      resourceType: enumKey<ResourceType>('DATA_STREAM'),
      resourceId: goldStream.id,
      userEmail: admin.email,
      spaceId: goldSpace.id,
      ipAddress: '127.0.0.1',
      userAgent: 'Seed Script',
      details: serializeJson({ message: 'Gold Bars stream created during seeding' }),
    },
  });

  await prisma.auditLog.create({
    data: {
      action: enumKey<AuditAction>('CREATE'),
      resourceType: enumKey<ResourceType>('INTEGRATION'),
      resourceId: goldManualInput.id,
      userEmail: admin.email,
      spaceId: goldSpace.id,
      ipAddress: '127.0.0.1',
      userAgent: 'Seed Script',
      details: serializeJson({ message: 'Manual input integration configured' }),
    },
  });

  console.log('✓ Created additional audit log entries');

  console.log('\n✅ Database seeded successfully!');
  console.log('\n📝 Test Accounts:');
  console.log('┌──────────────────────────────────────────────────────────────────────┐');
  console.log('│ Email                     Platform Role  Space Access                │');
  console.log('├──────────────────────────────────────────────────────────────────────┤');
  console.log('│ owner@aurareserve.io     OWNER          All spaces (full access)    │');
  console.log('│ admin@aurareserve.io     ADMIN          Silver space (space admin)  │');
  console.log('│ auditor@aurareserve.io   (none)         Gold space (auditor)        │');
  console.log('│ member@aurareserve.io    (none)         Gold & Silver (member)      │');
  console.log('└──────────────────────────────────────────────────────────────────────┘');
  console.log('\n📊 Test Data (24 monthly entries per stream over 2 years):');
  console.log('┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ Space                   Streams  Artifact Type      Inputs     Outputs      │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log('│ ACC Gold Reserve        2        value              manual     api,avax     │');
  console.log('│ Silver Bullion Vault    1        value              api-fetch  webhook,api  │');
  console.log('│ Crypto Exchange         2        merkle_sum_tree    api,bc     api          │');
  console.log('│ Emerald Vault Geneva    2        merkle_tree        manual     api          │');
  console.log('│ TrueUSD Backing         3        value              bc,fetch   api,avax,rwa │');
  console.log('│ PGM Industrial Supply   2        value              api-fetch  webhook,api  │');
  console.log('│ DeBeers Diamonds        1        sparse_merkle_tree manual,api api,avax     │');
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  console.log('\n🔑 Default password for all accounts: Password123!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
