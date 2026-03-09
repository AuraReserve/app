"use client";

import React, { useState } from "react";
import { useSession, twoFactor } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Key, Shield, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { TwoFactorSetupDialog } from "@/components/auth/two-factor-setup-dialog";
import { BackupCodesDialog } from "@/components/auth/backup-codes-dialog";

interface SpaceInfo {
  spaceId: string;
  spaceName: string;
  role: string;
}

interface ExtendedUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
  role?: string;
  twoFactorEnabled?: boolean;
  spaces?: SpaceInfo[];
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const [isEditing, setIsEditing] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 2FA state
  const [showTwoFactorSetup, setShowTwoFactorSetup] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [isDisabling2FA, setIsDisabling2FA] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const user = session?.user as ExtendedUser | undefined;

  const [profileData, setProfileData] = useState({
    full_name: user?.name || "",
    company: "",
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/entities/users", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: user?.id,
          full_name: profileData.full_name,
          company: profileData.company || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update profile");
      }

      setSuccess("Profile updated successfully. Please refresh the page to see changes.");
      setIsEditing(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to update profile");
      }
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate current password is provided
    if (!passwordData.currentPassword) {
      setError("Current password is required");
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    try {
      // Use dedicated password change endpoint that verifies current password
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to change password");
      }

      setSuccess("Password changed successfully");
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setIsChangingPassword(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to change password");
      }
    }
  };

  const handleDisable2FA = async () => {
    setError(null);
    setSuccess(null);

    try {
      const result = await twoFactor.disable({
        password: disablePassword,
      });

      if (result.error) {
        setError(result.error.message || "Failed to disable 2FA");
        return;
      }

      setSuccess("Two-factor authentication has been disabled");
      setIsDisabling2FA(false);
      setDisablePassword("");
      setDisableCode("");
      // Refresh the page to update the session
      window.location.reload();
    } catch (err) {
      console.error("Error disabling 2FA:", err);
      setError("An unexpected error occurred");
    }
  };

  const handleTwoFactorSetupSuccess = () => {
    setSuccess("Two-factor authentication has been enabled");
    // Refresh the page to update the session
    window.location.reload();
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default";
      case "admin":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner":
        return "Owner";
      case "admin":
        return "Admin";
      case "space_admin":
        return "Space Admin";
      case "member":
        return "Member";
      default:
        return role || "User";
    }
  };

  if (!user) {
    return null;
  }

  const userRole = user.role || "";
  const userSpaces = user.spaces || [];

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Profile</h1>
          <p className="text-slate-600 mt-1">Manage your account settings and preferences</p>
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

        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Your personal information and role</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-white">
                  {user.name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "U"}
                </span>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">{user.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-slate-600">{user.email}</p>
                  {userRole && (
                    <Badge variant={getRoleBadgeVariant(userRole)}>
                      {getRoleLabel(userRole)}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {!isEditing ? (
              <div className="space-y-4 pt-4 border-t">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500">Full Name</p>
                    <p className="text-slate-900">{user.name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Email</p>
                    <p className="text-slate-900">{user.email}</p>
                  </div>
                </div>
                <Button onClick={() => setIsEditing(true)} variant="outline">
                  Edit Profile
                </Button>
              </div>
            ) : (
              <form onSubmit={handleUpdateProfile} className="space-y-4 pt-4 border-t">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={profileData.full_name}
                    onChange={(e) => setProfileData({ ...profileData, full_name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={profileData.company}
                    onChange={(e) => setProfileData({ ...profileData, company: e.target.value })}
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit">
                    Save Changes
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
            <CardDescription>Manage your password and security settings</CardDescription>
          </CardHeader>
          <CardContent>
            {!isChangingPassword ? (
              <Button onClick={() => setIsChangingPassword(true)} variant="outline">
                <Key className="w-4 h-4 mr-2" />
                Change Password
              </Button>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-slate-500">Must be at least 8 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit">
                    Update Password
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsChangingPassword(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Two-Factor Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Two-Factor Authentication
            </CardTitle>
            <CardDescription>
              Add an extra layer of security to your account
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {user?.twoFactorEnabled ? (
              <>
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <ShieldCheck className="w-6 h-6 text-green-600" />
                  <div>
                    <p className="font-medium text-green-900">2FA is enabled</p>
                    <p className="text-sm text-green-700">
                      Your account is protected with two-factor authentication
                    </p>
                  </div>
                </div>

                {!isDisabling2FA ? (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowBackupCodes(true)}
                    >
                      <Key className="w-4 h-4 mr-2" />
                      View Backup Codes
                    </Button>
                    <Button
                      variant="outline"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setIsDisabling2FA(true)}
                    >
                      <ShieldOff className="w-4 h-4 mr-2" />
                      Disable 2FA
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <p className="text-sm text-slate-600">
                      Enter your password and a verification code to disable 2FA:
                    </p>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="disable-password">Password</Label>
                        <Input
                          id="disable-password"
                          type="password"
                          value={disablePassword}
                          onChange={(e) => setDisablePassword(e.target.value)}
                          placeholder="Enter your password"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="disable-code">Verification Code</Label>
                        <Input
                          id="disable-code"
                          type="text"
                          value={disableCode}
                          onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          placeholder="000000"
                          className="font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        onClick={handleDisable2FA}
                        disabled={!disablePassword || disableCode.length < 6}
                      >
                        Disable 2FA
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setIsDisabling2FA(false);
                          setDisablePassword("");
                          setDisableCode("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <Shield className="w-6 h-6 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-900">2FA is not enabled</p>
                    <p className="text-sm text-amber-700">
                      Enable two-factor authentication to better protect your account
                    </p>
                  </div>
                </div>

                <Button onClick={() => setShowTwoFactorSetup(true)}>
                  <Smartphone className="w-4 h-4 mr-2" />
                  Enable Two-Factor Authentication
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Account Spaces */}
        {userSpaces.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Spaces</CardTitle>
              <CardDescription>Spaces you have access to</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {userSpaces.map((space) => (
                  <div key={space.spaceId} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="font-medium text-slate-900">{space.spaceName}</p>
                      <p className="text-sm text-slate-600">Role: {getRoleLabel(space.role)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 2FA Dialogs */}
      <TwoFactorSetupDialog
        open={showTwoFactorSetup}
        onOpenChange={setShowTwoFactorSetup}
        onSuccess={handleTwoFactorSetupSuccess}
      />
      <BackupCodesDialog
        open={showBackupCodes}
        onOpenChange={setShowBackupCodes}
      />
    </div>
  );
}
