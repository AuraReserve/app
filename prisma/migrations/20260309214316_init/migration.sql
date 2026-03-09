-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('owner', 'admin', 'creator');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('credentials', 'google', 'azure');

-- CreateEnum
CREATE TYPE "space_role" AS ENUM ('admin', 'auditor', 'member');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('create', 'update', 'delete', 'api_access', 'login', 'logout', 'archive', 'restore');

-- CreateEnum
CREATE TYPE "resource_type" AS ENUM ('space', 'api_key', 'user', 'space_member', 'settings', 'data_stream', 'stream_entry', 'integration', 'group');

-- CreateEnum
CREATE TYPE "api_identifier_source" AS ENUM ('slug', 'custom');

-- CreateEnum
CREATE TYPE "artifact_type" AS ENUM ('value', 'merkle_tree', 'merkle_sum_tree', 'sparse_merkle_tree');

-- CreateEnum
CREATE TYPE "integration_direction" AS ENUM ('input', 'output');

-- CreateEnum
CREATE TYPE "integration_trigger" AS ENUM ('manual', 'cron', 'on_change');

-- CreateEnum
CREATE TYPE "integration_status" AS ENUM ('active', 'inactive', 'error');

-- CreateEnum
CREATE TYPE "entitlement_status" AS ENUM ('active', 'inactive', 'expired');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "full_name" TEXT,
    "company" TEXT,
    "role" "user_role",
    "password" TEXT,
    "auth_provider" "auth_provider" NOT NULL DEFAULT 'credentials',
    "provider_id" TEXT,
    "image" TEXT,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login" TIMESTAMP(3),
    "invited_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret" TEXT,
    "two_factor_backup_codes" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_users" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "role" "space_role" NOT NULL DEFAULT 'member',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "id_token" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "api_identifier" TEXT NOT NULL,
    "api_identifier_source" "api_identifier_source" NOT NULL DEFAULT 'slug',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "verification_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_types" (
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT,
    "description" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_types_pkey" PRIMARY KEY ("value")
);

