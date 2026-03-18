"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCsrfFetch } from "@/hooks/useCsrfFetch";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSpace } from "@/hooks/useSpace";
import { useFormState } from "@/hooks/useFormState";
import { isAdmin as checkIsAdmin } from "@/lib/permissions";
import { AlertMessages } from "@/components/common/alert-messages";
import { StatusDot } from "@/components/common/status-dot";
import { EmptyStateCard } from "@/components/common/empty-state-card";
import { SpacePageHeader } from "@/components/spaces/space-page-header";
import {
  SpacePageSkeleton,
  SpaceNotFound,
  AccessRestricted,
} from "@/components/spaces/space-page-shell";
import {
  ARTIFACT_LABELS_SHORT,
  ARTIFACT_BADGE_COLORS,
  ARTIFACT_OPTIONS,
  isMerkleArtifactType,
} from "@/lib/artifact-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AssetTypeSelect } from "@/components/common/asset-type-select";
import {
  IntegrationConfigFieldsWithDirection,
  hasConfigFields,
} from "@/components/integrations/integration-config-fields";
import type { IntegrationConfig } from "@/components/integrations/integration-config-fields";
import { CronScheduleInput } from "@/components/integrations/cron-schedule-input";
import {
  Plus,
  Database,
  ChevronRight,
  Lock,
  Pencil,
} from "lucide-react";

import {
  IntegrationCatalogList,
  type CatalogIntegration,
} from "@/components/spaces/integration-catalog-list";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataInputEntry {
  id: string;
  value: number | null;
  timestamp: string;
}

interface DataInputItem {
  id: string;
  spaceId: string;
  integrationId: string;
  streamId: string;
  direction: string;
  status: string;
  config: Record<string, unknown>;
  schedule: string | null;
  trigger: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdDate: string;
  accessGroupId: string | null;
  accessGroup: { id: string; name: string } | null;
  integration: {
    id: string;
    key: string;
    displayName: string;
    description: string;
    supportsInput: boolean;
    supportsOutput: boolean;
    isFree: boolean;
    supportedTriggers: string[];
    configSchema: Record<string, unknown>;
  };
  stream: {
    id: string;
    name: string;
    slug: string;
    artifactType: string;
    isActive: boolean;
    valueField: string | null;
    entries: DataInputEntry[];
    _count: { entries: number };
  };
}

interface AccessGroup {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DataInputPage({ slug }: { slug: string }) {
  const router = useRouter();
  const { space, isLoading: spaceLoading } = useSpace(slug);
  const [inputs, setInputs] = useState<DataInputItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogIntegration[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const { error, success, setError, setSuccess } = useFormState();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingInput, setEditingInput] = useState<DataInputItem | null>(null);

  const { permissions } = useSpacePermissions(space?.id);
  const { csrfFetch } = useCsrfFetch();
  const { user } = useCurrentUser();
  const isPlatformAdmin = checkIsAdmin(user?.role);
  const canView = isPlatformAdmin || permissions.canViewData;
  const canManage = isPlatformAdmin || permissions.canManageInputs;

  // ── Data loading ──────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!space?.id) return;
    setDataLoading(true);
    try {
      const [inputsRes, catalogRes] = await Promise.all([
        fetch(`/api/spaces/${space.id}/data-inputs`),
        fetch(`/api/spaces/${space.id}/integrations/catalog`),
      ]);

      if (inputsRes.ok) {
        setInputs(await inputsRes.json());
      }
      if (catalogRes.ok) {
        const data = await catalogRes.json();
        setCatalog(data.inputSources ?? []);
      }
    } catch {
      setError("Failed to load data inputs.");
    }
    setDataLoading(false);
  }, [space?.id, setError]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Render helpers ────────────────────────────────────────────────────

  const formatLatestValue = (input: DataInputItem): string => {
    const latestEntry = input.stream.entries?.[0];
    if (!latestEntry) return "--";
    if (latestEntry.value !== null && latestEntry.value !== undefined) {
      return String(latestEntry.value);
    }
    return `${input.stream._count.entries} entries`;
  };

  // ── Guards ────────────────────────────────────────────────────────────

  if (spaceLoading || dataLoading) return <SpacePageSkeleton />;
  if (!space) return <SpaceNotFound slug={slug} />;
  if (!canView) {
    return (
      <AccessRestricted
        slug={slug}
        spaceName={space.name}
        backHref={`/spaces/${slug}`}
        message="You do not have access to data input settings for this space."
      />
    );
  }

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <SpacePageHeader
          slug={slug}
          spaceName={space.name}
          title="Data Input"
          description="Manage data sources that feed data into your stores."
          action={canManage ? (
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Data Input
            </Button>
          ) : undefined}
        />

