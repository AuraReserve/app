"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { User, Plus, AlertCircle, CheckCircle2, Edit, Key } from "lucide-react";
import { format } from "date-fns";
import { validatePassword, getPasswordStrength } from "@/lib/password";
import { isOwner as checkIsOwner, isAdmin as checkIsAdmin } from "@/lib/permissions";

interface UserData {
  id: string;
  email: string;
  full_name: string;
  company?: string;
  role: string | null; // Platform role (owner/admin/creator) or null for space-only users
  auth_provider: string;
  is_active: boolean;
  created_date: string;
  last_login?: string | null;
  spaceMembers?: Array<{
    id: string;
    role: string;
    space: {
      id: string;
      name: string;
      slug: string;
    };
  }>;
}

interface UpdateUserPayload {
  id: string;
  email: string;
  full_name: string;
  company: string | null;
  role: string | null; // Platform role or null
  is_active: boolean;
  password?: string;
}

export default function UserManagement() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    company: "",
    password: "",
    role: null as string | null, // Platform role or null for space-only users
    selectedSpaces: [] as Array<{ spaceId: string; role: string }>, // For space-only users
  });

  const [spaces, setSpaces] = useState<Array<{ id: string; name: string }>>([]);

  const [editFormData, setEditFormData] = useState({
    email: "",
    full_name: "",
    company: "",
    role: null as string | null,
    is_active: true,
    new_password: "",
    selectedSpaces: [] as Array<{ spaceId: string; role: string }>,
  });

  const isOwner = checkIsOwner(session?.user?.role);
  const isAdmin = checkIsAdmin(session?.user?.role);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadData();
  }, [isAdmin]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch users and spaces in parallel
      const [usersResponse, spacesResponse] = await Promise.all([
        fetch("/api/entities/users"),
        fetch("/api/entities/spaces"),
      ]);

      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        setUsers(usersData);
      }

      if (spacesResponse.ok) {
        const spacesData = await spacesResponse.json();
        setSpaces(spacesData.map((s: { id: string; name: string }) => ({ id: s.id, name: s.name })));
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/entities/users");
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error("Error loading users:", error);
    }
    setIsLoading(false);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!formData.email || !formData.full_name || !formData.password) {
      setError("Please fill in all required fields");
      return;
    }

    // Validate password
    const validation = validatePassword(formData.password);
    if (!validation.isValid) {
      setError(validation.errors.join(", "));
      return;
    }

    try {
      // Send plaintext password - server will hash it
      const response = await fetch("/api/entities/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: formData.email,
          full_name: formData.full_name,
          company: formData.company || null,
          password: formData.password,
          role: formData.role,
          auth_provider: "credentials",
          is_active: true,
          email_verified: new Date().toISOString(),
          invited_by: session?.user?.id || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create user");
      }

      const createdUser = await response.json();

      // If space-only user, assign to selected spaces
      if (!formData.role && formData.selectedSpaces.length > 0) {
        for (const spaceAssignment of formData.selectedSpaces) {
          await fetch(`/api/spaces/${spaceAssignment.spaceId}/members`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: createdUser.id,
              role: spaceAssignment.role,
            }),
          });
        }
      }

      setSuccess("User created successfully");
      setFormData({
        email: "",
        full_name: "",
        company: "",
        password: "",
        role: null,
        selectedSpaces: [],
      });
      setCreateDialogOpen(false);
      await loadUsers();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to create user");
      }
    }
  };

  const handleEditUser = (user: UserData) => {
    setEditingUser(user);

    // Map current space memberships to selectedSpaces format
    const currentSpaces = (user.spaceMembers || []).map((membership) => ({
      spaceId: membership.space.id,
      role: membership.role,
    }));

    setEditFormData({
      email: user.email || "",
      full_name: user.full_name || "",
      company: user.company || "",
      role: user.role,
      is_active: user.is_active,
      new_password: "",
      selectedSpaces: currentSpaces,
    });
    setEditDialogOpen(true);
    setError(null);
    setSuccess(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setError(null);
    setSuccess(null);

    try {
      const updateData: UpdateUserPayload = {
        id: editingUser.id,
        email: editFormData.email,
        full_name: editFormData.full_name,
        company: editFormData.company || null,
        role: editFormData.role,
        is_active: editFormData.is_active,
      };

      // Validate and include password if a new one was provided
      if (editFormData.new_password) {
        const validation = validatePassword(editFormData.new_password);
        if (!validation.isValid) {
          setError(validation.errors.join(", "));
          return;
        }
        updateData.password = editFormData.new_password;
      }

      const response = await fetch("/api/entities/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update user");
      }

      // Update space memberships if user is space-only
      if (!editFormData.role) {
        // Get current memberships
        const currentMemberships = editingUser.spaceMembers || [];
        const newSpaceIds = editFormData.selectedSpaces.map((s) => s.spaceId);

        // Remove memberships that are no longer selected
        for (const membership of currentMemberships) {
          if (!newSpaceIds.includes(membership.space.id)) {
            await fetch(`/api/spaces/${membership.space.id}/members/${membership.id}`, {
              method: "DELETE",
            });
          }
        }

        // Add or update memberships
        for (const spaceAssignment of editFormData.selectedSpaces) {
          const existingMembership = currentMemberships.find(
            (m) => m.space.id === spaceAssignment.spaceId
          );

          if (existingMembership) {
            // Update role if changed
            if (existingMembership.role !== spaceAssignment.role) {
              await fetch(`/api/spaces/${spaceAssignment.spaceId}/members/${existingMembership.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role: spaceAssignment.role }),
              });
            }
          } else {
            // Add new membership
            await fetch(`/api/spaces/${spaceAssignment.spaceId}/members`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: editingUser.id,
                role: spaceAssignment.role,
              }),
            });
          }
        }
      }

      setSuccess("User updated successfully");
      setEditDialogOpen(false);
      setEditingUser(null);
      await loadUsers();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update user");
      }
    }
  };

  const getRoleBadgeVariant = (role: string | null) => {
    if (!role) return "outline";
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      case "creator":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string | null) => {
    if (!role) return "Space User";
    switch (role) {
      case "owner":
        return "Owner";
      case "admin":
        return "Admin";
      case "creator":
        return "Creator";
      default:
        return role;
    }
  };

  const platformUsers = useMemo(() => users.filter((u) => u.role), [users]);
  const spaceOnlyUsers = useMemo(() => users.filter((u) => !u.role), [users]);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>You don't have permission to access this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-muted-foreground mt-1">Manage users and their permissions</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create User
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="bg-green-50 border-green-200">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Platform Users Section */}
        <Card>
          <CardHeader>
            <CardTitle>Platform Users</CardTitle>
            <CardDescription>
              Users with platform-level roles (Owner, Admin, Creator)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-slate-500">Loading users...</p>
              </div>
            ) : platformUsers.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No platform users found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {platformUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition cursor-pointer group"
                    onClick={() => handleEditUser(user)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900">{user.full_name}</p>
                          <Badge variant={getRoleBadgeVariant(user.role)} className="text-xs">
                            {getRoleLabel(user.role)}
                          </Badge>
                          {!user.is_active && (
                            <Badge variant="outline" className="text-xs">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">{user.email}</p>
                        {user.company && <p className="text-xs text-slate-500">{user.company}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right text-sm text-slate-500">
                        <p>Created {format(new Date(user.created_date), "MMM d, yyyy")}</p>
                        {user.last_login && (
                          <p className="text-xs">Last login: {format(new Date(user.last_login), "MMM d, h:mm a")}</p>
                        )}
                      </div>
                      <Edit className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Space Users Section */}
        <Card>
          <CardHeader>
            <CardTitle>Space Users</CardTitle>
            <CardDescription>
              Users with access to specific spaces only
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <p className="text-slate-500">Loading users...</p>
              </div>
            ) : spaceOnlyUsers.length === 0 ? (
              <div className="text-center py-12">
                <User className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">No space users found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {spaceOnlyUsers.map((user) => (
                  <div
                    key={user.id}
                    className="p-4 border rounded-lg hover:bg-slate-50 transition cursor-pointer group"
                    onClick={() => handleEditUser(user)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                          <User className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-900">{user.full_name}</p>
                            {!user.is_active && (
                              <Badge variant="outline" className="text-xs">
                                Inactive
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600">{user.email}</p>
                          {user.company && <p className="text-xs text-slate-500">{user.company}</p>}
                          {user.spaceMembers && user.spaceMembers.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {user.spaceMembers.map((membership) => (
                                <Badge key={membership.id} variant="secondary" className="text-xs">
                                  {membership.space.name}: {membership.role}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <Edit className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition ml-4" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Create User Dialog */}
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
              <DialogDescription>Add a new user to the system</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john@company.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">
                  Password <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  required
                />
                {formData.password && (
                  <div className="space-y-2">
                    {/* Password strength indicator */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">Password strength:</span>
                        <span className={
                          getPasswordStrength(formData.password) <= 1 ? "text-red-600" :
                          getPasswordStrength(formData.password) === 2 ? "text-yellow-600" :
                          getPasswordStrength(formData.password) === 3 ? "text-blue-600" :
                          "text-green-600"
                        }>
                          {getPasswordStrength(formData.password) === 0 ? "Very Weak" :
                           getPasswordStrength(formData.password) === 1 ? "Weak" :
                           getPasswordStrength(formData.password) === 2 ? "Fair" :
                           getPasswordStrength(formData.password) === 3 ? "Good" : "Strong"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            getPasswordStrength(formData.password) <= 1 ? "bg-red-500 w-1/4" :
                            getPasswordStrength(formData.password) === 2 ? "bg-yellow-500 w-2/4" :
                            getPasswordStrength(formData.password) === 3 ? "bg-blue-500 w-3/4" :
                            "bg-green-500 w-full"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Password requirements */}
                    {(() => {
                      const validation = validatePassword(formData.password);
                      return !validation.isValid && (
                        <div className="text-xs text-slate-600 space-y-1">
                          <p className="font-medium">Requirements:</p>
                          <ul className="space-y-0.5 ml-4">
                            {validation.errors.map((error, idx) => (
                              <li key={idx} className="text-red-600">• {error}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">
                  Platform Role
                </Label>
                <select
                  id="role"
                  value={formData.role || ""}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value || null, selectedSpaces: [] })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">None (Space-only user)</option>
                  <option value="creator">Creator</option>
                  {isOwner && <option value="admin">Admin</option>}
                  {isOwner && <option value="owner">Owner</option>}
                </select>
                <p className="text-xs text-slate-500">
                  Select a platform role for organization-wide access, or leave as "None" for space-specific access only
                </p>
              </div>

              {/* Space selection for space-only users */}
              {!formData.role && (
                <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
                  <div>
                    <Label className="text-sm font-semibold">Space Access</Label>
                    <p className="text-xs text-slate-500 mt-1">
                      Assign this user to specific spaces with their respective roles
                    </p>
                  </div>

                  {spaces.map((space) => {
                    const assignment = formData.selectedSpaces.find(s => s.spaceId === space.id);
                    return (
                      <div key={space.id} className="flex items-center justify-between p-2 bg-white rounded border">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`space-${space.id}`}
                            checked={!!assignment}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  selectedSpaces: [...formData.selectedSpaces, { spaceId: space.id, role: "member" }]
                                });
                              } else {
                                setFormData({
                                  ...formData,
                                  selectedSpaces: formData.selectedSpaces.filter(s => s.spaceId !== space.id)
                                });
                              }
                            }}
                            className="w-4 h-4"
                          />
                          <Label htmlFor={`space-${space.id}`} className="text-sm cursor-pointer">
                            {space.name}
                          </Label>
                        </div>
                        {assignment && (
                          <select
                            value={assignment.role}
                            onChange={(e) => {
                              setFormData({
                                ...formData,
                                selectedSpaces: formData.selectedSpaces.map(s =>
                                  s.spaceId === space.id ? { ...s, role: e.target.value } : s
                                )
                              });
                            }}
                            className="h-8 px-2 text-xs rounded-md border border-input bg-background"
                          >
                            <option value="member">Member</option>
                            <option value="auditor">Auditor</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </div>
                    );
                  })}

                  {spaces.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-2">No spaces available</p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">
                  Create User
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>Update user information and permissions</DialogDescription>
            </DialogHeader>

            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit_full_name">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit_full_name"
                  value={editFormData.full_name}
                  onChange={(e) => setEditFormData({ ...editFormData, full_name: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit_email"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="john@company.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_company">Company</Label>
                <Input
                  id="edit_company"
                  value={editFormData.company}
                  onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                  placeholder="Acme Corp"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_role">
                  Platform Role
                </Label>
                <select
                  id="edit_role"
                  value={editFormData.role || ""}
                  onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value || null, selectedSpaces: e.target.value ? [] : editFormData.selectedSpaces })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  disabled={!isOwner && (editingUser?.role === "owner" || editingUser?.role === "admin")}
                >
                  <option value="">None (Space-only user)</option>
                  <option value="creator">Creator</option>
                  {isOwner && <option value="admin">Admin</option>}
                  {isOwner && <option value="owner">Owner</option>}
                </select>
                <p className="text-xs text-slate-500">
                  Select a platform role for organization-wide access, or leave as "None" for space-specific access only
                </p>
              </div>

              {/* Space selection for space-only users */}
              {!editFormData.role && (
                <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
                  <div>
                    <Label className="text-sm font-semibold">Space Access</Label>
                    <p className="text-xs text-slate-500 mt-1">
                      Assign this user to specific spaces with their respective roles
                    </p>
                  </div>

                  {spaces.map((space) => {
                    const assignment = editFormData.selectedSpaces.find(s => s.spaceId === space.id);
                    return (
                      <div key={space.id} className="flex items-center justify-between p-2 bg-white rounded border">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`edit-space-${space.id}`}
                            checked={!!assignment}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditFormData({
                                  ...editFormData,
                                  selectedSpaces: [...editFormData.selectedSpaces, { spaceId: space.id, role: "member" }]
                                });
                              } else {
                                setEditFormData({
                                  ...editFormData,
                                  selectedSpaces: editFormData.selectedSpaces.filter(s => s.spaceId !== space.id)
                                });
                              }
                            }}
                            className="w-4 h-4"
                          />
                          <Label htmlFor={`edit-space-${space.id}`} className="text-sm cursor-pointer">
                            {space.name}
                          </Label>
                        </div>
                        {assignment && (
                          <select
                            value={assignment.role}
                            onChange={(e) => {
                              setEditFormData({
                                ...editFormData,
                                selectedSpaces: editFormData.selectedSpaces.map(s =>
                                  s.spaceId === space.id ? { ...s, role: e.target.value } : s
                                )
                              });
                            }}
                            className="h-8 px-2 text-xs rounded-md border border-input bg-background"
                          >
                            <option value="member">Member</option>
                            <option value="auditor">Auditor</option>
                            <option value="admin">Admin</option>
                          </select>
                        )}
                      </div>
                    );
                  })}

                  {spaces.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-2">No spaces available</p>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="edit_is_active">Active Status</Label>
                  <p className="text-xs text-slate-500">User can sign in and access the system</p>
                </div>
                <Switch
                  id="edit_is_active"
                  checked={editFormData.is_active}
                  onCheckedChange={(checked) =>
                    setEditFormData({ ...editFormData, is_active: checked })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit_new_password" className="flex items-center gap-2">
                  <Key className="w-4 h-4" />
                  New Password (optional)
                </Label>
                <Input
                  id="edit_new_password"
                  type="password"
                  value={editFormData.new_password}
                  onChange={(e) => setEditFormData({ ...editFormData, new_password: e.target.value })}
                  placeholder="Leave blank to keep current password"
                />
                {editFormData.new_password && (
                  <div className="space-y-2">
                    {/* Password strength indicator */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-600">Password strength:</span>
                        <span className={
                          getPasswordStrength(editFormData.new_password) <= 1 ? "text-red-600" :
                          getPasswordStrength(editFormData.new_password) === 2 ? "text-yellow-600" :
                          getPasswordStrength(editFormData.new_password) === 3 ? "text-blue-600" :
                          "text-green-600"
                        }>
                          {getPasswordStrength(editFormData.new_password) === 0 ? "Very Weak" :
                           getPasswordStrength(editFormData.new_password) === 1 ? "Weak" :
                           getPasswordStrength(editFormData.new_password) === 2 ? "Fair" :
                           getPasswordStrength(editFormData.new_password) === 3 ? "Good" : "Strong"}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            getPasswordStrength(editFormData.new_password) <= 1 ? "bg-red-500 w-1/4" :
                            getPasswordStrength(editFormData.new_password) === 2 ? "bg-yellow-500 w-2/4" :
                            getPasswordStrength(editFormData.new_password) === 3 ? "bg-blue-500 w-3/4" :
                            "bg-green-500 w-full"
                          }`}
                        />
                      </div>
                    </div>

                    {/* Password requirements */}
                    {(() => {
                      const validation = validatePassword(editFormData.new_password);
                      return !validation.isValid && (
                        <div className="text-xs text-slate-600 space-y-1">
                          <p className="font-medium">Requirements:</p>
                          <ul className="space-y-0.5 ml-4">
                            {validation.errors.map((error, idx) => (
                              <li key={idx} className="text-red-600">• {error}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setEditingUser(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  Update User
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
