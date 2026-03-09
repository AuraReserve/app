/**
 * Generate evenly-spaced monthly tick values between two timestamps.
 * For ranges under 3 months, generates ticks at the start of each month.
 * For longer ranges, skips months to avoid overcrowding (max ~12 ticks).
 */
export function generateMonthlyTicks(minTs: number, maxTs: number): number[] {
  const minDate = new Date(minTs);
  const maxDate = new Date(maxTs);

  // Start from the first day of the month following (or equal to) minDate
  const start = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  // End at the first day of the month following maxDate
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);

  // Collect all month-start timestamps in range
  const allMonths: number[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    allMonths.push(cursor.getTime());
    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (allMonths.length <= 1) {
    // Very short range — just return the min and max
    return [minTs, maxTs];
  }

  // If too many months, step by 2, 3, 6, or 12 months
  const maxTicks = 12;
  let step = 1;
  for (const s of [1, 2, 3, 6, 12]) {
    if (Math.ceil(allMonths.length / s) <= maxTicks) {
      step = s;
      break;
    }
  }

  const ticks: number[] = [];
  for (let i = 0; i < allMonths.length; i += step) {
    ticks.push(allMonths[i]);
  }

  return ticks;
}