        <AlertMessages error={error} success={success} />

        {!canManage && (
          <Alert>
            <AlertDescription>
              Read-only mode: you can view data inputs, but only admins can add,
              edit, or remove them.
            </AlertDescription>
          </Alert>
        )}

        {/* Input cards */}
        {inputs.length === 0 ? (
          <EmptyStateCard
            icon={Database}
            message={`No data inputs configured.${canManage ? " Add one to start feeding data into your stores." : ""}`}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inputs.map((input) => {
              const artifactKey = input.stream.artifactType?.toLowerCase();
              const badgeColor =
                ARTIFACT_BADGE_COLORS[artifactKey] ??
                "bg-slate-100 text-slate-800";
              const badgeLabel =
                ARTIFACT_LABELS_SHORT[artifactKey] ?? input.stream.artifactType;

              return (
                <Card
                  key={input.id}
                  className="cursor-pointer hover:shadow-md transition-shadow group"
                  onClick={() =>
                    router.push(`/spaces/${slug}/input/${input.id}`)
                  }
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base truncate pr-2">
                        {input.stream.name}
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        {canManage && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingInput(input);
                            }}
                            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Edit settings"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 mt-0.5" />
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                      <Badge className={`text-xs ${badgeColor}`}>
                        {badgeLabel}
                      </Badge>
                      <span className="text-xs text-slate-500">
                        {input.integration.displayName}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <StatusDot status={input.status} />
                          Status
                        </span>
                        <span className="capitalize text-slate-700">
                          {input.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Latest Value</span>
                        <span className="font-medium text-slate-900">
                          {formatLatestValue(input)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Entries</span>
                        <span className="text-slate-700">
                          {input.stream._count.entries}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Access</span>
                        <span className="text-slate-700 flex items-center gap-1">
                          {input.accessGroup ? (
                            <>
                              <Lock className="w-3 h-3" />
                              {input.accessGroup.name}
                            </>
                          ) : (
                            "Open"
                          )}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add Data Input Dialog */}
        {space && (
          <AddDataInputDialog
            open={showAddDialog}
            onOpenChange={setShowAddDialog}
            spaceId={space.id}
            catalog={catalog}
            existingInputs={inputs}
            csrfFetch={csrfFetch}
            onCreated={() => {
              setShowAddDialog(false);
              setSuccess("Data input created successfully.");
              loadData();
            }}
            setError={setError}
          />
        )}

        {/* Edit Data Input Dialog */}
        {space && editingInput && (
          <EditDataInputDialog
            open={!!editingInput}
            onOpenChange={(open) => { if (!open) setEditingInput(null); }}
            spaceId={space.id}
            input={editingInput}
            csrfFetch={csrfFetch}
            onSaved={() => {
              setEditingInput(null);
              setSuccess("Data input updated successfully.");
              loadData();
            }}
            setError={setError}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Data Input Dialog (multi-step)
// ---------------------------------------------------------------------------

function AddDataInputDialog({
  open,
  onOpenChange,
  spaceId,
  catalog,
  existingInputs,
  csrfFetch,
  onCreated,
  setError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  catalog: CatalogIntegration[];
  existingInputs: DataInputItem[];
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onCreated: () => void;
  setError: (msg: string | null) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Select integration type
  const [selectedKey, setSelectedKey] = useState("");

  // Step 2: Configuration
  const [name, setName] = useState("");
  const [artifactType, setArtifactType] = useState("value");
  const [assetType, setAssetType] = useState("");
  const [unit, setUnit] = useState("");
  const [valueField, setValueField] = useState("");
  const [accessLevel, setAccessLevel] = useState<"open" | "restricted">("open");
  const [accessGroupId, setAccessGroupId] = useState("");
  const [trigger, setTrigger] = useState("");
  const [schedule, setSchedule] = useState("");
  const [integrationConfig, setIntegrationConfig] = useState<IntegrationConfig>({});
  const [useExisting, setUseExisting] = useState(false);
  const [existingStreamId, setExistingStreamId] = useState("");

  // Groups for restricted access
  const [groups, setGroups] = useState<AccessGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const selectedIntegration = catalog.find((c) => c.key === selectedKey);
  const isManual = selectedKey === "manual";
  const showTrigger =
    selectedIntegration &&
    selectedIntegration.supportedTriggers.length > 0;
  const isMerkle = isMerkleArtifactType(artifactType);

  // Filter existing streams by matching artifact type
  const matchingStreams = existingInputs.filter(
    (i) => i.stream.artifactType?.toLowerCase() === artifactType.toLowerCase()
  );

  // Reset state when dialog opens/closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  };

  const resetForm = () => {
    setStep(1);
    setSelectedKey("");
    setName("");
    setArtifactType("value");
    setAssetType("");
    setUnit("");
    setValueField("");
    setAccessLevel("open");
    setAccessGroupId("");
    setTrigger("");
    setSchedule("");
    setIntegrationConfig({});
    setUseExisting(false);
    setExistingStreamId("");
  };

  // Fetch groups when "restricted" is selected
  useEffect(() => {
    if (accessLevel === "restricted" && groups.length === 0 && !groupsLoading) {
      setGroupsLoading(true);
      fetch(`/api/spaces/${spaceId}/groups`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setGroups(data))
        .catch(() => setGroups([]))
        .finally(() => setGroupsLoading(false));
    }
  }, [accessLevel, spaceId, groups.length, groupsLoading]);

  const handleSelectIntegration = (key: string) => {
    setSelectedKey(key);
    const integration = catalog.find((c) => c.key === key);
    // Set default trigger if available
    if (integration?.supportedTriggers.length) {
      setTrigger(integration.supportedTriggers[0].toLowerCase());
    } else {
      setTrigger("");
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedKey || (!useExisting && !name)) return;
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        integrationKey: selectedKey,
        artifactType,
        name: useExisting ? undefined : name,
        assetType: assetType || undefined,
        unit: unit || undefined,
        valueField: isMerkle ? valueField : undefined,
        existingStreamId: useExisting ? existingStreamId : undefined,
        accessGroupId:
          isManual && accessLevel === "restricted" ? accessGroupId : undefined,
        trigger: trigger || undefined,
        schedule: trigger === "cron" ? schedule : undefined,
        config: Object.keys(integrationConfig).length > 0 ? integrationConfig : undefined,
      };

      const res = await csrfFetch(`/api/spaces/${spaceId}/data-inputs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create data input.");
        setSubmitting(false);
        return;
      }

      onCreated();
      resetForm();
    } catch {
      setError("Failed to create data input.");
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Select Input Type" : "Configure Data Input"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Choose how data will be ingested into this space."
              : `Configure the "${selectedIntegration?.displayName}" data input.`}
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <IntegrationCatalogList
            catalog={catalog}
            direction="input"
            csrfFetch={csrfFetch}
            spaceId={spaceId}
            onSelect={handleSelectIntegration}
            setError={setError}
          />
        )}

        {step === 2 && (
          <div className="space-y-4">
            {/* New or existing stream */}
            {matchingStreams.length > 0 && (
              <div className="space-y-2">
                <Label>Stream</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setUseExisting(false)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      !useExisting
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-medium">Create new stream</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseExisting(true)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      useExisting
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-medium">Add to existing</span>
                  </button>
                </div>
              </div>
            )}

            {useExisting ? (
              <div className="space-y-2">
                <Label>Existing Stream</Label>
                <Select
                  value={existingStreamId}
                  onValueChange={setExistingStreamId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stream..." />
                  </SelectTrigger>
                  <SelectContent>
                    {matchingStreams.map((i) => (
                      <SelectItem key={i.stream.id} value={i.stream.id}>
                        {i.stream.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Gold Reserve Value"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data Type</Label>
                  <Select value={artifactType} onValueChange={setArtifactType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ARTIFACT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      Asset Type{" "}
                      <span className="text-slate-400 font-normal">
                        (optional)
                      </span>
                    </Label>
                    <AssetTypeSelect
                      value={assetType}
                      onValueChange={setAssetType}
                      placeholder="Select asset type..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Unit{" "}
                      <span className="text-slate-400 font-normal">
                        (optional)
                      </span>
                    </Label>
                    <Input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="e.g., oz"
                    />
                  </div>
                </div>

                {isMerkle && (
                  <div className="space-y-2">
                    <Label>Value Field</Label>
                    <Input
                      value={valueField}
                      onChange={(e) => setValueField(e.target.value)}
                      placeholder="e.g., balance"
                    />
                    <p className="text-xs text-slate-500">
                      The field in each leaf used to compute the sum for merkle
                      sum trees.
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Access level — only for manual input */}
            {isManual && !useExisting && (
              <div className="space-y-3">
                <Label>Access Level</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAccessLevel("open")}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      accessLevel === "open"
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-medium">Open</span>
                    <p className="text-xs mt-0.5 opacity-70">Visible to all members</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccessLevel("restricted")}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                      accessLevel === "restricted"
                        ? "border-blue-600 bg-blue-50 text-blue-900"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    <span className="font-medium flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Restricted
                    </span>
                    <p className="text-xs mt-0.5 opacity-70">Group access only</p>
                  </button>
                </div>
                {accessLevel === "restricted" && (
                  <div className="space-y-2">
                    <Label>Access Group</Label>
                    <Select
                      value={accessGroupId}
                      onValueChange={setAccessGroupId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={
                            groupsLoading
                              ? "Loading groups..."
                              : "Select group..."
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                        {groups.length === 0 && !groupsLoading && (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No groups available
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Trigger — for integrations with supported triggers */}
            {showTrigger && (
              <div className="space-y-2">
                <Label>Trigger</Label>
                <Select value={trigger} onValueChange={setTrigger}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedIntegration!.supportedTriggers.map((t) => {
                      const key = t.toLowerCase();
                      const labels: Record<string, string> = {
                        manual: "Manual",
                        cron: "Cron Schedule",
                        on_change: "On New Entry",
                      };
                      return (
                        <SelectItem key={key} value={key}>
                          {labels[key] ?? key}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {trigger === "cron" && (
              <CronScheduleInput
                value={schedule}
                onChange={setSchedule}
                label="Schedule"
              />
            )}

            {/* Integration-specific config fields */}
            {hasConfigFields(selectedKey) && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-slate-700 mb-3">
                  {selectedIntegration?.displayName} Configuration
                </p>
                <IntegrationConfigFieldsWithDirection
                  integrationKey={selectedKey}
                  direction="input"
                  config={integrationConfig}
                  onChange={setIntegrationConfig}
                />
              </div>
            )}
          </div>
        )}

        <div className="border-t pt-4 mt-2">
          <DialogFooter>
            {step === 2 && (
              <Button
                variant="outline"
                onClick={() => {
                  setStep(1);
                  setSelectedKey("");
                }}
                className="mr-auto"
              >
                Back
              </Button>
            )}
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            {step === 2 && (
              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (!useExisting && !name) ||
                  (useExisting && !existingStreamId) ||
                  (isMerkle && !useExisting && !valueField)
                }
              >
                {submitting ? "Creating..." : "Create"}
              </Button>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit Data Input Dialog
// ---------------------------------------------------------------------------

function EditDataInputDialog({
  open,
  onOpenChange,
  spaceId,
  input,
  csrfFetch,
  onSaved,
  setError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  input: DataInputItem;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  onSaved: () => void;
  setError: (msg: string | null) => void;
}) {
  const [name, setName] = useState(input.stream.name);
  const [valueField, setValueField] = useState(input.stream.valueField ?? "");
  const [configData, setConfigData] = useState<IntegrationConfig>(
    (input.config as IntegrationConfig) || {}
  );
  const [saving, setSaving] = useState(false);

  const isMerkle = isMerkleArtifactType(input.stream.artifactType);
  const showConfig = hasConfigFields(input.integration.key);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      // Stream updates (name, valueField)
      const streamBody: Record<string, unknown> = {};
      if (name !== input.stream.name) streamBody.name = name;
      if (isMerkle) {
        const newVal = valueField.trim() || null;
        if (newVal !== (input.stream.valueField ?? null)) {
          streamBody.valueField = newVal;
        }
      }

      if (Object.keys(streamBody).length > 0) {
        const res = await csrfFetch(
          `/api/spaces/${spaceId}/stores/${input.stream.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(streamBody),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to update data input.");
          setSaving(false);
          return;
        }
      }

      // Integration config update
      const origConfig = JSON.stringify(input.config || {});
      const newConfig = JSON.stringify(configData);
      if (showConfig && newConfig !== origConfig) {
        const res = await csrfFetch(
          `/api/spaces/${spaceId}/data-inputs/${input.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ config: configData }),
          }
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || "Failed to update integration config.");
          setSaving(false);
          return;
        }
      }

      onSaved();
    } catch {
      setError("Failed to update data input.");
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {input.integration.displayName}</DialogTitle>
          <DialogDescription>
            Update settings for &ldquo;{input.stream.name}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {isMerkle && (
            <div className="space-y-2">
              <Label>Value Field</Label>
              <Input
                value={valueField}
                onChange={(e) => setValueField(e.target.value)}
                placeholder="e.g., balance, weight_oz, grams"
              />
              <p className="text-xs text-slate-500">
                The numeric field in each leaf&apos;s <code className="bg-slate-100 px-1 rounded">data</code> object used to compute totals.
              </p>
            </div>
          )}

          {/* Integration-specific config */}
          {showConfig && (
            <div className="border-t pt-4">
              <p className="text-sm font-medium text-slate-700 mb-3">
                {input.integration.displayName} Configuration
              </p>
              <IntegrationConfigFieldsWithDirection
                integrationKey={input.integration.key}
                direction="input"
                config={configData}
                onChange={setConfigData}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
