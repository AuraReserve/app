/**
 * Client-side permission utilities
 * Used by React components to determine what actions a user can perform
 */

// ============================================================================
// Global Permissions (Platform-level)
// ============================================================================

/**
 * Global platform roles from Prisma UserRole enum
 * Users without a platform role (null) are space-only users
 */
export type GlobalRole = "owner" | "admin" | "creator";

export interface GlobalPermissions {
  canCreateSpaces: boolean;
  canManageUsers: boolean;
  canAccessAdminPanel: boolean;
  canViewAnalytics: boolean;
}

/**
 * Get permissions for a given global role
 */
export function getGlobalPermissions(role?: GlobalRole | string | null): GlobalPermissions {
  if (!role) {
    return {
      canCreateSpaces: false,
      canManageUsers: false,
      canAccessAdminPanel: false,
      canViewAnalytics: false,
    };
  }

  const normalized = role.toLowerCase();
  const isOwnerRole = normalized === "owner";
  const isAdminRole = normalized === "owner" || normalized === "admin";
  const isCreatorRole = isAdminRole || normalized === "creator";

  return {
    canCreateSpaces: isCreatorRole,
    canManageUsers: isAdminRole,
    canAccessAdminPanel: isOwnerRole,
    canViewAnalytics: true,
  };
}

/**
 * Check if user can create spaces
 */
export function canCreateSpaces(role?: GlobalRole | string | null): boolean {
  return role?.toLowerCase() === "owner" || role?.toLowerCase() === "admin" || role?.toLowerCase() === "creator";
}

/**
 * Check if user can manage users
 */
export function canManageUsers(role?: GlobalRole | string | null): boolean {
  return role?.toLowerCase() === "owner" || role?.toLowerCase() === "admin";
}

/**
 * Check if user can access admin panel
 */
export function canAccessAdminPanel(role?: GlobalRole | string | null): boolean {
  return role?.toLowerCase() === "owner";
}

/**
 * Check if user is an admin (owner or admin role)
 */
export function isAdmin(role?: GlobalRole | string | null): boolean {
  return role?.toLowerCase() === "owner" || role?.toLowerCase() === "admin";
}

/**
 * Check if user is the owner
 */
export function isOwner(role?: GlobalRole | string | null): boolean {
  return role?.toLowerCase() === "owner";
}

// ============================================================================
// Space Permissions (Space-level)
// ============================================================================

export type SpaceRole = "admin" | "auditor" | "member";

export interface SpacePermissions {
  canViewData: boolean;
  canManageReserves: boolean;
  canManageApiKeys: boolean;
  canManageSettings: boolean;
  canManageMembers: boolean;
  canManageStreams: boolean;
  canWriteToStream: boolean;
  canReadStream: boolean;
  canManageIntegrations: boolean;
  canManageInputs: boolean;
  canManageOutputs: boolean;
  canTriggerOutput: boolean;
  canManageGroups: boolean;
  canSubmitData: boolean;
}

/**
 * Get permissions for a given space role
 */
export function getSpacePermissions(role: SpaceRole | null | undefined): SpacePermissions {
  if (!role) {
    return {
      canViewData: false,
      canManageReserves: false,
      canManageApiKeys: false,
      canManageSettings: false,
      canManageMembers: false,
      canManageStreams: false,
      canWriteToStream: false,
      canReadStream: false,
      canManageIntegrations: false,
      canManageInputs: false,
      canManageOutputs: false,
      canTriggerOutput: false,
      canManageGroups: false,
      canSubmitData: false,
    };
  }

  switch (role) {
    case "admin":
      return {
        canViewData: true,
        canManageReserves: true,
        canManageApiKeys: true,
        canManageSettings: true,
        canManageMembers: true,
        canManageStreams: true,
        canWriteToStream: true,
        canReadStream: true,
        canManageIntegrations: true,
        canManageInputs: true,
        canManageOutputs: true,
        canTriggerOutput: true,
        canManageGroups: true,
        canSubmitData: true,
      };

    case "auditor":
      return {
        canViewData: true,
        canManageReserves: true,
        canManageApiKeys: false,
        canManageSettings: false,
        canManageMembers: false,
        canManageStreams: false,
        canWriteToStream: true,
        canReadStream: true,
        canManageIntegrations: false,
        canManageInputs: false,
        canManageOutputs: false,
        canTriggerOutput: true,
        canManageGroups: false,
        canSubmitData: true,
      };

    case "member":
      return {
        canViewData: true,
        canManageReserves: false,
        canManageApiKeys: false,
        canManageSettings: false,
        canManageMembers: false,
        canManageStreams: false,
        canWriteToStream: false,
        canReadStream: true,
        canManageIntegrations: false,
        canManageInputs: false,
        canManageOutputs: false,
        canTriggerOutput: false,
        canManageGroups: false,
        canSubmitData: false,
      };

    default:
      return {
        canViewData: false,
        canManageReserves: false,
        canManageApiKeys: false,
        canManageSettings: false,
        canManageMembers: false,
        canManageStreams: false,
        canWriteToStream: false,
        canReadStream: false,
        canManageIntegrations: false,
        canManageInputs: false,
        canManageOutputs: false,
        canTriggerOutput: false,
        canManageGroups: false,
        canSubmitData: false,
      };
  }
}

/**
 * Check if user can manage reserves (create/archive)
 */
export function canManageReserves(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin" || role?.toLowerCase() === "auditor";
}

/**
 * Check if user can manage API keys
 */
export function canManageApiKeys(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can manage space settings
 */
export function canManageSettings(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can manage space members
 */
export function canManageMembers(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can manage streams (create/update/delete)
 */
export function canManageStreams(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can write entries to a stream
 */
export function canWriteToStream(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin" || role?.toLowerCase() === "auditor";
}

/**
 * Check if user can read stream data
 */
export function canReadStream(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin" || role?.toLowerCase() === "auditor" || role?.toLowerCase() === "member";
}

/**
 * Check if user can manage integrations (install/configure/remove)
 */
export function canManageIntegrations(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can manage inputs (install/configure/remove input integrations)
 */
export function canManageInputs(role: SpaceRole | string | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can manage outputs (install/configure/remove output integrations)
 */
export function canManageOutputs(role: SpaceRole | string | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can trigger an output manually
 */
export function canTriggerOutput(role: SpaceRole | string | null | undefined): boolean {
  return role?.toLowerCase() === "admin" || role?.toLowerCase() === "auditor";
}

/**
 * Check if user can manage groups
 */
export function canManageGroups(role: SpaceRole | string | null | undefined): boolean {
  return role?.toLowerCase() === "admin";
}

/**
 * Check if user can submit data entries
 */
export function canSubmitData(role: SpaceRole | string | null | undefined): boolean {
  return role?.toLowerCase() === "admin" || role?.toLowerCase() === "auditor";
}

/**
 * Check if user has read-only access
 */
export function isReadOnly(role: SpaceRole | null | undefined): boolean {
  return role?.toLowerCase() === "member";
}

/**
 * Get role display name
 */
export function getRoleLabel(role: SpaceRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "auditor":
      return "Auditor";
    case "member":
      return "Member";
    default:
      return role;
  }
}

/**
 * Get role description
 */
export function getRoleDescription(role: SpaceRole): string {
  switch (role) {
    case "admin":
      return "Full access to all space features including settings, members, and data";
    case "auditor":
      return "Can view data and submit/archive proof of reserve entries";
    case "member":
      return "Read-only access to space data, analytics, and API information";
    default:
      return "";
  }
}
