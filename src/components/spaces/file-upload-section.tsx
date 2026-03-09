"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { isMerkleArtifactType } from "@/lib/artifact-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  FileJson,
  FileSpreadsheet,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Shield,
  Calendar as CalendarIcon,
  Plus,
  Eye,
  Lock,
  Send,
} from "lucide-react";
import { format } from "date-fns";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileUploadSectionProps {
  input: {
    id: string;
    accessGroupId: string | null;
    accessGroup: { id: string; name: string } | null;
    stream: {
      id: string;
      name: string;
      slug: string;
      artifactType: string;
      assetType: string | null;
      unit: string | null;
      valueField: string | null;
    };
  };
  space: { id: string; name: string };
  slug: string;
  canSubmit: boolean;
  csrfFetch: (url: string, init?: RequestInit) => Promise<Response>;
  setError: (msg: string | null) => void;
  onEntryCreated: () => void;
}

interface ParsedRow {
  id: string;
  data: Record<string, unknown>;
}

interface ParseResult {
  rows: ParsedRow[];
  columns: string[];
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Sample data generators
// ---------------------------------------------------------------------------

function getSampleCsv(valueField: string, assetType: string | null): string {
  const at = assetType?.toLowerCase();
  if (at === "gold" || at === "platinum" || at === "palladium") {
    return `id,${valueField},purity,vault,custodian
BAR-001,400,0.9999,Zurich-A,Swiss Vault AG
BAR-002,100,0.999,London-B,Brinks
BAR-003,1000,0.9999,Singapore-C,Malca-Amit`;
  }
  if (at === "silver") {
    return `id,${valueField},purity,vault,custodian
SLV-001,1000,0.999,Delaware-A,Delaware Depository
SLV-002,500,0.9999,Utah-B,Mountain West`;
  }
  if (at === "gemstones" || at === "diamonds") {
    return `id,${valueField},type,grade,vault
GEM-001,2.5,diamond,VVS1,NYC-Secure
GEM-002,5.2,emerald,AAA,Geneva-Prime`;
  }
  return `id,${valueField},description
item-1,100,Item 1
item-2,250,Item 2
item-3,75,Item 3`;
}

function getSampleJson(valueField: string, assetType: string | null): string {
  const at = assetType?.toLowerCase();
  if (at === "gold" || at === "platinum" || at === "palladium") {
    return JSON.stringify(
      [
        { id: "BAR-001", data: { [valueField]: 400, purity: 0.9999, vault: "Zurich-A", custodian: "Swiss Vault AG" } },
        { id: "BAR-002", data: { [valueField]: 100, purity: 0.999, vault: "London-B", custodian: "Brinks" } },
        { id: "BAR-003", data: { [valueField]: 1000, purity: 0.9999, vault: "Singapore-C", custodian: "Malca-Amit" } },
      ],
      null,
      2
    );
  }
  if (at === "silver") {
    return JSON.stringify(
      [
        { id: "SLV-001", data: { [valueField]: 1000, purity: 0.999, vault: "Delaware-A", custodian: "Delaware Depository" } },
        { id: "SLV-002", data: { [valueField]: 500, purity: 0.9999, vault: "Utah-B", custodian: "Mountain West" } },
      ],
      null,
      2
    );
  }
  if (at === "gemstones" || at === "diamonds") {
    return JSON.stringify(
      [
        { id: "GEM-001", data: { [valueField]: 2.5, type: "diamond", grade: "VVS1", vault: "NYC-Secure" } },
        { id: "GEM-002", data: { [valueField]: 5.2, type: "emerald", grade: "AAA", vault: "Geneva-Prime" } },
      ],
      null,
      2
    );
  }
  return JSON.stringify(
    [
      { id: "item-1", data: { [valueField]: 100, description: "Item 1" } },
      { id: "item-2", data: { [valueField]: 250, description: "Item 2" } },
      { id: "item-3", data: { [valueField]: 75, description: "Item 3" } },
    ],
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// CSV Parser
// ---------------------------------------------------------------------------

function parseCsvToRows(
  csvText: string,
  idColumn: string,
  valueField: string | null
): ParseResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const columns = result.meta.fields ?? [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const ids = new Set<string>();

  if (result.errors.length > 0) {
    for (const err of result.errors.slice(0, 5)) {
      errors.push(`Row ${(err.row ?? 0) + 1}: ${err.message}`);
    }
  }

  if (!columns.includes(idColumn)) {
    errors.push(
      `Column "${idColumn}" not found. Available columns: ${columns.join(", ")}`
    );
    return { rows, columns, errors, warnings };
  }

  for (let i = 0; i < result.data.length; i++) {
    const row = result.data[i];
    const id = row[idColumn]?.trim();
    if (!id) {
      errors.push(`Row ${i + 2}: missing "${idColumn}" value.`);
      continue;
    }
    if (ids.has(id)) {
      errors.push(`Row ${i + 2}: duplicate id "${id}".`);
      continue;
    }
    ids.add(id);

    const data: Record<string, unknown> = {};
    for (const col of columns) {
      if (col === idColumn) continue;
      const val = row[col]?.trim() ?? "";
      // Try to parse numbers
      const num = Number(val);
      data[col] = val !== "" && !isNaN(num) ? num : val;
    }

    if (valueField && (data[valueField] === undefined || data[valueField] === "")) {
      errors.push(
        `Row ${i + 2} (${id}): missing required value field "${valueField}".`
      );
      continue;
    }
    if (valueField && typeof data[valueField] !== "number") {
      errors.push(
        `Row ${i + 2} (${id}): "${valueField}" must be a number.`
      );
      continue;
    }

    rows.push({ id, data });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push("No data rows found in CSV.");
  }

  return { rows, columns, errors, warnings };
}

// ---------------------------------------------------------------------------
// JSON Parser
// ---------------------------------------------------------------------------

function parseJsonToRows(
  jsonText: string,
  valueField: string | null
): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const columns: string[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { rows, columns, errors: ["Invalid JSON format."], warnings };
  }

  if (!Array.isArray(parsed)) {
    return {
      rows,
      columns,
      errors: ["JSON must be an array of objects."],
      warnings,
    };
  }

  if (parsed.length === 0) {
    return {
      rows,
      columns,
      errors: ["Array must contain at least one entry."],
      warnings,
    };
  }

  const ids = new Set<string>();
  const allDataKeys = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`Entry ${i + 1}: must be an object.`);
      continue;
    }

