"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";
import { AuditLogPageContent } from "@/components/audit/audit-log-page-content";

export default function SpaceAuditLogsPage() {
  const params = useParams();
  const slug = params.slug as string;

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <Link
            href={`/spaces/${slug}`}
            className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Space
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <FileText className="w-6 h-6" />
            Audit Logs
          </h1>
          <p className="text-muted-foreground mt-1">Activity history for this space</p>
        </div>

        <AuditLogPageContent
          spaceSlug={slug}
          showSpaceName={false}
          emptyMessage="No activity recorded for this space yet"
        />
      </div>
    </div>
  );
}
