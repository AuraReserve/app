import { useState, useEffect } from "react";
import {
  getSpacePermissions,
  canManageInputs,
  canManageOutputs,
  canTriggerOutput,
  canManageGroups,
  canSubmitData,
  type SpaceRole,
  type SpacePermissions,
} from "@/lib/permissions";

/**
 * Hook to fetch and manage space permissions for the current user
 */
export function useSpacePermissions(spaceId: string | undefined) {
  const [role, setRole] = useState<SpaceRole | null>(null);
  const [permissions, setPermissions] = useState<SpacePermissions>(getSpacePermissions(null));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!spaceId) {
      setIsLoading(false);
      return;
    }

    const fetchRole = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/spaces/${spaceId}/role`);
        if (response.ok) {
          const data = await response.json();
          setRole(data.role as SpaceRole);
          setPermissions(getSpacePermissions(data.role as SpaceRole));
        } else {
          setRole(null);
          setPermissions(getSpacePermissions(null));
        }
      } catch (error) {
        console.error("Failed to fetch space role:", error);
        setRole(null);
        setPermissions(getSpacePermissions(null));
      } finally {
        setIsLoading(false);
      }
    };

    fetchRole();
  }, [spaceId]);

  return {
    role,
    permissions,
    isLoading,
    isAdmin: role === "admin",
    isAuditor: role === "auditor",
    isMember: role === "member",
    isReadOnly: role === "member",
    canManageInputs: canManageInputs(role),
    canManageOutputs: canManageOutputs(role),
    canTriggerOutput: canTriggerOutput(role),
    canManageGroups: canManageGroups(role),
    canSubmitData: canSubmitData(role),
  };
}
