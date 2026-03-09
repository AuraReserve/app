"use client";

import { useState, useEffect, useCallback } from "react";
import { useCsrfFetch } from "@/hooks/useCsrfFetch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { UserPlus, Trash2, Users as UsersIcon } from "lucide-react";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";
import { useSpace } from "@/hooks/useSpace";
import { useFormState } from "@/hooks/useFormState";
import { AlertMessages } from "@/components/common/alert-messages";
import { SpacePageHeader } from "@/components/spaces/space-page-header";
import { SpacePageSkeleton, AccessRestricted } from "@/components/spaces/space-page-shell";

interface SpaceMembersPageProps {
  slug: string;
}

interface SpaceMember {
  id: string;
  userId: string;
  spaceId: string;
  role: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

export default function SpaceMembersPage({ slug }: SpaceMembersPageProps) {
  const { space, isLoading: spaceLoading } = useSpace(slug);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("member");
  const [addingMember, setAddingMember] = useState(false);
  const { error, success, setError, setSuccess } = useFormState();
  const { permissions } = useSpacePermissions(space?.id);
  const { csrfFetch } = useCsrfFetch();

  const loadMembers = useCallback(async () => {
    if (!space?.id) return;
    setMembersLoading(true);
    try {
      const membersRes = await fetch(`/api/spaces/${space.id}/members`);

      if (membersRes.ok) {
        setMembers(await membersRes.json());
      }
    } catch (err) {
      console.error("Error loading space members:", err);
      setError("Failed to load space members");
    } finally {
      setMembersLoading(false);
    }
  }, [space?.id, setError]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleAddMember = async () => {
    if (!inviteEmail.trim() || !space) return;

    setAddingMember(true);
    try {
      const response = await csrfFetch(`/api/spaces/${space.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: selectedRole,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add member");
      }

      setSuccess("Member added successfully");
      setShowAddDialog(false);
      setInviteEmail("");
      setSelectedRole("member");
      loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!space || !confirm("Remove this member from the space?")) return;

    try {
      const response = await csrfFetch(`/api/spaces/${space.id}/members/${memberId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove member");
      }

      setSuccess("Member removed successfully");
      loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    if (!space) return;

    try {
      const response = await csrfFetch(`/api/spaces/${space.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        throw new Error("Failed to update role");
      }

      setSuccess("Role updated successfully");
      loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  };

  if (spaceLoading || membersLoading) {
    return <SpacePageSkeleton />;
  }

  if (!permissions.canManageMembers) {
    return (
      <AccessRestricted
        slug={slug}
        spaceName={space?.name}
        backHref={`/spaces/${slug}`}
        message="Only space administrators can manage members. You have read-only access to this space."
      />
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <SpacePageHeader
          slug={slug}
          spaceName={space?.name ?? "Space"}
          title="Members"
          description="Manage user access to this space."
          action={
            <Button onClick={() => setShowAddDialog(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Member
            </Button>
          }
        />

        <AlertMessages error={error} success={success} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="w-5 h-5" />
              Members ({members.length})
            </CardTitle>
            <CardDescription>Users with access to this space</CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <UsersIcon className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                <p>No members assigned to this space yet.</p>
                <p className="text-sm mt-2">Click &quot;Add Member&quot; to grant access to users.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg bg-white"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">{member.user.fullName}</div>
                      <div className="text-sm text-slate-500">{member.user.email}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select
                        value={member.role.toLowerCase()}
                        onValueChange={(value) => handleUpdateRole(member.id, value)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="auditor">Auditor</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite Member</DialogTitle>
              <DialogDescription>
                Invite a user to this space by email address
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email Address</label>
                <Input
                  type="email"
                  placeholder="user@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddMember();
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Space Role</label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="auditor">Auditor</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={!inviteEmail.trim() || addingMember}>
                {addingMember ? "Adding..." : "Invite Member"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
