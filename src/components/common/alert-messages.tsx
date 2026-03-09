/**
 * AlertMessages Component
 *
 * Displays error and success messages with consistent styling.
 * Eliminates duplicate alert code across 10+ pages.
 */

"use client";

import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";

export interface AlertMessagesProps {
  /**
   * Error message to display
   */
  error?: string | null;

  /**
   * Success message to display
   */
  success?: string | null;

  /**
   * Additional className for the container
   */
  className?: string;
}

/**
 * Reusable component for displaying error and success messages
 *
 * @example
 * ```tsx
 * const { error, success } = useFormState();
 *
 * <AlertMessages error={error} success={success} />
 * ```
 */
export function AlertMessages({ error, success, className }: AlertMessagesProps) {
  if (!error && !success) return null;

  return (
    <div className={className}>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="bg-green-50 border-green-200 mb-4">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
