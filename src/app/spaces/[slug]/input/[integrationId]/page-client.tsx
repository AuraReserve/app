"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCsrfFetch } from "@/hooks/useCsrfFetch";
import { useSpacePermissions } from "@/hooks/useSpacePermissions";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useSpace } from "@/hooks/useSpace";
import { useFormState } from "@/hooks/useFormState";
import { isAdmin as checkIsAdmin } from "@/lib/permissions";
import { TRIGGER_LABELS } from "@/constants/integrations";
import { AlertMessages } from "@/components/common/alert-messages";
import {
  SpacePageSkeleton,
  SpaceNotFound,
  AccessRestricted,
} from "@/components/spaces/space-page-shell";
import {
  ARTIFACT_LABELS,
  ARTIFACT_BADGE_COLORS,
  STATUS_DOT_COLORS,
  isMerkleArtifactType,
} from "@/lib/artifact-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IntegrationConfigFieldsWithDirection,
  hasConfigFields,
} from "@/components/integrations/integration-config-fields";
import type { IntegrationConfig } from "@/components/integrations/integration-config-fields";
import { FileUploadSection } from "@/components/spaces/file-upload-section";
import { ReserveDetailDialog } from "@/components/spaces/reserve-detail-dialog";
import type { ReserveEntry } from "@/components/spaces/reserve-history-list";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Circle,
  Send,
  Lock,
  Clock,
  Shield,
  Calendar as CalendarIcon,
  Plus,
  X,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Pencil,
  Settings,
  Play,
  Loader2,
  Save,
  Copy,
  Check,
  Globe,
  Key,
  Trash2,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

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
    assetType: string | null;
    unit: string | null;
    isActive: boolean;
    valueField: string | null;
    entries: DataInputEntry[];
    _count: { entries: number };
  };
}

interface EntryRow {
  id: string;
  artifactType: string;
  value: number | null;
  artifactData: Record<string, unknown> | null;
  timestamp: string;
  createdDate?: string;
  ripcord: boolean;
  ripcordDetails: string[];
  isAutomated: boolean;
  notes: string;
  supportingDocuments: string[];
  submittedBy: string;
  metadata: Record<string, unknown>;
}

interface EntriesResponse {
  entries: EntryRow[];
  total: number;
}

