"use client";

import { FileText } from "lucide-react";
import { AuditLogPageContent } from "@/components/audit/audit-log-page-content";

export default function AuditLogsPage() {
  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <FileText className="w-8 h-8" />
            Audit Logs
          </h1>
          <p className="text-slate-600 mt-2">
            View all activity across your accessible spaces
          </p>
        </div>

        <AuditLogPageContent showSpaceName={true} />
      </div>
    </div>
  );
}
