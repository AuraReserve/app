"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AssetType } from "@/lib/entities";
import type { AssetType as AssetTypeType } from "@/lib/entities/types";
import { ASSET_TYPE_ICONS } from "@/lib/asset-types";
import { AssetTypeIcon } from "@/components/common/asset-type-icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ClipboardList, Save, Trash2 } from "lucide-react";

const slugify = (input: string) =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-2">
      {ASSET_TYPE_ICONS.map((iconOpt) => (
        <button
          key={iconOpt.value}
          type="button"
          onClick={() => onChange(iconOpt.value)}
          className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-colors ${
            value === iconOpt.value
              ? "border-blue-600 bg-blue-50 text-blue-900"
              : "border-slate-200 hover:bg-slate-50 text-slate-600"
          }`}
          title={iconOpt.label}
        >
          <AssetTypeIcon icon={iconOpt.value} className="w-5 h-5" />
          <span className="truncate w-full text-center">{iconOpt.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function AssetTypesPage() {
  const [assetTypes, setAssetTypes] = useState<AssetTypeType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [newAssetType, setNewAssetType] = useState({
    label: "",
    value: "",
    icon: "",
    description: ""
  });
  const [newValueDirty, setNewValueDirty] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    label: "",
    value: "",
    icon: "",
    description: ""
  });
  const [editValueDirty, setEditValueDirty] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadAssetTypes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const types = await AssetType.list("-created_date");
      setAssetTypes(types);
    } catch (err) {
      console.error("Error loading asset types:", err);
      setError("Failed to load asset types. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAssetTypes();
  }, []);

  const handleNewLabelChange = (label: string) => {
    setNewAssetType((prev) => ({ ...prev, label }));
    if (!newValueDirty) {
      setNewAssetType((prev) => ({ ...prev, value: slugify(label) }));
    }
  };

  const handleNewValueChange = (value: string) => {
    setNewValueDirty(true);
    setNewAssetType((prev) => ({ ...prev, value: slugify(value) }));
  };

  const handleCreateAssetType = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!newAssetType.label.trim() || !newAssetType.value.trim()) {
      setError("Label and identifier are required.");
      return;
    }

    setIsCreating(true);
    try {
      const descriptionValue = newAssetType.description.trim();
      await AssetType.create({
        label: newAssetType.label.trim(),
        value: slugify(newAssetType.value),
        icon: newAssetType.icon || undefined,
        description: descriptionValue ? descriptionValue : undefined
      });

      setNewAssetType({ label: "", value: "", icon: "", description: "" });
      setNewValueDirty(false);
      setSuccessMessage("Asset type created successfully.");
      await loadAssetTypes();
    } catch (err) {
      console.error("Error creating asset type:", err);
      setError("Could not create asset type. Make sure the identifier is unique.");
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (type: AssetTypeType) => {
    setEditingId(type.id);
    setEditForm({
      label: type.label,
      value: type.value,
      icon: type.icon || "",
      description: type.description || ""
    });
    setEditValueDirty(false);
    setError(null);
    setSuccessMessage(null);
  };

  const handleEditLabelChange = (label: string) => {
    setEditForm((prev) => ({ ...prev, label }));
    if (!editValueDirty) {
      setEditForm((prev) => ({ ...prev, value: slugify(label) }));
    }
  };

  const handleEditValueChange = (value: string) => {
    setEditValueDirty(true);
    setEditForm((prev) => ({ ...prev, value: slugify(value) }));
  };

  const handleUpdateAssetType = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingId) return;

    setError(null);
    setSuccessMessage(null);

    if (!editForm.label.trim() || !editForm.value.trim()) {
      setError("Label and identifier are required.");
      return;
    }

    setIsUpdating(true);
    try {
      const descriptionValue = editForm.description.trim();
      await AssetType.update(editingId, {
        label: editForm.label.trim(),
        value: slugify(editForm.value),
        icon: editForm.icon || undefined,
        description: descriptionValue ? descriptionValue : undefined
      });

      setEditingId(null);
      setEditForm({ label: "", value: "", icon: "", description: "" });
      setEditValueDirty(false);
      setSuccessMessage("Asset type updated successfully.");
      await loadAssetTypes();
    } catch (err) {
      console.error("Error updating asset type:", err);
      setError("Could not update asset type. The identifier might already be in use.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAssetType = async (type: AssetTypeType) => {
    const usageCount = type.usage_count ?? 0;
    if (usageCount > 0) {
      setError(`"${type.label}" is currently used by ${usageCount} space(s) and cannot be deleted.`);
      return;
    }

    const confirmed = window.confirm(`Delete the asset type "${type.label}"?`);
    if (!confirmed) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    try {
      const success = await AssetType.delete(type.id);
      if (!success) {
        setError("Could not delete the asset type. It may still be in use.");
        return;
      }

      setSuccessMessage("Asset type deleted successfully.");
      await loadAssetTypes();
    } catch (err) {
      console.error("Error deleting asset type:", err);
      setError("Failed to delete asset type. Please try again.");
    }
  };

  const activeAssetTypes = useMemo(
    () => assetTypes.toSorted((a, b) => a.label.localeCompare(b.label)),
    [assetTypes]
  );

  const isEditing = editingId !== null;

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Asset Types</h1>
          <p className="text-slate-600 mt-2 max-w-2xl">
            Manage asset types for your AuraReserve workspace. Asset types defined here become available when creating spaces or proof-of-reserve records.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <ClipboardList className="w-5 h-5" />
                Asset Types
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading asset types...</p>
              ) : activeAssetTypes.length === 0 ? (
                <p className="text-sm text-slate-500">No asset types defined yet. Create one on the right to get started.</p>
              ) : (
                <div className="space-y-3">
                  {activeAssetTypes.map((type) => {
                    const usageCount = type.usage_count ?? 0;
                    return (
                      <div key={type.id} className="border border-slate-200 rounded-lg p-4 bg-white shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <AssetTypeIcon icon={type.icon} className="w-5 h-5 text-slate-600" />
                              <h3 className="text-lg font-semibold text-slate-900">{type.label}</h3>
                              {usageCount > 0 && (
                                <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                                  In use ({usageCount})
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-slate-500">Identifier: <span className="font-mono text-slate-700">{type.value}</span></p>
                            {type.description && (
                              <p className="text-sm text-slate-600 mt-1">{type.description}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => startEditing(type)}>
                              Edit
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteAssetType(type)}
                              disabled={usageCount > 0}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <Save className="w-5 h-5" />
                {isEditing ? "Update Asset Type" : "Create Asset Type"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form onSubmit={handleUpdateAssetType} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-label">Display Name *</Label>
                    <Input
                      id="edit-label"
                      placeholder="e.g. Gold"
                      value={editForm.label}
                      onChange={(event) => handleEditLabelChange(event.target.value)}
                    />
                    <p className="text-xs text-slate-500">Shown across the UI when referencing this asset type.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-value">Identifier *</Label>
                    <Input
                      id="edit-value"
                      placeholder="e.g. gold"
                      value={editForm.value}
                      onChange={(event) => handleEditValueChange(event.target.value)}
                    />
                    <p className="text-xs text-slate-500">Lowercase, URL-safe identifier used in APIs. Changing it updates existing spaces automatically.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Icon</Label>
                    <IconPicker
                      value={editForm.icon}
                      onChange={(icon) => setEditForm((prev) => ({ ...prev, icon }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      placeholder="Optional context for internal teams."
                      value={editForm.description}
                      onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))}
                      className="h-24"
                    />
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isUpdating}>
                      {isUpdating ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)} disabled={isUpdating}>
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleCreateAssetType} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-label">Display Name *</Label>
                    <Input
                      id="new-label"
                      placeholder="e.g. Gold"
                      value={newAssetType.label}
                      onChange={(event) => handleNewLabelChange(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-value">Identifier *</Label>
                    <Input
                      id="new-value"
                      placeholder="e.g. gold"
                      value={newAssetType.value}
                      onChange={(event) => handleNewValueChange(event.target.value)}
                    />
                    <p className="text-xs text-slate-500">Automatically generated from the name. You can override it if needed.</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Icon</Label>
                    <IconPicker
                      value={newAssetType.icon}
                      onChange={(icon) => setNewAssetType((prev) => ({ ...prev, icon }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new-description">Description</Label>
                    <Textarea
                      id="new-description"
                      placeholder="Optional context for internal teams."
                      value={newAssetType.description}
                      onChange={(event) => setNewAssetType((prev) => ({ ...prev, description: event.target.value }))}
                      className="h-24"
                    />
                  </div>

                  <Button type="submit" className="bg-blue-600 hover:bg-blue-700" disabled={isCreating}>
                    {isCreating ? "Creating..." : "Create Asset Type"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-slate-900">Usage Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              Every space must reference an asset type. When you add a new asset type, it immediately becomes available in the "Create Space" flow. Updating an asset type's identifier cascades to existing spaces.
            </p>
            <p>
              Asset types currently in use cannot be deleted. Remove or update the associated spaces first, or change them to reference another asset type.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