-- CreateTable
CREATE TABLE "integration_api_keys" (
    "id" TEXT NOT NULL,
    "space_integration_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "api_key" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "allowed_origins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_calls" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "api_key_id" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "response_time_ms" INTEGER,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" "audit_action" NOT NULL,
    "resource_type" "resource_type" NOT NULL,
    "resource_id" TEXT NOT NULL,
    "user_email" TEXT NOT NULL,
    "space_id" TEXT,
    "ip_address" TEXT NOT NULL,
    "user_agent" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "old_values" JSONB,
    "new_values" JSONB,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_streams" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "artifact_type" "artifact_type" NOT NULL,
    "asset_type" TEXT,
    "unit" TEXT,
    "value_field" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_entries" (
    "id" TEXT NOT NULL,
    "stream_id" TEXT NOT NULL,
    "artifact_type" "artifact_type" NOT NULL,
    "value" DOUBLE PRECISION,
    "artifact_data" JSONB,
    "submitted_by" TEXT NOT NULL,
    "source_integration_id" TEXT,
    "is_automated" BOOLEAN NOT NULL DEFAULT false,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ripcord" BOOLEAN NOT NULL DEFAULT false,
    "ripcord_details" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "supporting_documents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "archived_reason" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stream_entry_leaves" (
    "id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "leaf_id" TEXT NOT NULL,
    "leaf_hash" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "leaf_data" JSONB NOT NULL,
    "leaf_index" INTEGER NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stream_entry_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "supports_input" BOOLEAN NOT NULL DEFAULT false,
    "supports_output" BOOLEAN NOT NULL DEFAULT false,
    "supported_artifact_types" "artifact_type"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "supported_triggers" "integration_trigger"[],
    "default_trigger" "integration_trigger",
    "config_schema" JSONB NOT NULL DEFAULT '{}',
    "default_schedule" TEXT,
    "is_available_self_hosted" BOOLEAN NOT NULL DEFAULT true,
    "bundle_key" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_integrations" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "integration_id" TEXT NOT NULL,
    "stream_id" TEXT,
    "access_group_id" TEXT,
    "direction" "integration_direction" NOT NULL,
    "status" "integration_status" NOT NULL DEFAULT 'active',
    "config" JSONB NOT NULL DEFAULT '{}',
    "schedule" TEXT,
    "trigger" "integration_trigger",
    "last_run_at" TIMESTAMP(3),
    "last_run_status" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_run_logs" (
    "id" TEXT NOT NULL,
    "space_integration_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "duration_ms" INTEGER,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_run_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_entitlements" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "integration_key" TEXT NOT NULL,
    "status" "entitlement_status" NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'manual',
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_auth_provider_idx" ON "users"("auth_provider");

-- CreateIndex
CREATE INDEX "space_users_user_id_idx" ON "space_users"("user_id");

-- CreateIndex
CREATE INDEX "space_users_space_id_idx" ON "space_users"("space_id");

-- CreateIndex
CREATE UNIQUE INDEX "space_users_user_id_space_id_key" ON "space_users"("user_id", "space_id");

-- CreateIndex
CREATE INDEX "groups_space_id_idx" ON "groups"("space_id");

-- CreateIndex
CREATE INDEX "group_members_group_id_idx" ON "group_members"("group_id");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "group_members"("group_id", "user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_id_account_id_key" ON "accounts"("provider_id", "account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "spaces_slug_key" ON "spaces"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "spaces_api_identifier_key" ON "spaces"("api_identifier");

-- CreateIndex
CREATE INDEX "spaces_created_by_idx" ON "spaces"("created_by");

-- CreateIndex
CREATE INDEX "spaces_is_active_idx" ON "spaces"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "integration_api_keys_api_key_key" ON "integration_api_keys"("api_key");

-- CreateIndex
CREATE INDEX "integration_api_keys_space_integration_id_idx" ON "integration_api_keys"("space_integration_id");

-- CreateIndex
CREATE INDEX "integration_api_keys_api_key_idx" ON "integration_api_keys"("api_key");

-- CreateIndex
CREATE INDEX "integration_api_keys_is_active_idx" ON "integration_api_keys"("is_active");

-- CreateIndex
CREATE INDEX "api_calls_space_id_idx" ON "api_calls"("space_id");

-- CreateIndex
CREATE INDEX "api_calls_api_key_id_idx" ON "api_calls"("api_key_id");

-- CreateIndex
CREATE INDEX "api_calls_created_date_idx" ON "api_calls"("created_date");

-- CreateIndex
CREATE INDEX "audit_logs_user_email_idx" ON "audit_logs"("user_email");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_idx" ON "audit_logs"("resource_type");

-- CreateIndex
CREATE INDEX "audit_logs_resource_id_idx" ON "audit_logs"("resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_space_id_idx" ON "audit_logs"("space_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_date_idx" ON "audit_logs"("created_date");

-- CreateIndex
CREATE INDEX "data_streams_space_id_idx" ON "data_streams"("space_id");

-- CreateIndex
CREATE UNIQUE INDEX "data_streams_space_id_slug_key" ON "data_streams"("space_id", "slug");

-- CreateIndex
CREATE INDEX "stream_entries_stream_id_idx" ON "stream_entries"("stream_id");

-- CreateIndex
CREATE INDEX "stream_entries_stream_id_timestamp_idx" ON "stream_entries"("stream_id", "timestamp");

-- CreateIndex
CREATE INDEX "stream_entries_submitted_by_idx" ON "stream_entries"("submitted_by");

-- CreateIndex
CREATE INDEX "stream_entries_source_integration_id_idx" ON "stream_entries"("source_integration_id");

-- CreateIndex
CREATE INDEX "stream_entry_leaves_entry_id_idx" ON "stream_entry_leaves"("entry_id");

-- CreateIndex
CREATE INDEX "stream_entry_leaves_leaf_id_idx" ON "stream_entry_leaves"("leaf_id");

-- CreateIndex
CREATE INDEX "stream_entry_leaves_entry_id_leaf_id_idx" ON "stream_entry_leaves"("entry_id", "leaf_id");

-- CreateIndex
CREATE INDEX "stream_entry_leaves_leaf_hash_idx" ON "stream_entry_leaves"("leaf_hash");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_key_key" ON "integrations"("key");

-- CreateIndex
CREATE INDEX "integrations_is_active_idx" ON "integrations"("is_active");

-- CreateIndex
CREATE INDEX "integrations_bundle_key_idx" ON "integrations"("bundle_key");

-- CreateIndex
CREATE INDEX "space_integrations_space_id_integration_id_stream_id_direct_idx" ON "space_integrations"("space_id", "integration_id", "stream_id", "direction");

-- CreateIndex
CREATE INDEX "space_integrations_space_id_idx" ON "space_integrations"("space_id");

-- CreateIndex
CREATE INDEX "space_integrations_integration_id_idx" ON "space_integrations"("integration_id");

-- CreateIndex
CREATE INDEX "space_integrations_stream_id_idx" ON "space_integrations"("stream_id");

-- CreateIndex
CREATE INDEX "space_integrations_status_idx" ON "space_integrations"("status");

-- CreateIndex
CREATE INDEX "integration_run_logs_space_integration_id_idx" ON "integration_run_logs"("space_integration_id");

-- CreateIndex
CREATE INDEX "integration_run_logs_created_date_idx" ON "integration_run_logs"("created_date");

-- CreateIndex
CREATE INDEX "integration_entitlements_space_id_idx" ON "integration_entitlements"("space_id");

-- CreateIndex
CREATE INDEX "integration_entitlements_integration_key_idx" ON "integration_entitlements"("integration_key");

-- CreateIndex
CREATE INDEX "integration_entitlements_status_idx" ON "integration_entitlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_entitlements_space_id_integration_key_key" ON "integration_entitlements"("space_id", "integration_key");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_users" ADD CONSTRAINT "space_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_users" ADD CONSTRAINT "space_users_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_api_keys" ADD CONSTRAINT "integration_api_keys_space_integration_id_fkey" FOREIGN KEY ("space_integration_id") REFERENCES "space_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_api_keys" ADD CONSTRAINT "integration_api_keys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_calls" ADD CONSTRAINT "api_calls_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_calls" ADD CONSTRAINT "api_calls_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "integration_api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_email_fkey" FOREIGN KEY ("user_email") REFERENCES "users"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_streams" ADD CONSTRAINT "data_streams_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_streams" ADD CONSTRAINT "data_streams_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_entries" ADD CONSTRAINT "stream_entries_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "data_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_entries" ADD CONSTRAINT "stream_entries_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_entries" ADD CONSTRAINT "stream_entries_source_integration_id_fkey" FOREIGN KEY ("source_integration_id") REFERENCES "space_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stream_entry_leaves" ADD CONSTRAINT "stream_entry_leaves_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "stream_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_integrations" ADD CONSTRAINT "space_integrations_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_integrations" ADD CONSTRAINT "space_integrations_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_integrations" ADD CONSTRAINT "space_integrations_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "data_streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_integrations" ADD CONSTRAINT "space_integrations_access_group_id_fkey" FOREIGN KEY ("access_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_run_logs" ADD CONSTRAINT "integration_run_logs_space_integration_id_fkey" FOREIGN KEY ("space_integration_id") REFERENCES "space_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_entitlements" ADD CONSTRAINT "integration_entitlements_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
