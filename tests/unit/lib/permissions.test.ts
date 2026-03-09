import { describe, expect, it } from "vitest";
import {
  getGlobalPermissions,
  canCreateSpaces,
  getSpacePermissions,
  canManageReserves,
  canManageApiKeys,
  canManageSettings,
  canManageMembers,
  canManageStreams,
  canWriteToStream,
  canReadStream,
  canManageIntegrations,
  canManageInputs,
  canManageOutputs,
  canTriggerOutput,
  canManageGroups,
  canSubmitData,
  isReadOnly,
  getRoleLabel,
  getRoleDescription,
  type SpaceRole,
} from "@/lib/permissions";

describe("Permission System", () => {
  describe("Global Permissions", () => {
    describe("getGlobalPermissions", () => {
      it("returns all false for null role", () => {
        const perms = getGlobalPermissions(null);
        expect(perms.canCreateSpaces).toBe(false);
        expect(perms.canManageUsers).toBe(false);
        expect(perms.canAccessAdminPanel).toBe(false);
      });

      it("grants only canCreateSpaces for creator role", () => {
        const perms = getGlobalPermissions("creator");
        expect(perms.canCreateSpaces).toBe(true);
        expect(perms.canManageUsers).toBe(false);
        expect(perms.canAccessAdminPanel).toBe(false);
        expect(perms.canViewAnalytics).toBe(true);
      });

      it("grants canCreateSpaces and canManageUsers for admin role", () => {
        const perms = getGlobalPermissions("admin");
        expect(perms.canCreateSpaces).toBe(true);
        expect(perms.canManageUsers).toBe(true);
        expect(perms.canAccessAdminPanel).toBe(false);
      });

      it("grants all permissions for owner role", () => {
        const perms = getGlobalPermissions("owner");
        expect(perms.canCreateSpaces).toBe(true);
        expect(perms.canManageUsers).toBe(true);
        expect(perms.canAccessAdminPanel).toBe(true);
      });
    });

    describe("canCreateSpaces", () => {
      it("returns false for null", () => {
        expect(canCreateSpaces(null)).toBe(false);
      });

      it("returns true for creator", () => {
        expect(canCreateSpaces("creator")).toBe(true);
      });

      it("returns true for admin", () => {
        expect(canCreateSpaces("admin")).toBe(true);
      });

      it("returns true for owner", () => {
        expect(canCreateSpaces("owner")).toBe(true);
      });
    });
  });

  describe("getSpacePermissions", () => {
    it("returns all permissions false for null role", () => {
      const permissions = getSpacePermissions(null);
      expect(permissions).toEqual({
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
      });
    });

    it("returns all permissions false for undefined role", () => {
      const permissions = getSpacePermissions(undefined);
      expect(permissions).toEqual({
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
      });
    });

    it("returns read-only permissions for member role", () => {
      const permissions = getSpacePermissions("member");
      expect(permissions).toEqual({
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
      });
    });

    it("returns view and reserve management permissions for auditor role", () => {
      const permissions = getSpacePermissions("auditor");
      expect(permissions).toEqual({
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
      });
    });

    it("returns all permissions for admin role", () => {
      const permissions = getSpacePermissions("admin");
      expect(permissions).toEqual({
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
      });
    });
  });

  describe("canManageReserves", () => {
    it("returns false for null role", () => {
      expect(canManageReserves(null)).toBe(false);
    });

    it("returns false for member role", () => {
      expect(canManageReserves("member")).toBe(false);
    });

    it("returns true for auditor role", () => {
      expect(canManageReserves("auditor")).toBe(true);
    });

    it("returns true for admin role", () => {
      expect(canManageReserves("admin")).toBe(true);
    });
  });

  describe("canManageApiKeys", () => {
    it("returns false for null role", () => {
      expect(canManageApiKeys(null)).toBe(false);
    });

    it("returns false for member role", () => {
      expect(canManageApiKeys("member")).toBe(false);
    });

    it("returns false for auditor role", () => {
      expect(canManageApiKeys("auditor")).toBe(false);
    });

    it("returns true for admin role", () => {
      expect(canManageApiKeys("admin")).toBe(true);
    });
  });

  describe("canManageSettings", () => {
    it("returns false for null role", () => {
      expect(canManageSettings(null)).toBe(false);
    });

    it("returns false for member role", () => {
      expect(canManageSettings("member")).toBe(false);
    });

    it("returns false for auditor role", () => {
      expect(canManageSettings("auditor")).toBe(false);
    });

    it("returns true for admin role", () => {
      expect(canManageSettings("admin")).toBe(true);
    });
  });

  describe("canManageMembers", () => {
    it("returns false for null role", () => {
      expect(canManageMembers(null)).toBe(false);
    });

    it("returns false for member role", () => {
      expect(canManageMembers("member")).toBe(false);
    });

    it("returns false for auditor role", () => {
      expect(canManageMembers("auditor")).toBe(false);
    });

    it("returns true for admin role", () => {
      expect(canManageMembers("admin")).toBe(true);
    });
  });

  describe("isReadOnly", () => {
    it("returns false for null role", () => {
      expect(isReadOnly(null)).toBe(false);
    });

    it("returns true for member role", () => {
      expect(isReadOnly("member")).toBe(true);
    });

    it("returns false for auditor role", () => {
      expect(isReadOnly("auditor")).toBe(false);
    });

    it("returns false for admin role", () => {
      expect(isReadOnly("admin")).toBe(false);
    });
  });

  describe("getRoleLabel", () => {
    it("returns 'Admin' for admin role", () => {
      expect(getRoleLabel("admin")).toBe("Admin");
    });

    it("returns 'Auditor' for auditor role", () => {
      expect(getRoleLabel("auditor")).toBe("Auditor");
    });

    it("returns 'Member' for member role", () => {
      expect(getRoleLabel("member")).toBe("Member");
    });
  });

  describe("getRoleDescription", () => {
    it("returns full description for admin role", () => {
      const description = getRoleDescription("admin");
      expect(description).toContain("Full access");
      expect(description).toContain("settings");
      expect(description).toContain("members");
    });

    it("returns data entry description for auditor role", () => {
      const description = getRoleDescription("auditor");
      expect(description).toContain("view data");
      expect(description).toContain("submit");
      expect(description).toContain("archive");
    });

    it("returns read-only description for member role", () => {
      const description = getRoleDescription("member");
      expect(description).toContain("Read-only");
      expect(description).toContain("data");
    });
  });

  describe("Permission Hierarchy", () => {
    it("ensures admin has all permissions that auditor has", () => {
      const adminPerms = getSpacePermissions("admin");
      const auditorPerms = getSpacePermissions("auditor");

      // Admin should have everything auditor has
      expect(adminPerms.canViewData).toBe(auditorPerms.canViewData);
      expect(adminPerms.canManageReserves).toBe(auditorPerms.canManageReserves);

      // Admin should have additional permissions
      expect(adminPerms.canManageApiKeys).toBe(true);
      expect(adminPerms.canManageSettings).toBe(true);
      expect(adminPerms.canManageMembers).toBe(true);
    });

    it("ensures auditor has all permissions that member has", () => {
      const auditorPerms = getSpacePermissions("auditor");
      const memberPerms = getSpacePermissions("member");

      // Auditor should have everything member has
      expect(auditorPerms.canViewData).toBe(memberPerms.canViewData);

      // Auditor should have additional permissions
      expect(auditorPerms.canManageReserves).toBe(true);
      expect(memberPerms.canManageReserves).toBe(false);
    });
  });

  describe("canManageStreams", () => {
    it("returns false for null role", () => {
      expect(canManageStreams(null)).toBe(false);
    });

    it("returns false for member role", () => {
      expect(canManageStreams("member")).toBe(false);
    });

    it("returns false for auditor role", () => {
      expect(canManageStreams("auditor")).toBe(false);
    });

    it("returns true for admin role", () => {
      expect(canManageStreams("admin")).toBe(true);
    });
  });

  describe("canWriteToStream", () => {
    it("returns false for null role", () => {
      expect(canWriteToStream(null)).toBe(false);
    });

    it("returns false for member role", () => {
      expect(canWriteToStream("member")).toBe(false);
    });

    it("returns true for auditor role", () => {
      expect(canWriteToStream("auditor")).toBe(true);
    });

    it("returns true for admin role", () => {
      expect(canWriteToStream("admin")).toBe(true);
    });
  });

  describe("canReadStream", () => {
    it("returns false for null role", () => {
      expect(canReadStream(null)).toBe(false);
    });

    it("returns true for member role", () => {
      expect(canReadStream("member")).toBe(true);
    });

    it("returns true for auditor role", () => {
      expect(canReadStream("auditor")).toBe(true);
    });

    it("returns true for admin role", () => {
      expect(canReadStream("admin")).toBe(true);
    });
  });

  describe("canManageIntegrations", () => {
    it("returns false for null role", () => {
      expect(canManageIntegrations(null)).toBe(false);
    });

    it("returns false for member role", () => {
      expect(canManageIntegrations("member")).toBe(false);
    });

    it("returns false for auditor role", () => {
      expect(canManageIntegrations("auditor")).toBe(false);
    });

    it("returns true for admin role", () => {
      expect(canManageIntegrations("admin")).toBe(true);
    });
  });

  describe("canManageInputs", () => {
    it("allows admin", () => {
      expect(canManageInputs("admin")).toBe(true);
    });

    it("denies auditor", () => {
      expect(canManageInputs("auditor")).toBe(false);
    });

    it("denies member", () => {
      expect(canManageInputs("member")).toBe(false);
    });

    it("denies null", () => {
      expect(canManageInputs(null)).toBe(false);
    });
  });

  describe("canManageOutputs", () => {
    it("allows admin", () => {
      expect(canManageOutputs("admin")).toBe(true);
    });

    it("denies auditor", () => {
      expect(canManageOutputs("auditor")).toBe(false);
    });

    it("denies member", () => {
      expect(canManageOutputs("member")).toBe(false);
    });

    it("denies null", () => {
      expect(canManageOutputs(null)).toBe(false);
    });
  });

  describe("canTriggerOutput", () => {
    it("allows admin", () => {
      expect(canTriggerOutput("admin")).toBe(true);
    });

    it("allows auditor", () => {
      expect(canTriggerOutput("auditor")).toBe(true);
    });

    it("denies member", () => {
      expect(canTriggerOutput("member")).toBe(false);
    });

    it("denies null", () => {
      expect(canTriggerOutput(null)).toBe(false);
    });
  });

  describe("canManageGroups", () => {
    it("allows admin", () => {
      expect(canManageGroups("admin")).toBe(true);
    });

    it("denies auditor", () => {
      expect(canManageGroups("auditor")).toBe(false);
    });

    it("denies member", () => {
      expect(canManageGroups("member")).toBe(false);
    });

    it("denies null", () => {
      expect(canManageGroups(null)).toBe(false);
    });
  });

  describe("canSubmitData", () => {
    it("allows admin", () => {
      expect(canSubmitData("admin")).toBe(true);
    });

    it("allows auditor", () => {
      expect(canSubmitData("auditor")).toBe(true);
    });

    it("denies member", () => {
      expect(canSubmitData("member")).toBe(false);
    });

    it("denies null", () => {
      expect(canSubmitData(null)).toBe(false);
    });
  });

  describe("Role Validation", () => {
    it("handles invalid role gracefully", () => {
      const permissions = getSpacePermissions("invalid-role" as SpaceRole);
      expect(permissions).toEqual({
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
      });
    });
  });
});
