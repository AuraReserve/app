"use client";

import React, { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight,
  Database,
  Download,
  Upload,
  TreeDeciduous,
  Circle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ARTIFACT_LABELS_SHORT, ARTIFACT_BADGE_COLORS, ARTIFACT_BORDER_COLORS, STATUS_DOT_COLORS } from "@/lib/artifact-types";

// Shape matching getSpaceIntegrations() DAL return
export interface SpaceIntegrationData {
  id: string;
  direction: string; // "input" | "output" (lowercase from Prisma @map)
  status: string; // "active" | "inactive" | "error"
  trigger: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  integration: {
    key: string;
    displayName: string;
  };
  stream: {
    id: string;
    name: string;
    slug: string;
    artifactType: string;
    isActive: boolean;
  };
}

// Shape matching getSpaceStores() DAL return
interface StoreData {
  id: string;
  name: string;
  slug: string;
  artifactType: string;
  assetType?: string | null;
  isActive: boolean;
}

interface StoreFlowVisualizationProps {
  streams: StoreData[];
  integrations: SpaceIntegrationData[];
}

const STATUS_DOT = STATUS_DOT_COLORS;

function StatusDot({ status }: { status: string }) {
  return <Circle className={`w-2.5 h-2.5 fill-current ${STATUS_DOT[status] ?? STATUS_DOT.inactive}`} />;
}

const ARTIFACT_COLORS = ARTIFACT_BORDER_COLORS;
const ARTIFACT_BADGE = ARTIFACT_BADGE_COLORS;
const ARTIFACT_LABELS = ARTIFACT_LABELS_SHORT;

function ArtifactIcon({ type }: { type: string }) {
  if (type !== "value") return <TreeDeciduous className="w-4 h-4" />;
  return <Database className="w-4 h-4" />;
}

interface IntegrationNode {
  id: string;
  integrationKey: string;
  displayName: string;
  status: string;
  trigger: string;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

interface StoreNode {
  id: string;
  name: string;
  slug: string;
  artifactType: string;
  assetType: string | null;
  isActive: boolean;
  inputs: IntegrationNode[];
  outputs: IntegrationNode[];
}

function IntegrationCard({
  node,
  direction,
}: {
  node: IntegrationNode;
  direction: "input" | "output";
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border bg-white text-sm min-h-16">
      <StatusDot status={node.status} />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{node.displayName}</div>
        <div className="text-xs text-slate-400 flex items-center gap-1">
          {direction === "input" ? (
            <Download className="w-3 h-3" />
          ) : (
            <Upload className="w-3 h-3" />
          )}
          <span>{node.trigger}</span>
          {node.lastRunAt && (
            <>
              <span className="mx-0.5">&middot;</span>
              <span>
                {formatDistanceToNow(new Date(node.lastRunAt), {
                  addSuffix: true,
                })}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StreamColumn({ stream }: { stream: StoreNode }) {
  const artifactKey = stream.artifactType.toLowerCase();
  const artifactLabel = ARTIFACT_LABELS[artifactKey] ?? stream.artifactType;
  const columnLabel = stream.assetType
    ? `${stream.assetType} \u00B7 ${artifactLabel}`
    : artifactLabel;

  return (
    <div className={`w-52 rounded-lg border-2 p-4 min-h-20 flex-1 flex flex-col justify-center ${ARTIFACT_COLORS[artifactKey] ?? "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-center gap-2">
        <ArtifactIcon type={artifactKey} />
        <span className="font-semibold text-sm truncate">{stream.name}</span>
      </div>
      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
        <Badge className={`text-xs ${ARTIFACT_BADGE[artifactKey] ?? "bg-slate-100 text-slate-800"}`}>
          {columnLabel}
        </Badge>
      </div>
    </div>
  );
}

export const StoreFlowVisualization = memo(function StoreFlowVisualization({
  streams,
  integrations,
}: StoreFlowVisualizationProps) {
  const streamNodes = useMemo<StoreNode[]>(() => {
    return streams.map((s) => {
      const inputs = integrations
        .filter((i) => i.stream.id === s.id && i.direction.toLowerCase() === "input")
        .map((i) => ({
          id: i.id,
          integrationKey: i.integration.key,
          displayName: i.integration.displayName,
          status: i.status,
          trigger: i.trigger,
          lastRunAt: i.lastRunAt,
          lastRunStatus: i.lastRunStatus,
        }));
      const outputs = integrations
        .filter((i) => i.stream.id === s.id && i.direction.toLowerCase() === "output")
        .map((i) => ({
          id: i.id,
          integrationKey: i.integration.key,
          displayName: i.integration.displayName,
          status: i.status,
          trigger: i.trigger,
          lastRunAt: i.lastRunAt,
          lastRunStatus: i.lastRunStatus,
        }));
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        artifactType: s.artifactType,
        assetType: s.assetType ?? null,
        isActive: s.isActive,
        inputs,
        outputs,
      };
    });
  }, [streams, integrations]);

  if (streamNodes.length === 0) return null;

  return (
    <Card className="shadow-sm border-slate-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ArrowRight className="w-5 h-5 text-blue-600" />
          Data Flow
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {streamNodes.map((stream) => (
          <div
            key={stream.id}
            className="grid items-stretch gap-2"
            style={{ gridTemplateColumns: "1fr auto 1fr" }}
          >
            {/* Input sources column */}
            <div className="space-y-1.5 flex flex-col justify-center">
              {stream.inputs.length > 0 ? (
                stream.inputs.map((input) => (
                  <IntegrationCard
                    key={input.id}
                    node={input}
                    direction="input"
                  />
                ))
              ) : (
                <div className="px-3 py-2 rounded-md border border-dashed border-slate-200 text-xs text-slate-400 text-center min-h-16 flex items-center justify-center">
                  No input source
                </div>
              )}
            </div>

            {/* Arrow → Stream → Arrow */}
            <div className="flex items-center gap-1.5 self-stretch">
              <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
              <StreamColumn stream={stream} />
              <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
            </div>

            {/* Output destinations column */}
            <div className="space-y-1.5 flex flex-col justify-center">
              {stream.outputs.length > 0 ? (
                stream.outputs.map((output) => (
                  <IntegrationCard
                    key={output.id}
                    node={output}
                    direction="output"
                  />
                ))
              ) : (
                <div className="px-3 py-2 rounded-md border border-dashed border-slate-200 text-xs text-slate-400 text-center min-h-16 flex items-center justify-center">
                  No output destination
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
});
