// Entity type definitions based on JSON schemas

export interface Space {
  id: string;
  name: string;
  description: string;
  slug: string;
  api_identifier: string;
  api_identifier_source: 'slug' | 'custom';
  is_active: boolean;
  created_by: string;
  created_date: string;
  // Legacy fields — removed from Prisma schema but kept optional for backward compatibility
  // with old pages until Phase 8 cleanup
  /** @deprecated Per-stream now, use DataStream.assetType */
  asset_type?: string;
  /** @deprecated Per-stream now, use DataStream.unit */
  unit?: string;
  /** @deprecated Per-stream now, use DataStream.artifactType */
  proof_type?: 'classic' | 'merkle';
  /** @deprecated Per-stream now, ripcord is a StreamEntry property */
  ripcord_enabled?: boolean;
  /** @deprecated Per-stream now, API access is via API output destination */
  api_public?: boolean;
  verification_public: boolean;
}

export interface AssetType {
  id: string;
  value: string;
  label: string;
  icon?: string;
  description?: string;
  created_date: string;
  usage_count?: number;
}

export interface ApiCall {
  id: string;
  space_id: string;
  api_key_id?: string;
  ip_address: string;
  user_agent: string;
  status_code: number;
  response_time_ms?: number | null;
  created_date: string;
}

export interface AuditLog {
  id: string;
  action: 'create' | 'update' | 'delete' | 'api_access' | 'login' | 'logout';
  resource_type: 'space' | 'api_key' | 'user' | 'space_member' | 'group' | 'settings' | 'data_stream' | 'stream_entry' | 'integration';
  resource_id: string;
  user_email: string;
  space_id?: string;
  ip_address: string;
  user_agent: string;
  details: Record<string, unknown>;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  created_date: string;
}

/**
 * User model - Authentication and platform-level authorization
 * Maps to Prisma User model with UserRole enum
 */
export interface User {
  id: string;
  email: string;
  full_name: string;
  company?: string;
  /**
   * Platform role (from Prisma UserRole enum):
   * - 'owner': Super admin with full platform access, can manage all users including owners
   * - 'admin': Platform admin who can create spaces and manage users (except owners)
   * - null: Space-only user with no platform-level permissions
   */
  role: 'owner' | 'admin' | null;
  password?: string;
  auth_provider: 'credentials' | 'google' | 'azure';
  provider_id?: string;
  image?: string;
  email_verified: boolean;
  is_active: boolean;
  last_login?: string | null;
  invited_by?: string | null;
  created_date: string;
}

/**
 * SpaceUser model - Space-level permissions (junction table)
 * Maps to Prisma SpaceUser model with SpaceRole enum
 */
export interface SpaceUser {
  id: string;
  user_id: string;
  space_id: string;
  /**
   * Space role (from Prisma SpaceRole enum):
   * - 'admin': Can manage space settings, members, and all data operations
   * - 'auditor': Can view data and submit/archive proof-of-reserve entries
   * - 'member': Read-only access to space data
   */
  role: 'admin' | 'auditor' | 'member';
  created_date: string;
}

export interface Account {
  id: string;
  user_id: string;
  type: string;
  provider: string;
  provider_account_id: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

export interface Session {
  id: string;
  session_token: string;
  user_id: string;
  expires: string;
}

export interface Setting {
  key: string;
  value: string;
  description?: string | null;
  updated_at: string;
  updated_by?: string | null;
}

// ---------------------------------------------------------------------------
// Artifact Data Shapes (per artifact type)
// ---------------------------------------------------------------------------

export type ArtifactType = 'value' | 'merkle_tree' | 'merkle_sum_tree' | 'sparse_merkle_tree';

export interface MerkleTreeArtifactData {
  merkleRoot: string;
  treeData: Record<string, unknown>;
  leafCount: number;
}

export interface MerkleSumTreeArtifactData {
  merkleRoot: string;
  treeData: { levels: string[][]; sums: number[][] };
  leafCount: number;
  totalBalance: number;
}

export interface SparseMerkleTreeArtifactData {
  merkleRoot: string;
  treeDepth: number;
  defaultLeaf: string;
  leafCount: number;
  totalBalance: number;
  nodeStore: Record<string, string>;
}

export type ArtifactData =
  | MerkleTreeArtifactData
  | MerkleSumTreeArtifactData
  | SparseMerkleTreeArtifactData
  | null;

// ---------------------------------------------------------------------------
// DataStream & StreamEntry
// ---------------------------------------------------------------------------

export interface DataStream {
  id: string;
  space_id: string;
  name: string;
  slug: string;
  artifact_type: ArtifactType;
  asset_type: string | null;
  unit: string | null;
  description: string;
  is_active: boolean;
  created_by: string;
  created_date: string;
  /** Latest entry (included when fetched with getStore) */
  latest_entry?: StreamEntry | null;
  /** Entry count (included with getSpaceStores) */
  entry_count?: number;
}

export interface StreamEntry {
  id: string;
  stream_id: string;
  artifact_type: ArtifactType;
  value: number | null;
  artifact_data: ArtifactData;
  submitted_by: string;
  source_integration_id: string | null;
  is_automated: boolean;
  timestamp: string;
  ripcord: boolean;
  ripcord_details: string[];
  notes: string;
  supporting_documents: string[];
  metadata: Record<string, unknown>;
  created_date: string;
}

export interface StreamEntryLeaf {
  id: string;
  entry_id: string;
  leaf_id: string;
  leaf_hash: string;
  value: number | null;
  leaf_data: Record<string, unknown>;
  leaf_index: number;
  created_date: string;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface Group {
  id: string;
  space_id: string;
  name: string;
  created_date: string;
  member_count?: number;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  created_date: string;
  user?: { id: string; email: string; name: string };
}


