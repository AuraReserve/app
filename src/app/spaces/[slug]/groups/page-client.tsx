"use client";

import { useState, useEffect, useCallback } from "react";
import { useCsrfFetch } from "@/hooks/useCsrfFetch";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";
import { useSpace } from "@/hooks/useSpace";
import { useFormState } from "@/hooks/useFormState";
import { AlertMessages } from "@/components/common/alert-messages";
import { SpacePageHeader } from "@/components/spaces/space-page-header";
import { SpacePageSkeleton, AccessRestricted } from "@/components/spaces/space-page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, UsersRound, UserPlus, ChevronDown, ChevronRight, Pencil } from "lucide-react";

interface GroupMember {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface Group {
  id: string;
  name: string;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    members: number;
  };
}

interface SpaceMember {
  id: string;
  userId: string;
  user: {
    id: string;
    email: string;
    fullName: string;
  };
}

interface GroupsPageClientProps {
  slug: string;
}

export default function GroupsPageClient({ slug }: GroupsPageClientProps) {
  const { space, isLoading: spaceLoading } = useSpace(slug);
  const [groups, setGroups] = useState<Group[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const { error, success, setError, setSuccess } = useFormState();
  const { permissions } = useSpacePermissions(space?.id);
  const { csrfFetch } = useCsrfFetch();

  // Create group dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  // Rename group dialog
  const [renameTarget, setRenameTarget] = useState<Group | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Delete group dialog
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Expanded group (show members)
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Add member to group dialog
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [addMemberGroupId, setAddMemberGroupId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [spaceMembersLoading, setSpaceMembersLoading] = useState(false);

  const canManage = permissions.canManageGroups;

  const loadGroups = useCallback(async () => {
    if (!space?.id) return;
    setDataLoading(true);
    try {
      const res = await fetch(`/api/spaces/${space.id}/groups`);
      if (res.ok) {
        setGroups(await res.json());
      } else {
        setError("Failed to load groups");
      }
    } catch {
      setError("Failed to load groups");
    } finally {
      setDataLoading(false);
    }
  }, [space?.id, setError]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const loadGroupMembers = useCallback(async (groupId: string) => {
    if (!space?.id) return;
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/spaces/${space.id}/groups/${groupId}/members`);
      if (res.ok) {
        setGroupMembers(await res.json());
      }
    } catch {
      console.error("Failed to load group members");
    } finally {
      setMembersLoading(false);
    }
  }, [space?.id]);

  const loadSpaceMembers = useCallback(async () => {
    if (!space?.id) return;
    setSpaceMembersLoading(true);
    try {
      const res = await fetch(`/api/spaces/${space.id}/members`);
      if (res.ok) {
        setSpaceMembers(await res.json());
      }
    } catch {
      console.error("Failed to load space members");
    } finally {
      setSpaceMembersLoading(false);
    }
  }, [space?.id]);

  const toggleExpand = (groupId: string) => {
    if (expandedGroupId === groupId) {
      setExpandedGroupId(null);
      setGroupMembers([]);
    } else {
      setExpandedGroupId(groupId);
      loadGroupMembers(groupId);
    }
  };

  const handleCreateGroup = async () => {
    if (!space?.id || !newGroupName.trim()) return;
    setCreating(true);
    try {
      const res = await csrfFetch(`/api/spaces/${space.id}/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create group");
      }
      setSuccess("Group created successfully");
      setShowCreateDialog(false);
      setNewGroupName("");
      loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create group");
    } finally {
      setCreating(false);
    }
  };

  const handleRenameGroup = async () => {
    if (!space?.id || !renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const res = await csrfFetch(`/api/spaces/${space.id}/groups/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to rename group");
      }
      setSuccess("Group renamed successfully");
      setRenameTarget(null);
      setRenameValue("");
      loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to rename group");
    } finally {
      setRenaming(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!space?.id || !deleteTarget) return;
    setDeleting(true);
    try {
      const res = await csrfFetch(`/api/spaces/${space.id}/groups/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete group");
      }
      setSuccess("Group deleted successfully");
      setDeleteTarget(null);
      if (expandedGroupId === deleteTarget.id) {
        setExpandedGroupId(null);
        setGroupMembers([]);
      }
      loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete group");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddMember = async () => {
    if (!space?.id || !addMemberGroupId || !selectedUserId) return;
    try {
      const res = await csrfFetch(`/api/spaces/${space.id}/groups/${addMemberGroupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add member to group");
      }
      setSuccess("Member added to group");
      setShowAddMemberDialog(false);
      setSelectedUserId("");
      // Refresh members if this group is expanded
      if (expandedGroupId === addMemberGroupId) {
        loadGroupMembers(addMemberGroupId);
      }
      loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member to group");
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (!space?.id) return;
    try {
      const res = await csrfFetch(`/api/spaces/${space.id}/groups/${groupId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member from group");
      }
      setSuccess("Member removed from group");
      if (expandedGroupId === groupId) {
        loadGroupMembers(groupId);
      }
      loadGroups();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove member from group");
    }
  };

  const openAddMemberDialog = (groupId: string) => {
    setAddMemberGroupId(groupId);
    setSelectedUserId("");
    setShowAddMemberDialog(true);
    loadSpaceMembers();
  };

  if (spaceLoading || dataLoading) {
    return <SpacePageSkeleton />;
  }

  if (!canManage) {
    return (
      <AccessRestricted
        slug={slug}
        spaceName={space?.name}
        backHref={`/spaces/${slug}`}
        message="Only space administrators can manage groups. You have read-only access to this space."
      />
    );
  }

  // Filter out space members already in the group when adding
  const groupMemberUserIds = new Set(groupMembers.map((m) => m.userId));
  const availableForGroup = spaceMembers.filter((m) => !groupMemberUserIds.has(m.userId));

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <SpacePageHeader
          slug={slug}
          spaceName={space?.name ?? "Space"}
          title="Groups"
          description="Organize space members into groups for easier management."
          action={canManage ? (
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Group
            </Button>
          ) : undefined}
        />

        <AlertMessages error={error} success={success} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersRound className="w-5 h-5" />
              Groups ({groups.length})
            </CardTitle>
            <CardDescription>Manage groups within this space</CardDescription>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <UsersRound className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p>No groups created yet.</p>
                <p className="text-sm mt-2">Click &quot;Create Group&quot; to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => {
                  const isExpanded = expandedGroupId === group.id;
                  const memberCount = group._count?.members ?? 0;
                  return (
                    <div
                      key={group.id}
                      className="border border-slate-200 rounded-lg bg-white"
                    >
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => toggleExpand(group.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">{group.name}</div>
                            <div className="text-sm text-slate-500">
                              {memberCount} {memberCount === 1 ? "member" : "members"} &middot; Created{" "}
                              {new Date(group.createdAt).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setRenameTarget(group);
                                setRenameValue(group.name);
                              }}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              Rename
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteTarget(group)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-200 p-4 space-y-3">
                          {canManage && (
                            <div className="flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openAddMemberDialog(group.id)}
                              >
                                <UserPlus className="w-4 h-4 mr-1" />
                                Add Member
                              </Button>
                            </div>
                          )}
                          {membersLoading ? (
                            <div className="text-sm text-slate-500 text-center py-4">Loading members...</div>
                          ) : groupMembers.length === 0 ? (
                            <div className="text-sm text-slate-500 text-center py-4">
                              No members in this group yet.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {groupMembers.map((member) => (
                                <div
                                  key={member.id}
                                  className="flex items-center justify-between p-3 border border-slate-100 rounded-md bg-slate-50"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-slate-900 truncate">
                                      {member.user.fullName}
                                    </div>
                                    <div className="text-xs text-slate-500">{member.user.email}</div>
                                  </div>
                                  {canManage && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => handleRemoveMember(group.id, member.userId)}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create Group Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Group</DialogTitle>
              <DialogDescription>
                Create a new group in this space to organize members.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="group-name">Group Name</Label>
                <Input
                  id="group-name"
                  placeholder="e.g. Auditors, Reviewers"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newGroupName.trim()) {
                      handleCreateGroup();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                                onClick={handleCreateGroup}
                disabled={creating || !newGroupName.trim()}
              >
                {creating ? "Creating..." : "Create Group"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rename Group Dialog */}
        <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rename Group</DialogTitle>
              <DialogDescription>
                Change the name of &ldquo;{renameTarget?.name}&rdquo;.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rename-group">New Name</Label>
                <Input
                  id="rename-group"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameValue.trim()) {
                      handleRenameGroup();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRenameTarget(null)}>
                Cancel
              </Button>
              <Button
                                onClick={handleRenameGroup}
                disabled={renaming || !renameValue.trim()}
              >
                {renaming ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Group Dialog */}
        <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Group</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete &ldquo;{deleteTarget?.name}&rdquo;? This will remove all
                member associations. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteGroup}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete Group"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Member to Group Dialog */}
        <Dialog open={showAddMemberDialog} onOpenChange={setShowAddMemberDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Member to Group</DialogTitle>
              <DialogDescription>
                Select a space member to add to this group.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Member</Label>
                {spaceMembersLoading ? (
                  <div className="text-sm text-slate-500">Loading members...</div>
                ) : (
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      {selectedUserId ? (
                        <span className="text-sm">
                          {availableForGroup.find((m) => m.userId === selectedUserId)?.user.fullName ??
                            availableForGroup.find((m) => m.userId === selectedUserId)?.user.email}
                        </span>
                      ) : (
                        <SelectValue placeholder="Select a member" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {availableForGroup.length === 0 ? (
                        <div className="px-2 py-4 text-sm text-center text-slate-500">
                          All space members are already in this group.
                        </div>
                      ) : (
                        availableForGroup.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.user.fullName || m.user.email}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddMemberDialog(false)}>
                Cancel
              </Button>
              <Button
                                onClick={handleAddMember}
                disabled={!selectedUserId}
              >
                Add to Group
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