interface TestRunResult {
  success: boolean;
  message?: string;
  value?: number;
  artifactData?: Record<string, unknown>;
  durationMs?: number;
  persisted: boolean;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InputDetailClient({
  slug,
  integrationId,
}: {
  slug: string;
  integrationId: string;
}) {
  const { space, isLoading: spaceLoading } = useSpace(slug);
  const [input, setInput] = useState<DataInputItem | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [entriesPage, setEntriesPage] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const { error, success, setError, setSuccess } = useFormState();

  const { permissions } = useSpacePermissions(space?.id);
  const { csrfFetch } = useCsrfFetch();
  const { user } = useCurrentUser();
  const isPlatformAdmin = checkIsAdmin(user?.role);
  const canView = isPlatformAdmin || permissions.canViewData;
  const canSubmit = isPlatformAdmin || permissions.canSubmitData;
  const canManage = isPlatformAdmin || permissions.canManageInputs;
  const canManageKeys = isPlatformAdmin || permissions.canManageApiKeys;

  const [selectedEntry, setSelectedEntry] = useState<ReserveEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  const ENTRIES_PER_PAGE = 20;

  // ── Load input data ───────────────────────────────────────────────────

  const loadInput = useCallback(async () => {
    if (!space?.id) return;
    setDataLoading(true);
    try {
      const res = await fetch(`/api/spaces/${space.id}/data-inputs`);
      if (res.ok) {
        const all: DataInputItem[] = await res.json();
        const found = all.find((i) => i.id === integrationId);
        setInput(found ?? null);
      }
    } catch {
      setError("Failed to load data input.");
    }
    setDataLoading(false);
  }, [space?.id, integrationId, setError]);

  // ── Load entries ──────────────────────────────────────────────────────

  const loadEntries = useCallback(
    async (page = 0) => {
      if (!space?.id || !input?.stream.id) return;
      setEntriesLoading(true);
      try {
        const offset = page * ENTRIES_PER_PAGE;
        const res = await fetch(
          `/api/spaces/${space.id}/stores/${input.stream.id}/entries?limit=${ENTRIES_PER_PAGE}&offset=${offset}`
        );
        if (res.ok) {
          const data: EntriesResponse = await res.json();
          setEntries(data.entries ?? (data as unknown as EntryRow[]));
          setTotalEntries(data.total ?? (data as unknown as EntryRow[]).length);
        }
      } catch {
        setError("Failed to load entries.");
      }
      setEntriesLoading(false);
    },
    [space?.id, input?.stream.id, setError]
  );

  useEffect(() => {
    loadInput();
  }, [loadInput]);

  useEffect(() => {
    if (input) {
      loadEntries(entriesPage);
    }
  }, [input, entriesPage, loadEntries]);

  // ── Guards ────────────────────────────────────────────────────────────

  if (spaceLoading || dataLoading) return <SpacePageSkeleton />;
  if (!space) return <SpaceNotFound slug={slug} />;
  if (!canView) {
    return (
      <AccessRestricted
        slug={slug}
        spaceName={space.name}
        backHref={`/spaces/${slug}/input`}
        message="You do not have access to this data input."
      />
    );
  }
  if (!input) {
    return (
      <div className="p-6 bg-slate-50 min-h-screen">
        <div className="max-w-4xl mx-auto space-y-6">
          <Link href={`/spaces/${slug}/input`}>
            <Button variant="ghost" className="w-fit">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Data Input
            </Button>
          </Link>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Data input not found.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const artifactKey = input.stream.artifactType?.toLowerCase();
  const badgeColor =
    ARTIFACT_BADGE_COLORS[artifactKey] ?? "bg-slate-100 text-slate-800";
  const artifactLabel =
    ARTIFACT_LABELS[artifactKey] ?? input.stream.artifactType;
  const totalPages = Math.ceil(totalEntries / ENTRIES_PER_PAGE);
  const latestEntry = input.stream.entries?.[0] ?? entries[0] ?? null;
  const isManualInput = input.integration.key === "manual";
  const isApiPush = input.integration.key === "api";
  const showConfigTab = canManage && !isManualInput && !isApiPush;

  const refreshAfterEntry = () => {
    setEntriesPage(0);
    loadEntries(0);
    loadInput();
  };

  const handleEntryClick = (row: EntryRow) => {
    const entry: ReserveEntry = {
      id: row.id,
      artifactType: row.artifactType,
      value: row.value,
      artifactData: row.artifactData,
      timestamp: row.timestamp,
      createdDate: row.createdDate ?? row.timestamp,
      ripcord: row.ripcord,
      isAutomated: row.isAutomated,
      notes: row.notes,
      archived: false,
      archivedAt: null,
      archivedReason: null,
      submittedBy: row.submittedBy,
      submitter: null,
      stream: {
        id: input.stream.id,
        name: input.stream.name,
        slug: input.stream.slug,
        artifactType: input.stream.artifactType,
        unit: input.stream.unit,
      },
      sourceIntegration: {
        integration: {
          displayName: input.integration.displayName,
          key: input.integration.key,
        },
      },
    };
    setSelectedEntry(entry);
    setDetailDialogOpen(true);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href={`/spaces/${slug}/input`}>
          <Button variant="ghost" className="w-fit">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Data Input
          </Button>
        </Link>

        {/* Header with last value */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold">{input.stream.name}</h1>
            <Badge className={`text-xs ${badgeColor}`}>{artifactLabel}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <Circle className={`w-2.5 h-2.5 fill-current ${STATUS_DOT_COLORS[input.status] ?? "text-slate-300"}`} />
              <span className="capitalize">{input.status}</span>
            </span>
            <span>Source: {input.integration.displayName}</span>
            <span>{input.stream._count.entries} entries</span>
            {input.accessGroup && (
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3" />
                {input.accessGroup.name}
              </span>
            )}
          </div>
        </div>

        {/* Last Value Card */}
        <LastValueCard input={input} latestEntry={latestEntry} />

        <AlertMessages error={error} success={success} />

        {/* Tabs: Data + Configuration */}
        {showConfigTab ? (
          <Tabs defaultValue="data" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
            </TabsList>

            <TabsContent value="data" className="space-y-6 mt-6">
              <DataTabContent
                input={input}
                space={space}
                slug={slug}
                canSubmit={canSubmit}
                canManageKeys={canManageKeys}
                csrfFetch={csrfFetch}
                setError={setError}
                setSuccess={setSuccess}
                onEntryCreated={refreshAfterEntry}
              />
              <EntryHistoryTable
                entries={entries}
                entriesLoading={entriesLoading}
                entriesPage={entriesPage}
                totalPages={totalPages}
                totalEntries={totalEntries}
                setEntriesPage={setEntriesPage}
                onEntryClick={handleEntryClick}
              />
            </TabsContent>

            <TabsContent value="configuration" className="space-y-6 mt-6">
              <ConfigurationTab
                input={input}
                space={space}
                csrfFetch={csrfFetch}
                canManage={canManage}
                setError={setError}
                setSuccess={setSuccess}
                onSaved={() => {
                  setSuccess("Configuration updated.");
                  loadInput();
                }}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-6">
            <DataTabContent
              input={input}
              space={space}
              slug={slug}
              canSubmit={canSubmit}
              canManageKeys={canManageKeys}
              csrfFetch={csrfFetch}
              setError={setError}
              setSuccess={setSuccess}
              onEntryCreated={refreshAfterEntry}
            />
            <EntryHistoryTable
              entries={entries}
              entriesLoading={entriesLoading}
              entriesPage={entriesPage}
              totalPages={totalPages}
              totalEntries={totalEntries}
              setEntriesPage={setEntriesPage}
              onEntryClick={handleEntryClick}
            />
          </div>
        )}

        <ReserveDetailDialog
          isOpen={detailDialogOpen}
          onClose={() => { setDetailDialogOpen(false); setSelectedEntry(null); }}
          entry={selectedEntry}
          spaceId={space.id}
          streamId={input.stream.id}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Last Value Card
// ---------------------------------------------------------------------------

function LastValueCard({
  input,
  latestEntry,
}: {
  input: DataInputItem;
  latestEntry: DataInputEntry | EntryRow | null;
}) {
  const value = latestEntry?.value;
  const isMerkle = isMerkleArtifactType(input.stream.artifactType);

  return (
    <Card className="border-slate-200">
      <CardContent className="py-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-slate-500 mb-1">Current Value</p>
            {value !== null && value !== undefined ? (
              <p className="text-3xl font-bold text-slate-900">
                {Number(value).toLocaleString(undefined, { maximumFractionDigits: 8 })}
                {input.stream.unit && (
                  <span className="text-lg font-normal text-slate-500 ml-1.5">
                    {input.stream.unit}
                  </span>
                )}
              </p>
            ) : isMerkle && latestEntry && "artifactData" in latestEntry && latestEntry.artifactData ? (
              <p className="text-xl font-semibold text-slate-700">Merkle Tree Data</p>
            ) : (
              <p className="text-xl text-slate-400">No data yet</p>
            )}
          </div>
          {latestEntry && (
            <div className="text-right text-sm text-slate-500">
              <div className="flex items-center gap-1.5 justify-end">
                <Clock className="w-3.5 h-3.5" />
                {formatDistanceToNow(new Date(latestEntry.timestamp), { addSuffix: true })}
              </div>
              <p className="text-xs mt-0.5">
                {new Date(latestEntry.timestamp).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Data Tab Content — routes to the correct interaction based on type
// ---------------------------------------------------------------------------

function DataTabContent({
  input,
  space,
  slug,
  canSubmit,
  canManageKeys,
  csrfFetch,
  setError,
  setSuccess,
  onEntryCreated,
}: {
  input: DataInputItem;
  space: { id: string; name: string };
  slug: string;
  canSubmit: boolean;
  canManageKeys: boolean;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
  onEntryCreated: () => void;
}) {
  const key = input.integration.key;
  const trigger = input.trigger?.toLowerCase() ?? "";

  if (key === "manual") {
    return (
      <ManualInputSection
        input={input}
        space={space}
        slug={slug}
        canSubmit={canSubmit}
        csrfFetch={csrfFetch}
        setError={setError}
        onEntryCreated={onEntryCreated}
      />
    );
  }

  if (key === "csv-upload") {
    return (
      <FileUploadSection
        input={input}
        space={space}
        slug={slug}
        canSubmit={canSubmit}
        csrfFetch={csrfFetch}
        setError={setError}
        onEntryCreated={onEntryCreated}
      />
    );
  }

  if (key === "api") {
    return (
      <ApiPushSection
        input={input}
        space={space}
        canManageKeys={canManageKeys}
        csrfFetch={csrfFetch}
        setError={setError}
      />
    );
  }

  // blockchain-read, api-fetch — fetchable integrations
  return (
    <FetchableInputSection
      input={input}
      space={space}
      trigger={trigger}
      canSubmit={canSubmit}
      csrfFetch={csrfFetch}
      setError={setError}
      setSuccess={setSuccess}
      onEntryCreated={onEntryCreated}
    />
  );
}

// ---------------------------------------------------------------------------
// Manual Input Section
// ---------------------------------------------------------------------------

function ManualInputSection({
  input,
  space,
  slug,
  canSubmit,
  csrfFetch,
  setError,
  onEntryCreated: _onEntryCreated,
}: {
  input: DataInputItem;
  space: { id: string; name: string };
  slug: string;
  canSubmit: boolean;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  setError: (msg: string | null) => void;
  onEntryCreated: () => void;
}) {
  const router = useRouter();
  const isMerkle = isMerkleArtifactType(input.stream.artifactType);
  const isValueType = input.stream.artifactType?.toLowerCase() === "value";
  const effectiveValueField = input.stream.valueField || "";
  const hasValueFieldConfigured = !!input.stream.valueField;

  const [submitValue, setSubmitValue] = useState("");
  const [submitJson, setSubmitJson] = useState("");
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitDate, setSubmitDate] = useState<Date>(new Date());
  const [submitRipcord, setSubmitRipcord] = useState(false);
  const [submitRipcordDetails, setSubmitRipcordDetails] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Merkle JSON validation
  const [jsonValidation, setJsonValidation] = useState<{
    valid: boolean;
    count: number;
    total: number;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!isMerkle || !submitJson.trim()) {
      setJsonValidation(null);
      return;
    }
    const timer = setTimeout(() => {
      try {
        const parsed = JSON.parse(submitJson);
        if (!Array.isArray(parsed)) {
          setJsonValidation({ valid: false, count: 0, total: 0, error: "JSON must be an array of entries." });
          return;
        }
        if (parsed.length === 0) {
          setJsonValidation({ valid: false, count: 0, total: 0, error: "Array must contain at least one entry." });
          return;
        }
        let total = 0;
        const vf = effectiveValueField;
        const ids = new Set<string>();
        for (let i = 0; i < parsed.length; i++) {
          const entry = parsed[i];
          if (!entry.id || typeof entry.id !== "string") {
            setJsonValidation({ valid: false, count: 0, total: 0, error: `Entry ${i + 1}: missing a string "id" field.` });
            return;
          }
          if (ids.has(entry.id)) {
            setJsonValidation({ valid: false, count: 0, total: 0, error: `Duplicate id "${entry.id}" found.` });
            return;
          }
          ids.add(entry.id);
          if (!entry.data || typeof entry.data !== "object" || Array.isArray(entry.data)) {
            setJsonValidation({ valid: false, count: 0, total: 0, error: `Entry "${entry.id}": missing a "data" object.` });
            return;
          }
          if (vf) {
            const val = entry.data[vf];
            if (val === undefined || val === null) {
              setJsonValidation({ valid: false, count: 0, total: 0, error: `Entry "${entry.id}": missing required value field "${vf}" in data.` });
              return;
            }
            if (typeof val !== "number" || !isFinite(val)) {
              setJsonValidation({ valid: false, count: 0, total: 0, error: `Entry "${entry.id}": field "${vf}" must be a number (got ${typeof val}).` });
              return;
            }
            total += val;
          }
        }
        setJsonValidation({ valid: true, count: parsed.length, total, error: null });
      } catch {
        setJsonValidation({ valid: false, count: 0, total: 0, error: "Invalid JSON format." });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [submitJson, isMerkle, effectiveValueField]);

  const sampleData = useMemo(() => {
    if (!isMerkle || !effectiveValueField) return null;
    const vf = effectiveValueField;
    const assetType = input.stream.assetType?.toLowerCase();
    if (assetType === "gold" || assetType === "platinum" || assetType === "palladium") {
      return [
        { id: "BAR-001", data: { bar_id: "BAR-001", [vf]: 400, purity: 0.9999, vault: "Zurich-A", custodian: "Swiss Vault AG" } },
        { id: "BAR-002", data: { bar_id: "BAR-002", [vf]: 100, purity: 0.999, vault: "London-B", custodian: "Brinks" } },
        { id: "BAR-003", data: { bar_id: "BAR-003", [vf]: 1000, purity: 0.9999, vault: "Singapore-C", custodian: "Malca-Amit" } },
      ];
    }
    if (assetType === "silver") {
      return [
        { id: "SLV-001", data: { bar_id: "SLV-001", [vf]: 1000, purity: 0.999, vault: "Delaware-A", custodian: "Delaware Depository" } },
        { id: "SLV-002", data: { bar_id: "SLV-002", [vf]: 500, purity: 0.9999, vault: "Utah-B", custodian: "Mountain West" } },
      ];
    }
    if (assetType === "gemstones" || assetType === "diamonds") {
      return [
        { id: "GEM-001", data: { certificate_id: "GIA-12345", type: "diamond", [vf]: 2.5, grade: "VVS1", vault: "NYC-Secure" } },
        { id: "GEM-002", data: { certificate_id: "GIA-12346", type: "emerald", [vf]: 5.2, grade: "AAA", vault: "Geneva-Prime" } },
      ];
    }
    return [
      { id: "item-1", data: { [vf]: 100, description: "Item 1" } },
      { id: "item-2", data: { [vf]: 250, description: "Item 2" } },
      { id: "item-3", data: { [vf]: 75, description: "Item 3" } },
    ];
  }, [input.stream.assetType, isMerkle, effectiveValueField]);

  const handleSubmitEntry = async () => {
    if (!space || !input) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedRipcordDetails = submitRipcord
        ? submitRipcordDetails.filter((d) => d.trim() !== "")
        : [];

      const body: Record<string, unknown> = {
        notes: submitNotes || undefined,
        timestamp: submitDate.toISOString(),
        ripcord: submitRipcord,
        ripcordDetails: trimmedRipcordDetails,
      };

      if (isValueType) {
        const numVal = parseFloat(submitValue);
        if (isNaN(numVal)) {
          setError("Please enter a valid number.");
          setIsSubmitting(false);
          return;
        }
        body.value = numVal;
      } else {
        try {
          const parsed = JSON.parse(submitJson);
          body.data = parsed;
        } catch {
          setError("Invalid JSON data.");
          setIsSubmitting(false);
          return;
        }
      }

      const res = await csrfFetch(
        `/api/spaces/${space.id}/stores/${input.stream.id}/entries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const details = Array.isArray(data.details) ? data.details.join(" ") : null;
        const errors = Array.isArray(data.errors) ? data.errors.join(" ") : null;
        setError(details || errors || data.error || "Failed to submit entry.");
        setIsSubmitting(false);
        return;
      }

      router.push(`/spaces/${slug}/reserves?stream=${input.stream.id}`);
    } catch {
      setError("Failed to submit entry.");
    }
    setIsSubmitting(false);
  };

  if (!canSubmit) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          You do not have permission to submit entries. Only admins and auditors can submit data.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Send className="w-4 h-4" />
          Submit Entry
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {input.accessGroupId && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            This input is restricted to the &ldquo;{input.accessGroup?.name}&rdquo; group.
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {isValueType ? (
            <div className="space-y-2">
              <Label htmlFor="submitValue">Value ({input.stream.name}){input.stream.unit ? ` in ${input.stream.unit}` : ""} *</Label>
              <Input
                id="submitValue"
                type="number"
                step="any"
                value={submitValue}
                onChange={(e) => setSubmitValue(e.target.value)}
                placeholder={input.stream.unit ? `Enter value in ${input.stream.unit}` : "Enter value"}
                required
              />
            </div>
          ) : (
            <div className="space-y-4 md:col-span-2">
              {!hasValueFieldConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900 mb-1">Value field not configured</p>
                  <p className="text-sm text-amber-700">
                    Set a value field before submitting merkle tree entries.
                  </p>
                  <Link href={`/spaces/${slug}/input`}>
                    <Button variant="outline" size="sm" className="mt-3 text-amber-900 border-amber-300 hover:bg-amber-100">
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Configure in Input Settings
                    </Button>
                  </Link>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-sm font-medium text-slate-900">Expected format</p>
                <p className="text-sm text-slate-600">JSON array of leaf objects with <code className="bg-slate-200 px-1 rounded">&quot;id&quot;</code>, <code className="bg-slate-200 px-1 rounded">&quot;data&quot;</code>, and numeric <code className="bg-blue-100 px-1 rounded text-blue-800 font-semibold">&quot;{effectiveValueField || "..."}&quot;</code> field.</p>
                {effectiveValueField && (
                  <pre className="text-xs font-mono text-slate-700 bg-white rounded border p-3 overflow-x-auto">{`[
  { "id": "item-1", "data": { "${effectiveValueField}": 100 } },
  { "id": "item-2", "data": { "${effectiveValueField}": 250 } }
]`}</pre>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Leaf Data (JSON) *</Label>
                  {sampleData && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSubmitJson(JSON.stringify(sampleData, null, 2))}>
                      <FileJson className="w-4 h-4 mr-1" />
                      Load Sample
                    </Button>
                  )}
                </div>
                <Textarea
                  value={submitJson}
                  onChange={(e) => setSubmitJson(e.target.value)}
                  placeholder={`[\n  { "id": "item-1", "data": { "${effectiveValueField || "value"}": 100 } }\n]`}
                  className="font-mono text-sm h-64"
                />
                {jsonValidation?.valid && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Valid: {jsonValidation.count} {jsonValidation.count === 1 ? "leaf" : "leaves"}
                      {jsonValidation.total > 0 && effectiveValueField && (
                        <> &middot; Total {effectiveValueField}: {jsonValidation.total.toLocaleString()}{input.stream.unit ? ` ${input.stream.unit}` : ""}</>
                      )}
                    </span>
                  </div>
                )}
                {jsonValidation && !jsonValidation.valid && jsonValidation.error && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span>{jsonValidation.error}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="submitDate">Audit Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button id="submitDate" variant="outline" className="w-full justify-between text-left font-normal" type="button">
                  {format(submitDate, "PPP")}
                  <CalendarIcon className="w-4 h-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={submitDate}
                  onSelect={(date) => { if (date instanceof Date) setSubmitDate(date); }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="submitNotes">Notes</Label>
          <Textarea
            id="submitNotes"
            placeholder="Additional context"
            value={submitNotes}
            onChange={(e) => setSubmitNotes(e.target.value)}
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-slate-900">Ripcord Status</p>
              <p className="text-xs text-slate-500">Enable for emergency response.</p>
            </div>
          </div>
          <Switch checked={submitRipcord} onCheckedChange={setSubmitRipcord} />
        </div>

        {submitRipcord && (
          <div className="space-y-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-medium text-blue-900 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Ripcord Details
            </p>
            <div className="space-y-3">
              {submitRipcordDetails.map((detail, index) => (
                <div key={`ripcord-${index}`} className="flex gap-2">
                  <Input
                    placeholder="Describe the ripcord action"
                    value={detail}
                    onChange={(e) => {
                      const updated = [...submitRipcordDetails];
                      updated[index] = e.target.value;
                      setSubmitRipcordDetails(updated);
                    }}
                  />
                  {submitRipcordDetails.length > 1 && (
                    <Button type="button" variant="outline" size="icon" onClick={() => {
                      const filtered = submitRipcordDetails.filter((_, i) => i !== index);
                      setSubmitRipcordDetails(filtered.length > 0 ? filtered : [""]);
                    }}>
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSubmitRipcordDetails([...submitRipcordDetails, ""])} className="text-blue-600 hover:text-blue-700 hover:bg-blue-100">
              <Plus className="w-4 h-4 mr-1" />
              Add Detail
            </Button>
          </div>
        )}

        <Button
          onClick={handleSubmitEntry}
          disabled={
            isSubmitting ||
            (isValueType && !submitValue) ||
            (!isValueType && !submitJson) ||
            (!isValueType && isMerkle && !effectiveValueField) ||
            (!isValueType && isMerkle && jsonValidation != null && !jsonValidation.valid)
          }
        >
          {isSubmitting ? "Submitting..." : "Submit Entry"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fetchable Input Section (blockchain-read, api-fetch)
// ---------------------------------------------------------------------------

function FetchableInputSection({
  input,
  space,
  trigger,
  canSubmit,
  csrfFetch,
  setError,
  setSuccess,
  onEntryCreated,
}: {
  input: DataInputItem;
  space: { id: string; name: string };
  trigger: string;
  canSubmit: boolean;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
  onEntryCreated: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestRunResult | null>(null);

  const isActive = input.status.toLowerCase() === "active";
  const isCron = trigger === "cron";
  const isManualTrigger = trigger === "manual" || trigger === "";

  const handleRun = async (persist: boolean) => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await csrfFetch(
        `/api/spaces/${space.id}/data-inputs/${input.id}/run${persist ? "?persist=true" : ""}`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error || data?.message || `Request failed (${res.status})`;
        setTestResult({ success: false, message: msg, persisted: false });
      } else {
        setTestResult(data);
        if (data.persisted) {
          setSuccess("Value fetched and saved.");
          onEntryCreated();
        }
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to run integration.",
        persisted: false,
      });
    }
    setTesting(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Play className="w-4 h-4" />
          {isManualTrigger ? "Fetch Value" : "Integration Status"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cron info */}
        {isCron && input.schedule && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-slate-600">
                Scheduled: <code className="bg-slate-200 px-1.5 py-0.5 rounded text-xs">{input.schedule}</code>
              </span>
            </div>
            {input.lastRunAt && (
              <p className="text-xs text-slate-500 mt-2">
                Last run {formatDistanceToNow(new Date(input.lastRunAt), { addSuffix: true })}
                {input.lastRunStatus && (
                  <span className={`ml-1 ${input.lastRunStatus.toLowerCase() === "success" ? "text-green-600" : "text-red-600"}`}>
                    ({input.lastRunStatus})
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {canSubmit && (
          <>
            <div className="flex gap-3">
              {isManualTrigger ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleRun(false)}
                    disabled={testing || !isActive}
                  >
                    {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                    {testing ? "Fetching..." : "Preview Value"}
                  </Button>
                  <Button
                    onClick={() => handleRun(true)}
                    disabled={testing || !isActive}
                  >
                    {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
                    Fetch & Save
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => handleRun(false)}
                  disabled={testing || !isActive}
                >
                  {testing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Play className="w-4 h-4 mr-1.5" />}
                  {testing ? "Testing..." : "Test Now"}
                </Button>
              )}
            </div>

            {!isActive && (
              <p className="text-xs text-amber-600">
                Integration must be active to run. Current status: {input.status}
              </p>
            )}
          </>
        )}

        {!canSubmit && (
          <p className="text-sm text-muted-foreground">
            Only admins and auditors can trigger this integration.
          </p>
        )}

        {/* Result display */}
        <TestResultDisplay result={testResult} input={input} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// API Push Section
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// API Key Record shape (from entity API)
// ---------------------------------------------------------------------------

interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  usageCount: number;
  lastUsed: string | null;
  createdDate: string;
  plaintextKey?: string;
}

// ---------------------------------------------------------------------------
// API Ingest Keys Section
// ---------------------------------------------------------------------------

function ApiIngestKeysSection({
  spaceId,
  integrationId,
  canManageKeys,
}: {
  spaceId: string;
  integrationId: string;
  canManageKeys: boolean;
}) {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [isLoadingKeys, setIsLoadingKeys] = useState(true);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadKeys = async () => {
      setIsLoadingKeys(true);
      try {
        const res = await fetch(`/api/spaces/${spaceId}/integrations/${integrationId}/keys`);
        if (res.ok) {
          const data = await res.json();
          setApiKeys(Array.isArray(data) ? data : data.data ?? []);
        } else {
          setError("Failed to load API keys.");
        }
      } catch {
        setError("Failed to load API keys.");
      }
      setIsLoadingKeys(false);
    };
    loadKeys();
  }, [spaceId, integrationId]);

  const loadApiKeys = async () => {
    try {
      const res = await fetch(`/api/spaces/${spaceId}/integrations/${integrationId}/keys`);
      if (res.ok) {
        const data = await res.json();
        setApiKeys(Array.isArray(data) ? data : data.data ?? []);
      }
    } catch {
      setError("Failed to load API keys.");
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/spaces/${spaceId}/integrations/${integrationId}/keys`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newKeyName.trim() }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to create API key.");
        return;
      }
      const created = await res.json();
      setNewKeyName("");
      setNewlyCreatedKey(created.plaintextKey);
      setShowNewKeyDialog(true);
      await loadApiKeys();
    } catch {
      setError("Failed to create API key.");
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    setError(null);
    try {
      const res = await fetch(
        `/api/spaces/${spaceId}/integrations/${integrationId}/keys`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: keyId }),
        }
      );
      if (!res.ok) {
        setError("Failed to delete API key.");
        return;
      }
      setApiKeys((prev) => prev.filter((key) => key.id !== keyId));
    } catch {
      setError("Failed to delete API key.");
    }
  };

  const copyNewKeyToClipboard = () => {
    if (newlyCreatedKey) {
      navigator.clipboard.writeText(newlyCreatedKey);
      setCopiedKey(newlyCreatedKey);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-sm border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-600" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {canManageKeys ? (
            <div className="flex flex-col md:flex-row gap-3">
              <Input
                placeholder="Key label (e.g. Ingest Service)"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="md:flex-1"
              />
              <Button onClick={handleCreateKey} disabled={!newKeyName.trim() || isLoadingKeys}>
                <Plus className="w-4 h-4 mr-2" />
                Create Key
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              API keys are managed by space administrators.
            </p>
          )}

          <div className="space-y-4">
            {isLoadingKeys ? (
              <Skeleton className="h-32 w-full" />
            ) : apiKeys.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
                <Key className="w-8 h-8 mx-auto text-slate-400 mb-3" />
                <p className="text-slate-600">No API keys yet. Create one to authenticate ingest requests.</p>
              </div>
            ) : (
              apiKeys.map((key) => (
                <Card key={key.id} className="border border-slate-200">
                  <CardContent className="py-6 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <p className="text-sm uppercase text-slate-500">Key Name</p>
                        <p className="text-lg font-semibold text-slate-900">{key.name}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={key.isActive ? "default" : "secondary"}>
                          {key.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">{key.usageCount} calls</Badge>
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="font-mono text-sm bg-slate-100 text-slate-800 px-4 py-2 rounded-md">
                        {key.keyPrefix ?? "ar_"}••••••••••••••••
                      </div>
                      <div className="flex gap-2">
                        {canManageKeys && (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteKey(key.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* New API Key Dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={() => { setShowNewKeyDialog(false); setNewlyCreatedKey(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-xl">API Key Created Successfully</DialogTitle>
                <DialogDescription className="mt-1">
                  Save this key in a secure location. It won&apos;t be shown again.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 text-sm">
                <strong>Important:</strong> For security reasons, we can only show you this key once. Make sure to copy it now.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label className="text-sm font-medium text-slate-700">Your API Key</Label>
              <div
                className="relative group cursor-pointer"
                onClick={copyNewKeyToClipboard}
                title="Click to copy"
              >
                <div className="font-mono text-sm bg-slate-900 text-slate-100 px-4 py-3 pr-12 rounded-lg break-all select-all hover:bg-slate-800 transition-colors">
                  {newlyCreatedKey}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 hover:bg-slate-700"
                  onClick={(e) => { e.stopPropagation(); copyNewKeyToClipboard(); }}
                >
                  {copiedKey === newlyCreatedKey ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4 text-slate-400" />
                  )}
                </Button>
              </div>
              {copiedKey === newlyCreatedKey && (
                <p className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  Copied to clipboard!
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => { setShowNewKeyDialog(false); setNewlyCreatedKey(null); }}
            >
              I&apos;ve Saved My Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// API Push Section
// ---------------------------------------------------------------------------

function ApiPushSection({
  input,
  space,
  canManageKeys,
  csrfFetch: _csrfFetch,
  setError: _setError,
}: {
  input: DataInputItem;
  space: { id: string; name: string };
  canManageKeys: boolean;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  setError: (msg: string | null) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const endpointUrl = `${origin}/api/spaces/${space.id}/stores/${input.stream.id}/entries`;
  const isMerkle = isMerkleArtifactType(input.stream.artifactType);
  const valueField = input.stream.valueField || "balance";

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const curlExample = isMerkle
    ? `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "data": [
      { "id": "user-001", "data": { "${valueField}": 5000 } },
      { "id": "user-002", "data": { "${valueField}": 12000 } },
      { "id": "user-003", "data": { "${valueField}": 3500 } }
    ],
    "timestamp": "${new Date().toISOString()}",
    "notes": "Automated push"
  }'`
    : `curl -X POST "${endpointUrl}" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "value": 1500000,
    "timestamp": "${new Date().toISOString()}",
    "notes": "Automated push"
  }'`;

  const jsExample = isMerkle
    ? `const res = await fetch("${endpointUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY",
  },
  body: JSON.stringify({
    data: [
      { id: "user-001", data: { ${valueField}: 5000 } },
      { id: "user-002", data: { ${valueField}: 12000 } },
      { id: "user-003", data: { ${valueField}: 3500 } },
    ],
    timestamp: new Date().toISOString(),
    notes: "Automated push",
  }),
});`
    : `const res = await fetch("${endpointUrl}", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_API_KEY",
  },
  body: JSON.stringify({
    value: 1500000,
    timestamp: new Date().toISOString(),
    notes: "Automated push",
  }),
});`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="w-4 h-4" />
            API Endpoint
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600">
            {isMerkle
              ? "Push leaf entries to this stream by sending a POST request with an array of entries. The server builds the merkle tree and computes the total value automatically."
              : "Push data to this stream by sending a POST request to the endpoint below."}
          </p>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-slate-500">Endpoint URL</Label>
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-sm bg-slate-900 text-slate-100 px-4 py-2.5 rounded-md break-all">
                POST {endpointUrl}
              </div>
              <Button variant="outline" size="icon" onClick={() => copyToClipboard(endpointUrl, "url")}>
                {copied === "url" ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase text-slate-500">Request Body</Label>
            <div className="rounded border border-slate-200 bg-slate-50 p-4 space-y-2">
              {isMerkle ? (
                <pre className="text-xs font-mono text-slate-700 overflow-x-auto">{`{
  "data": [                  // array of leaf entries
    {
      "id": "unique-id",    // unique identifier per leaf
      "data": {              // leaf payload
        "${valueField}": 5000  // numeric value field
      }
    }
  ],
  "timestamp": "ISO 8601",   // when the measurement was taken
  "notes": "optional",       // additional context
  "ripcord": false,           // emergency flag
  "ripcordDetails": []        // ripcord action descriptions
}`}</pre>
              ) : (
                <pre className="text-xs font-mono text-slate-700 overflow-x-auto">{`{
  "value": 1500000,          // numeric value
  "timestamp": "ISO 8601",   // when the measurement was taken
  "notes": "optional",       // additional context
  "ripcord": false,           // emergency flag
  "ripcordDetails": []        // ripcord action descriptions
}`}</pre>
              )}
              {isMerkle && (
                <p className="text-xs text-slate-500 mt-2">
                  The server builds the merkle tree from the leaf entries and computes the total value by summing the <code className="bg-slate-200 px-1 rounded">{valueField}</code> field across all entries.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys */}
      <ApiIngestKeysSection spaceId={space.id} integrationId={input.id} canManageKeys={canManageKeys} />

      {/* Usage Examples */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Usage Examples
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs defaultValue="curl" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
            </TabsList>
            <TabsContent value="curl" className="mt-4">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 z-10"
                  onClick={() => copyToClipboard(curlExample, "curl")}
                >
                  {copied === "curl" ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
                <pre className="bg-slate-900 text-slate-100 text-sm p-4 rounded-md overflow-x-auto">
                  {curlExample}
                </pre>
              </div>
            </TabsContent>
            <TabsContent value="javascript" className="mt-4">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 z-10"
                  onClick={() => copyToClipboard(jsExample, "js")}
                >
                  {copied === "js" ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
                <pre className="bg-slate-900 text-slate-100 text-sm p-4 rounded-md overflow-x-auto">
                  {jsExample}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Configuration Tab
// ---------------------------------------------------------------------------

function ConfigurationTab({
  input,
  space,
  csrfFetch,
  canManage,
  setError,
  setSuccess,
  onSaved,
}: {
  input: DataInputItem;
  space: { id: string; name: string };
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  canManage: boolean;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
  onSaved: () => void;
}) {
  const supportedTriggers = input.integration.supportedTriggers;
  const hasTriggers = supportedTriggers.length > 0;
  const inputIsActive = input.status.toLowerCase() === "active";

  // Status toggling
  const [togglingStatus, setTogglingStatus] = useState(false);

  const handleToggleStatus = async () => {
    const newStatus = inputIsActive ? "inactive" : "active";
    setTogglingStatus(true);
    setError(null);
    try {
      const res = await csrfFetch(
        `/api/spaces/${space.id}/data-inputs/${input.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update status.");
      } else {
        setSuccess(`Input ${newStatus === "active" ? "activated" : "deactivated"} successfully.`);
        onSaved();
      }
    } catch {
      setError("Failed to update status.");
    }
    setTogglingStatus(false);
  };

  // Trigger editing
  const [trigger, setTrigger] = useState(input.trigger ?? "");
  const [schedule, setSchedule] = useState(input.schedule ?? "");
  const [savingTrigger, setSavingTrigger] = useState(false);

  // Config editing
  const [configData, setConfigData] = useState<IntegrationConfig>(
    (input.config as IntegrationConfig) || {}
  );
  const [savingConfig, setSavingConfig] = useState(false);

  const configChanged = JSON.stringify(configData) !== JSON.stringify(input.config);
  const triggerChanged = trigger !== (input.trigger ?? "") || (trigger === "cron" && schedule !== (input.schedule ?? ""));

  const handleSaveTrigger = async () => {
    setSavingTrigger(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (trigger !== (input.trigger ?? "")) body.trigger = trigger || undefined;
      if (trigger === "cron" && schedule !== (input.schedule ?? "")) body.schedule = schedule;
      if (trigger !== "cron" && input.schedule) body.schedule = null;

      if (Object.keys(body).length === 0) return;

      const res = await csrfFetch(
        `/api/spaces/${space.id}/data-inputs/${input.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update trigger.");
        setSavingTrigger(false);
        return;
      }
      onSaved();
    } catch {
      setError("Failed to update trigger settings.");
    }
    setSavingTrigger(false);
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setError(null);
    try {
      const res = await csrfFetch(
        `/api/spaces/${space.id}/data-inputs/${input.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: configData }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to update configuration.");
        setSavingConfig(false);
        return;
      }
      onSaved();
    } catch {
      setError("Failed to update configuration.");
    }
    setSavingConfig(false);
  };

  return (
    <div className="space-y-6">
      {/* Trigger settings */}
      {hasTriggers && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Trigger Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Trigger Type</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {supportedTriggers.map((t) => {
                    const key = t.toLowerCase();
                    return (
                      <SelectItem key={key} value={key}>
                        {TRIGGER_LABELS[key] ?? key}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {trigger === "cron" && (
              <div className="space-y-2">
                <Label className="text-sm">Schedule (cron expression)</Label>
                <Input
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="0 */6 * * *"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-500">
                  Examples: <code>0 */6 * * *</code> (every 6h), <code>0 0 * * *</code> (daily), <code>*/30 * * * *</code> (every 30min)
                </p>
              </div>
            )}

            {triggerChanged && (
              <Button onClick={handleSaveTrigger} disabled={savingTrigger} size="sm">
                <Save className="w-3.5 h-3.5 mr-1" />
                {savingTrigger ? "Saving..." : "Save Trigger"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Integration config */}
      {hasConfigFields(input.integration.key) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Integration Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <IntegrationConfigFieldsWithDirection
              integrationKey={input.integration.key}
              direction="input"
              config={configData}
              onChange={setConfigData}
            />

            {configChanged && (
              <Button onClick={handleSaveConfig} disabled={savingConfig}>
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {savingConfig ? "Saving..." : "Save Configuration"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Activate / Deactivate */}
      {canManage && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">
                  {inputIsActive ? "Active" : "Inactive"}
                </Label>
                <p className="text-xs text-slate-500">
                  {inputIsActive
                    ? "This input is active and will process triggers."
                    : "This input is deactivated and will not process triggers."}
                </p>
              </div>
              <Switch
                checked={inputIsActive}
                onCheckedChange={handleToggleStatus}
                disabled={togglingStatus}
              />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test Result Display
// ---------------------------------------------------------------------------

function TestResultDisplay({
  result,
  input,
}: {
  result: TestRunResult | null;
  input: DataInputItem;
}) {
  if (!result) return null;

  return (
    <div
      className={`rounded-lg border p-4 ${
        result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
      }`}
    >
      <div className="flex items-start gap-3">
        {result.success ? (
          <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
        ) : (
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        )}
        <div className="space-y-1.5 min-w-0">
          <p className={`text-sm font-medium ${result.success ? "text-green-900" : "text-red-900"}`}>
            {result.success ? "Success" : "Failed"}
            {result.durationMs !== undefined && (
              <span className="font-normal text-slate-500 ml-2">({result.durationMs}ms)</span>
            )}
          </p>
          {result.message && (
            <p className={`text-sm ${result.success ? "text-green-700" : "text-red-700"}`}>
              {result.message}
            </p>
          )}
          {result.value !== undefined && (
            <div className="mt-2 rounded border border-green-200 bg-white p-3">
              <span className="text-xs text-slate-500 uppercase">Value</span>
              <p className="text-lg font-semibold text-slate-900">
                {result.value.toLocaleString(undefined, { maximumFractionDigits: 8 })}
                {input.stream.unit && (
                  <span className="text-sm font-normal text-slate-500 ml-1">{input.stream.unit}</span>
                )}
              </p>
            </div>
          )}
          {result.persisted && (
            <p className="text-xs text-green-600 mt-1">Entry saved to stream.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry History Table
// ---------------------------------------------------------------------------

function EntryHistoryTable({
  entries,
  entriesLoading,
  entriesPage,
  totalPages,
  totalEntries,
  setEntriesPage,
  onEntryClick,
}: {
  entries: EntryRow[];
  entriesLoading: boolean;
  entriesPage: number;
  totalPages: number;
  totalEntries: number;
  setEntriesPage: (fn: (p: number) => number) => void;
  onEntryClick?: (entry: EntryRow) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entry History</CardTitle>
      </CardHeader>
      <CardContent>
        {entriesLoading && entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading entries...</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No entries yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-500">
                    <th className="pb-2 pr-4 font-medium">Timestamp</th>
                    <th className="pb-2 pr-4 font-medium">Value</th>
                    <th className="pb-2 pr-4 font-medium">Source</th>
                    <th className="pb-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-b last:border-0 hover:bg-slate-50 ${onEntryClick ? "cursor-pointer" : ""}`}
                      onClick={onEntryClick ? () => onEntryClick(entry) : undefined}
                      role={onEntryClick ? "button" : undefined}
                      tabIndex={onEntryClick ? 0 : undefined}
                      onKeyDown={
                        onEntryClick
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onEntryClick(entry);
                              }
                            }
                          : undefined
                      }
                    >
                      <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">
                        {new Date(entry.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 font-medium text-slate-900">
                        {entry.value !== null
                          ? String(entry.value)
                          : entry.artifactData
                            ? "Artifact"
                            : "--"}
                        {entry.ripcord && (
                          <Badge variant="destructive" className="text-xs ml-2">Ripcord</Badge>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-600">
                        {entry.isAutomated ? "Automated" : "Manual"}
                      </td>
                      <td className="py-2.5 text-slate-500 truncate max-w-[200px]">
                        {entry.notes || "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <span className="text-sm text-slate-500">
                  Page {entriesPage + 1} of {totalPages} ({totalEntries} total)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={entriesPage === 0} onClick={() => setEntriesPage((p) => p - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={entriesPage >= totalPages - 1} onClick={() => setEntriesPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