    const id = (entry as Record<string, unknown>).id;
    if (!id || typeof id !== "string") {
      errors.push(`Entry ${i + 1}: missing a string "id" field.`);
      continue;
    }
    if (ids.has(id)) {
      errors.push(`Duplicate id "${id}" found.`);
      continue;
    }
    ids.add(id);

    const data = (entry as Record<string, unknown>).data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      errors.push(`Entry "${id}": missing a "data" object.`);
      continue;
    }

    const dataObj = data as Record<string, unknown>;
    for (const key of Object.keys(dataObj)) {
      allDataKeys.add(key);
    }

    if (valueField) {
      const val = dataObj[valueField];
      if (val === undefined || val === null) {
        errors.push(
          `Entry "${id}": missing required value field "${valueField}" in data.`
        );
        continue;
      }
      if (typeof val !== "number" || !isFinite(val)) {
        errors.push(
          `Entry "${id}": field "${valueField}" must be a number.`
        );
        continue;
      }
    }

    rows.push({ id, data: dataObj });
  }

  columns.push("id", ...Array.from(allDataKeys));

  if (rows.length === 0 && errors.length === 0) {
    errors.push("No valid entries found.");
  }

  return { rows, columns, errors, warnings };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FileUploadSection({
  input,
  space,
  slug,
  canSubmit,
  csrfFetch,
  setError,
}: FileUploadSectionProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMerkle = isMerkleArtifactType(input.stream.artifactType);
  const isValueType = input.stream.artifactType?.toLowerCase() === "value";
  const effectiveValueField = input.stream.valueField || "";
  const hasValueFieldConfigured = !!input.stream.valueField;

  // File state
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileType, setFileType] = useState<"csv" | "json" | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // CSV column mapping
  const [idColumn, setIdColumn] = useState("id");

  // Submit state
  const [submitDate, setSubmitDate] = useState<Date>(new Date());
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitRipcord, setSubmitRipcord] = useState(false);
  const [submitRipcordDetails, setSubmitRipcordDetails] = useState<string[]>([
    "",
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Computed values
  const totalValue = useMemo(() => {
    if (!parseResult?.rows.length || !effectiveValueField) return 0;
    return parseResult.rows.reduce((sum, row) => {
      const val = row.data[effectiveValueField];
      return sum + (typeof val === "number" ? val : 0);
    }, 0);
  }, [parseResult, effectiveValueField]);

  const isValid =
    parseResult !== null &&
    parseResult.rows.length > 0 &&
    parseResult.errors.length === 0;

  // -- File handling -------------------------------------------------------

  const processFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "csv" && ext !== "json") {
        setError("Please upload a .csv or .json file.");
        return;
      }

      setFileName(file.name);
      setFileType(ext as "csv" | "json");
      setError(null);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setRawText(text);

        if (ext === "csv") {
          // Auto-detect columns first, then parse
          const preview = Papa.parse<Record<string, string>>(text, {
            header: true,
            preview: 1,
            transformHeader: (h) => h.trim(),
          });
          const cols = preview.meta.fields ?? [];
          const idCol =
            cols.find((c) => c.toLowerCase() === "id") ?? cols[0] ?? "id";
          setIdColumn(idCol);
          const result = parseCsvToRows(
            text,
            idCol,
            isMerkle ? effectiveValueField : null
          );
          setParseResult(result);
        } else {
          const result = parseJsonToRows(
            text,
            isMerkle ? effectiveValueField : null
          );
          setParseResult(result);
        }
      };
      reader.onerror = () => setError("Failed to read file.");
      reader.readAsText(file);
    },
    [isMerkle, effectiveValueField, setError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [processFile]
  );

  const handleIdColumnChange = useCallback(
    (newIdColumn: string) => {
      setIdColumn(newIdColumn);
      if (rawText && fileType === "csv") {
        setParseResult(
          parseCsvToRows(
            rawText,
            newIdColumn,
            isMerkle ? effectiveValueField : null
          )
        );
      }
    },
    [rawText, fileType, isMerkle, effectiveValueField]
  );

  const clearFile = () => {
    setFileName(null);
    setFileType(null);
    setRawText(null);
    setParseResult(null);
    setShowPreview(false);
  };

  // -- Submit --------------------------------------------------------------

  const handleSubmit = async () => {
    if (!parseResult || !isValid || !space || !input) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedRipcordDetails = submitRipcord
        ? submitRipcordDetails.filter((d) => d.trim() !== "")
        : [];

      const body: Record<string, unknown> = {
        data: parseResult.rows,
        timestamp: submitDate.toISOString(),
        notes: submitNotes || undefined,
        ripcord: submitRipcord,
        ripcordDetails: trimmedRipcordDetails,
      };

      // For VALUE type with single row, submit as value instead
      if (isValueType && parseResult.rows.length === 1) {
        const row = parseResult.rows[0];
        const valKey =
          effectiveValueField ||
          Object.keys(row.data).find((k) => typeof row.data[k] === "number");
        if (valKey && typeof row.data[valKey] === "number") {
          body.value = row.data[valKey];
          delete body.data;
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
        const details = Array.isArray(data.details)
          ? data.details.join(" ")
          : null;
        const errors = Array.isArray(data.errors)
          ? data.errors.join(" ")
          : null;
        setError(
          details || errors || data.error || "Failed to submit entry."
        );
        setIsSubmitting(false);
        return;
      }

      router.push(`/spaces/${slug}/reserves?stream=${input.stream.id}`);
    } catch {
      setError("Failed to submit entry.");
    }
    setIsSubmitting(false);
  };

  // -- Download sample -----------------------------------------------------

  const downloadSample = (fmt: "csv" | "json") => {
    const vf = effectiveValueField || "value";
    const content =
      fmt === "csv"
        ? getSampleCsv(vf, input.stream.assetType)
        : getSampleJson(vf, input.stream.assetType);

    const blob = new Blob([content], {
      type: fmt === "csv" ? "text/csv" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sample-reserve-data.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // -- Render --------------------------------------------------------------

  if (!canSubmit) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          You do not have permission to submit entries. Only admins and
          auditors can submit data.
        </CardContent>
      </Card>
    );
  }

  const previewDataKeys =
    parseResult && parseResult.rows.length > 0
      ? Object.keys(parseResult.rows[0].data)
      : [];
  const visibleDataKeys = previewDataKeys.slice(0, 6);
  const hiddenKeyCount = Math.max(0, previewDataKeys.length - 6);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Upload className="w-4 h-4" />
          Upload File
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {input.accessGroupId && (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            This input is restricted to the &ldquo;
            {input.accessGroup?.name}&rdquo; group.
          </div>
        )}

        {/* Value field warning for merkle types */}
        {isMerkle && !hasValueFieldConfigured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900 mb-1">
              Value field not configured
            </p>
            <p className="text-sm text-amber-700">
              Set a value field before uploading merkle tree entries.
            </p>
          </div>
        )}

        {/* Format examples */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-900">
              Expected file format
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadSample("csv")}
                className="text-xs h-7"
              >
                <Download className="w-3 h-3 mr-1" />
                CSV Sample
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadSample("json")}
                className="text-xs h-7"
              >
                <Download className="w-3 h-3 mr-1" />
                JSON Sample
              </Button>
            </div>
          </div>

          <Tabs defaultValue="csv" className="w-full">
            <TabsList className="h-8">
              <TabsTrigger value="csv" className="text-xs px-3 h-7">
                <FileSpreadsheet className="w-3 h-3 mr-1" />
                CSV
              </TabsTrigger>
              <TabsTrigger value="json" className="text-xs px-3 h-7">
                <FileJson className="w-3 h-3 mr-1" />
                JSON
              </TabsTrigger>
            </TabsList>
            <TabsContent value="csv" className="mt-2">
              <p className="text-xs text-slate-600 mb-2">
                CSV file with an{" "}
                <code className="bg-slate-200 px-1 rounded">id</code> column
                {effectiveValueField && (
                  <>
                    {" "}
                    and a numeric{" "}
                    <code className="bg-blue-100 px-1 rounded text-blue-800 font-semibold">
                      {effectiveValueField}
                    </code>{" "}
                    column
                  </>
                )}
                . All other columns become data fields.
              </p>
              <pre className="text-xs font-mono text-slate-700 bg-white rounded border p-3 overflow-x-auto">
                {getSampleCsv(
                  effectiveValueField || "value",
                  input.stream.assetType
                )}
              </pre>
            </TabsContent>
            <TabsContent value="json" className="mt-2">
              <p className="text-xs text-slate-600 mb-2">
                JSON array of objects with{" "}
                <code className="bg-slate-200 px-1 rounded">id</code> and{" "}
                <code className="bg-slate-200 px-1 rounded">data</code> fields
                {effectiveValueField && (
                  <>
                    , where data contains a numeric{" "}
                    <code className="bg-blue-100 px-1 rounded text-blue-800 font-semibold">
                      {effectiveValueField}
                    </code>{" "}
                    field
                  </>
                )}
                .
              </p>
              <pre className="text-xs font-mono text-slate-700 bg-white rounded border p-3 overflow-x-auto">
                {getSampleJson(
                  effectiveValueField || "value",
                  input.stream.assetType
                )}
              </pre>
            </TabsContent>
          </Tabs>
        </div>

        {/* Dropzone */}
        {!fileName ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-blue-400 bg-blue-50"
                : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
            }`}
          >
            <Upload
              className={`w-8 h-8 mx-auto mb-3 ${
                isDragging ? "text-blue-500" : "text-slate-400"
              }`}
            />
            <p className="text-sm font-medium text-slate-700">
              {isDragging
                ? "Drop your file here"
                : "Drag & drop a file here, or click to browse"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Accepts .csv and .json files
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* File info bar */}
            <div className="flex items-center justify-between rounded-lg border bg-white p-3">
              <div className="flex items-center gap-3">
                {fileType === "csv" ? (
                  <FileSpreadsheet className="w-5 h-5 text-green-600" />
                ) : (
                  <FileJson className="w-5 h-5 text-blue-600" />
                )}
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {fileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fileType?.toUpperCase()} file
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isValid && (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800 text-xs"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {parseResult!.rows.length}{" "}
                    {parseResult!.rows.length === 1 ? "row" : "rows"}
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearFile}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* CSV column mapping */}
            {fileType === "csv" &&
              parseResult &&
              parseResult.columns.length > 0 && (
                <div className="rounded-lg border bg-white p-4 space-y-3">
                  <p className="text-sm font-medium text-slate-900">
                    Column Mapping
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">ID Column</Label>
                      <Select
                        value={idColumn}
                        onValueChange={handleIdColumnChange}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {parseResult.columns.map((col) => (
                            <SelectItem
                              key={col}
                              value={col}
                              className="text-xs"
                            >
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {effectiveValueField && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Value Column</Label>
                        <div className="h-8 flex items-center px-3 text-xs bg-slate-50 rounded-md border text-slate-600">
                          {effectiveValueField}
                          {parseResult.columns.includes(
                            effectiveValueField
                          ) ? (
                            <CheckCircle2 className="w-3 h-3 ml-auto text-green-600" />
                          ) : (
                            <AlertCircle className="w-3 h-3 ml-auto text-red-500" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

            {/* Validation results */}
            {parseResult && (
              <div className="space-y-2">
                {/* Success summary */}
                {isValid && (
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      Valid: {parseResult.rows.length}{" "}
                      {parseResult.rows.length === 1 ? "row" : "rows"}
                      {totalValue > 0 && effectiveValueField && (
                        <>
                          {" "}
                          &middot; Total {effectiveValueField}:{" "}
                          {totalValue.toLocaleString()}
                          {input.stream.unit
                            ? ` ${input.stream.unit}`
                            : ""}
                        </>
                      )}
                    </span>
                  </div>
                )}

                {/* Errors */}
                {parseResult.errors.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                    <p className="text-sm font-medium text-red-800 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4" />
                      {parseResult.errors.length}{" "}
                      {parseResult.errors.length === 1
                        ? "error"
                        : "errors"}{" "}
                      found
                    </p>
                    <ul className="text-xs text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                      {parseResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Preview toggle */}
                {parseResult.rows.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                    className="text-slate-600"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    {showPreview ? "Hide Preview" : "Show Preview"}
                  </Button>
                )}

                {/* Preview table */}
                {showPreview && parseResult.rows.length > 0 && (
                  <div className="rounded-lg border overflow-hidden">
                    <div className="overflow-x-auto max-h-64">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 border-b">
                              #
                            </th>
                            <th className="text-left px-3 py-2 font-medium text-slate-600 border-b">
                              ID
                            </th>
                            {visibleDataKeys.map((key) => (
                              <th
                                key={key}
                                className={`text-left px-3 py-2 font-medium border-b ${
                                  key === effectiveValueField
                                    ? "text-blue-700 bg-blue-50"
                                    : "text-slate-600"
                                }`}
                              >
                                {key}
                              </th>
                            ))}
                            {hiddenKeyCount > 0 && (
                              <th className="text-left px-3 py-2 font-medium text-slate-400 border-b">
                                +{hiddenKeyCount}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {parseResult.rows.slice(0, 10).map((row, i) => (
                            <tr
                              key={row.id}
                              className={
                                i % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                              }
                            >
                              <td className="px-3 py-1.5 text-slate-400">
                                {i + 1}
                              </td>
                              <td className="px-3 py-1.5 font-mono text-slate-900">
                                {row.id}
                              </td>
                              {visibleDataKeys.map((key) => (
                                <td
                                  key={key}
                                  className={`px-3 py-1.5 ${
                                    key === effectiveValueField
                                      ? "font-medium text-blue-800"
                                      : "text-slate-700"
                                  }`}
                                >
                                  {String(row.data[key] ?? "")}
                                </td>
                              ))}
                              {hiddenKeyCount > 0 && (
                                <td className="px-3 py-1.5 text-slate-400">
                                  ...
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {parseResult.rows.length > 10 && (
                      <div className="px-3 py-2 bg-slate-50 border-t text-xs text-slate-500 text-center">
                        Showing 10 of {parseResult.rows.length} rows
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Audit date + notes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="uploadDate">Audit Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="uploadDate"
                  variant="outline"
                  className="w-full justify-between text-left font-normal"
                  type="button"
                >
                  {format(submitDate, "PPP")}
                  <CalendarIcon className="w-4 h-4 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={submitDate}
                  onSelect={(date) => {
                    if (date instanceof Date) setSubmitDate(date);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="uploadNotes">Notes</Label>
          <Textarea
            id="uploadNotes"
            placeholder="Additional context about this upload"
            value={submitNotes}
            onChange={(e) => setSubmitNotes(e.target.value)}
            rows={3}
          />
        </div>

        {/* Ripcord */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-slate-900">
                Ripcord Status
              </p>
              <p className="text-xs text-slate-500">
                Enable for emergency response.
              </p>
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
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        const filtered = submitRipcordDetails.filter(
                          (_, i) => i !== index
                        );
                        setSubmitRipcordDetails(
                          filtered.length > 0 ? filtered : [""]
                        );
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setSubmitRipcordDetails([...submitRipcordDetails, ""])
              }
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-100"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Detail
            </Button>
          </div>
        )}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            !isValid ||
            (isMerkle && !hasValueFieldConfigured)
          }
        >
          <Send className="w-4 h-4 mr-1" />
          {isSubmitting
            ? "Submitting..."
            : `Submit ${parseResult?.rows.length ?? 0} Entries`}
        </Button>
      </CardContent>
    </Card>
  );
}
