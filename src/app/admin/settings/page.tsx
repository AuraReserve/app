"use client";

import React, { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { isOwner as checkIsOwner } from "@/lib/permissions";

interface SettingData {
  key: string;
  value: string;
  description?: string | null;
}

export default function GlobalSettingsPage() {
  const { data: session } = useSession();
  const [settings, setSettings] = useState<SettingData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isOwner = checkIsOwner(session?.user?.role);

  useEffect(() => {
    if (!isOwner) {
      return;
    }
    loadSettings();
  }, [isOwner]);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      setError("Failed to load settings");
    }
    setIsLoading(false);
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          settings: settings.map((s) => ({ key: s.key, value: s.value })),
          updatedBy: session?.user?.id,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setSuccess("Settings saved successfully");
      await loadSettings();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to save settings");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value } : s))
    );
  };

  const getBooleanValue = (key: string): boolean => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value === "true" || setting?.value === "1";
  };

  const getStringValue = (key: string): string => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || "";
  };

  if (!isOwner) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Only owners can access application settings.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Global Settings</h1>
            <p className="text-slate-600 mt-1">Manage global application configuration</p>
          </div>
          <Button
            onClick={handleSaveSettings}
            disabled={isSaving}
          >
            <Save className="w-4 h-4 mr-2" />
            {isSaving ? "Saving..." : "Save Changes"}
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

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-slate-500">Loading settings...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Authentication & Registration */}
            <Card>
              <CardHeader>
                <CardTitle>Authentication & Registration</CardTitle>
                <CardDescription>Control user signup and registration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="signup_enabled">Enable Signup Page</Label>
                    <p className="text-sm text-slate-500">
                      Show signup link on login page and allow access to /auth/signup
                    </p>
                  </div>
                  <Switch
                    id="signup_enabled"
                    checked={getBooleanValue("signup_enabled")}
                    onCheckedChange={(checked) =>
                      updateSetting("signup_enabled", checked ? "true" : "false")
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="allow_self_registration">Allow Self Registration</Label>
                    <p className="text-sm text-slate-500">
                      New users can complete signup (if disabled, only owner can create users)
                    </p>
                  </div>
                  <Switch
                    id="allow_self_registration"
                    checked={getBooleanValue("allow_self_registration")}
                    onCheckedChange={(checked) =>
                      updateSetting("allow_self_registration", checked ? "true" : "false")
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="require_email_verification">Require Email Verification</Label>
                    <p className="text-sm text-slate-500">
                      Users must verify their email before accessing the app
                    </p>
                  </div>
                  <Switch
                    id="require_email_verification"
                    checked={getBooleanValue("require_email_verification")}
                    onCheckedChange={(checked) =>
                      updateSetting("require_email_verification", checked ? "true" : "false")
                    }
                  />
                </div>
              </CardContent>
            </Card>

            {/* System Settings */}
            <Card>
              <CardHeader>
                <CardTitle>System Settings</CardTitle>
                <CardDescription>General application configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="maintenance_mode">Maintenance Mode</Label>
                    <p className="text-sm text-slate-500">
                      Put the application in maintenance mode
                    </p>
                  </div>
                  <Switch
                    id="maintenance_mode"
                    checked={getBooleanValue("maintenance_mode")}
                    onCheckedChange={(checked) =>
                      updateSetting("maintenance_mode", checked ? "true" : "false")
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="app_name">Application Name</Label>
                  <Input
                    id="app_name"
                    value={getStringValue("app_name")}
                    onChange={(e) => updateSetting("app_name", e.target.value)}
                    placeholder="AuraReserve"
                  />
                  <p className="text-xs text-slate-500">
                    Displayed in the UI and page titles
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* API Settings */}
            <Card>
              <CardHeader>
                <CardTitle>API Settings</CardTitle>
                <CardDescription>Configure API limits and restrictions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="max_api_keys_per_space">Max API Keys Per Space</Label>
                  <Input
                    id="max_api_keys_per_space"
                    type="number"
                    value={getStringValue("max_api_keys_per_space")}
                    onChange={(e) => updateSetting("max_api_keys_per_space", e.target.value)}
                    min="1"
                    max="100"
                  />
                  <p className="text-xs text-slate-500">
                    Maximum number of API keys allowed per space (1-100)
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
