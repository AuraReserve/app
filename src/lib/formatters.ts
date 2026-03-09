/**
 * Formatting Utilities
 *
 * Centralized formatting functions for dates, numbers, currency, and other common formats.
 */

import { format, parseISO } from "date-fns";

/**
 * Format a date value into a readable string
 *
 * @param date - Date string, Date object, or null
 * @param formatString - Date format pattern (default: 'MMM d, yyyy')
 * @returns Formatted date string or fallback
 */
export function formatDate(
  date: string | Date | null | undefined,
  formatString: string = 'MMM d, yyyy'
): string {
  if (!date) return '-';

  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatString);
  } catch {
    return '-';
  }
}
