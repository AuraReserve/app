"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Space } from "@/lib/entities";
import type { Space as SpaceType } from "@/lib/entities/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";
import { useSpace } from "@/hooks/useSpace";
import { SpacePageSkeleton, SpaceNotFound, AccessRestricted } from "@/components/spaces/space-page-shell";
import { AlertMessages } from "@/components/common/alert-messages";
import { SpacePageHeader } from "@/components/spaces/space-page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, RefreshCw, Save, Trash2, AlertTriangle, Plug, Zap, Clock, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface SpaceSettingsPageProps {
  slug: string;
}

type SpaceField = keyof Pick<SpaceType, "name" | "description" | "slug">;
type EditableSpaceFields = Pick<SpaceType, SpaceField | "api_identifier">;

export default function SpaceSettingsPage({ slug }: SpaceSettingsPageProps) {
  const router = useRouter();

  const { space: initialSpace, isLoading } = useSpace(slug);
  // Local mutable copies for form editing
  const [space, setSpace] = useState<SpaceType | null>(null);
  const [savedSpace, setSavedSpace] = useState<SpaceType | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [verificationPublic, setVerificationPublic] = useState(true);
  const [isSavingVerification, setIsSavingVerification] = useState(false);
  const { permissions, isLoading: permissionsLoading } = useSpacePermissions(space?.id);
  const { user: currentUser } = useCurrentUser();

  interface PipelineItem {
    id: string;
    displayName: string;
    key: string;
    status: string;
    trigger: string | null;
    schedule: string | null;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    direction: string;
  }
  const [pipelineInputs, setPipelineInputs] = useState<PipelineItem[]>([]);
  const [pipelineOutputs, setPipelineOutputs] = useState<PipelineItem[]>([]);

  // Sync initial space from hook
  useEffect(() => {
    if (initialSpace && initialSpace.id !== savedSpace?.id) {
      setSpace(initialSpace);
      setSavedSpace(initialSpace);
      setVerificationPublic(initialSpace.verification_public ?? true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when initialSpace changes
  }, [initialSpace]);

  useEffect(() => {
    if (!space?.id) return;
    const mapItems = (data: Array<{ id: string; status: string; trigger: string | null; schedule: string | null; lastRunAt: string | null; lastRunStatus: string | null; direction: string; integration: { displayName: string; key: string } }>, dir: string): PipelineItem[] =>
      data.map((p) => ({
        id: p.id,
        displayName: p.integration.displayName,
        key: p.integration.key,
        status: p.status,
        trigger: p.trigger,
        schedule: p.schedule,
        lastRunAt: p.lastRunAt,
        lastRunStatus: p.lastRunStatus,
        direction: dir,
      }));

    Promise.all([
      fetch(`/api/spaces/${space.id}/data-inputs`).then((res) => (res.ok ? res.json() : null)),
      fetch(`/api/spaces/${space.id}/data-outputs`).then((res) => (res.ok ? res.json() : null)),
    ]).then(([inputsData, outputsData]) => {
      if (Array.isArray(inputsData)) setPipelineInputs(mapItems(inputsData, "input"));
      if (Array.isArray(outputsData)) setPipelineOutputs(mapItems(outputsData, "output"));
    }).catch(() => {});
  }, [space?.id]);

  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [successMessage]);

  const handleFieldChange = (field: SpaceField, rawValue: SpaceType[SpaceField]) => {
    if (!savedSpace) return;
    let value = rawValue;

    if (field === "slug" && typeof rawValue === "string") {
      const formatted = rawValue
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");

      value = formatted as SpaceType[SpaceField];
    }

    setSpace((prev) => {
      if (!prev) return prev;
      const next: SpaceType = { ...prev, [field]: value };

      if (field === "slug" && prev.api_identifier_source === "slug") {
        next.api_identifier = String(value);
      }

      return next;
    });

    // Check if there are unsaved changes
    setHasUnsavedChanges(true);
    setError(null);
    setSuccessMessage(null);
  };

  const handleSave = async () => {
    if (!space || !savedSpace) return;

    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!savedSpace?.id) {
        throw new Error('Missing space identifier');
      }

      // Build payload with all changed fields
      const payload: Partial<EditableSpaceFields> = {};
      const changedFields: SpaceField[] = [];
      const trackableFields: SpaceField[] = ["name", "description", "slug"];

      trackableFields.forEach((field) => {
        if (space[field] !== savedSpace[field]) {
          (payload as Record<SpaceField, SpaceType[SpaceField]>)[field] = space[field];
          changedFields.push(field);
        }
      });

      if (Object.keys(payload).length === 0) {
        setHasUnsavedChanges(false);
        setSuccessMessage("No changes to save");
        setIsSaving(false);
        return;
      }

      // Validate slug
      if (payload.slug && typeof payload.slug === "string" && !payload.slug.trim()) {
        setError("Slug cannot be empty. Please provide a URL-safe value.");
        setIsSaving(false);
        return;
      }

      // Handle slug change for API identifier
      if (payload.slug && savedSpace.api_identifier_source === "slug") {
        payload.api_identifier = payload.slug as SpaceType["api_identifier"];
      }

      const updatedSpace = await Space.update(savedSpace.id, payload);

      if (updatedSpace) {
        setSavedSpace(updatedSpace);
        setSpace(updatedSpace);
        setHasUnsavedChanges(false);

        const slugChanged = changedFields.includes("slug");
        setSuccessMessage(
          slugChanged
            ? "Settings saved. URLs and API endpoints now use the new slug."
            : "Settings saved successfully"
        );

        // If slug changed, redirect to new URL
        if (slugChanged && updatedSpace.slug) {
          setTimeout(() => {
            router.replace(`/spaces/${updatedSpace.slug}/settings`);
            router.refresh();
          }, 1000);
        }
      }
    } catch (err) {
      console.error("Error saving space settings:", err);
      setError("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteSpace = async () => {
    if (!space || !savedSpace?.id) return;
    if (deleteConfirmation !== space.name) {
      setError("Space name doesn't match. Please try again.");
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await Space.delete(savedSpace.id);
      setShowDeleteDialog(false);
      router.push("/spaces");
      router.refresh();
    } catch (err) {
      console.error("Error deleting space:", err);
      setError("Failed to delete space. Please try again.");
      setIsDeleting(false);
    }
  };

  const handleVerificationToggle = async (checked: boolean) => {
    if (!space?.id) return;
    setIsSavingVerification(true);
    try {
      await Space.update(space.id, { verification_public: checked });
      setVerificationPublic(checked);
    } catch (err) {
      console.error("Failed to update verification setting:", err);
      // Revert on failure
      setVerificationPublic(!checked);
    } finally {
      setIsSavingVerification(false);
    }
  };

  const normalizedRole = currentUser?.role ? currentUser.role.toLowerCase() : "";
  const isOwner = normalizedRole === "owner";
  const isAdmin = normalizedRole === "admin";
  const canDelete = isOwner || isAdmin;

  if (isLoading || !space || permissionsLoading) {
    if (!isLoading && !initialSpace) {
      return <SpaceNotFound slug={slug} />;
    }
    return <SpacePageSkeleton />;
  }

  // Check permissions - only admins can access settings
  if (!permissions.canManageSettings) {
    return (
      <AccessRestricted
        slug={slug}
        spaceName={space.name}
        backHref={`/spaces/${slug}`}
        message="Only space administrators can modify space settings. You have read-only access to this space."
      />
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto space-y-6">
        <SpacePageHeader
          slug={slug}
          spaceName={space.name}
          title="Settings"
          description="Configure access and metadata for this space."
          action={
            <Button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          }
        />

        <AlertMessages error={error} success={successMessage} />

        {hasUnsavedChanges && !error && !successMessage && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>You have unsaved changes. Click "Save Changes" to apply them.</AlertDescription>
          </Alert>
        )}


        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <CardTitle>Space Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid w-full max-w-sm gap-1.5">
              <Label htmlFor="space_name_input">Space Name</Label>
              <Input
                id="space_name_input"
                value={space.name}
                onChange={(event) => handleFieldChange("name", event.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="grid w-full gap-1.5">
              <Label htmlFor="space_description_input">Description</Label>
              <Textarea
                id="space_description_input"
                value={space.description}
                onChange={(event) => handleFieldChange("description", event.target.value)}
                disabled={isSaving}
                rows={4}
              />
            </div>

            <div className="grid w-full max-w-sm gap-1.5">
              <Label htmlFor="space_slug_input">Space Slug</Label>
              <Input
                id="space_slug_input"
                value={space.slug}
                onChange={(event) => handleFieldChange("slug", event.target.value)}
                disabled={isSaving}
                placeholder="example-space"
              />
              <p className="text-xs text-amber-600">
                Changing the slug updates all URLs, API endpoints, and plugin configurations that reference this space.
                Make sure connected systems are updated.
              </p>
            </div>

          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="w-5 h-5 text-purple-600" />
                  Data Pipeline
                </CardTitle>
                <CardDescription>
                  How reserve data enters and leaves this space
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Link href={`/spaces/${slug}/input`}>
                  <Button variant="outline" size="sm">
                    Manage Inputs
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
                <Link href={`/spaces/${slug}/output`}>
                  <Button variant="outline" size="sm">
                    Manage Outputs
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input Sources */}
            <div>
              <Label className="text-xs uppercase text-slate-500 mb-2 block">Input Sources</Label>
              {pipelineInputs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                  No data sources configured.{" "}
                  <Link href={`/spaces/${slug}/input`} className="text-blue-600 hover:underline">
                    Configure one
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {pipelineInputs.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <Zap className="w-5 h-5 text-blue-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{item.displayName}</span>
                          <Badge variant="outline" className="text-xs">{item.key}</Badge>
                          <Badge variant={item.status === "active" ? "default" : "secondary"} className="text-xs">
                            {item.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          {item.trigger && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {item.trigger}
                            </span>
                          )}
                          {item.lastRunAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last run: {new Date(item.lastRunAt).toLocaleString()}
                            </span>
                          )}
                          {item.lastRunStatus && (
                            <span className="flex items-center gap-1">
                              {item.lastRunStatus === "success" ? (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              ) : (
                                <XCircle className="w-3 h-3 text-red-500" />
                              )}
                              {item.lastRunStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Output Destinations */}
            <div>
              <Label className="text-xs uppercase text-slate-500 mb-2 block">Output Destinations</Label>
              {pipelineOutputs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
                  No output destinations configured.{" "}
                  <Link href={`/spaces/${slug}/output`} className="text-blue-600 hover:underline">
                    Configure one
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {pipelineOutputs.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <Plug className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900">{item.displayName}</span>
                          <Badge variant="outline" className="text-xs">{item.key}</Badge>
                          <Badge variant={item.status === "active" ? "default" : "secondary"} className="text-xs">
                            {item.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          {item.trigger && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {item.trigger}
                            </span>
                          )}
                          {item.lastRunAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Last run: {new Date(item.lastRunAt).toLocaleString()}
                            </span>
                          )}
                          {item.lastRunStatus && (
                            <span className="flex items-center gap-1">
                              {item.lastRunStatus === "success" ? (
                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                              ) : (
                                <XCircle className="w-3 h-3 text-red-500" />
                              )}
                              {item.lastRunStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>


        {/* Verification Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Public Verification</CardTitle>
            <CardDescription>
              Allow anyone to verify their data is included in this space&apos;s Merkle tree proofs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Enable public verification page</Label>
                <p className="text-sm text-slate-500 mt-0.5">
                  When enabled, anyone with the link can verify their inclusion.
                </p>
              </div>
              <Switch
                checked={verificationPublic}
                onCheckedChange={handleVerificationToggle}
                disabled={isSavingVerification}
              />
            </div>
            {verificationPublic && space?.slug && (
              <div className="text-sm text-slate-500 bg-slate-50 rounded-md p-3">
                <span className="text-slate-400">Verification URL:</span>
                <div className="font-mono text-xs mt-1 text-slate-700">
                  /verify/{space.slug}/&lt;stream-slug&gt;
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {canDelete && (
          <Card className="shadow-sm border-red-200 bg-red-50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <CardTitle className="text-red-900">Danger Zone</CardTitle>
              </div>
              <CardDescription className="text-red-700">
                Irreversible and destructive actions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 p-4 bg-white rounded-lg border border-red-200">
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900">Delete this space</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    Once you delete a space, there is no going back. This will permanently delete all reserves,
                    API keys, and audit logs associated with this space.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteDialog(true)}
                  className="self-center"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Space
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">Delete Space</DialogTitle>
                  <DialogDescription className="mt-1">
                    This action cannot be undone
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Warning:</strong> This will permanently delete the space "{space?.name}" and all associated data including:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>All proof-of-reserve records</li>
                    <li>All API keys and access logs</li>
                    <li>All audit logs</li>
                    <li>Space settings and configuration</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="delete-confirmation" className="text-sm font-medium text-slate-700">
                  Type <span className="font-mono font-bold">{space?.name}</span> to confirm
                </Label>
                <Input
                  id="delete-confirmation"
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="Enter space name"
                  className="font-mono"
                  disabled={isDeleting}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteConfirmation("");
                  setError(null);
                }}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteSpace}
                disabled={isDeleting || deleteConfirmation !== space?.name}
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Space Permanently
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}
