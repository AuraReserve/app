export const TRIGGER_LABELS: Record<string, string> = {
  manual: "Manual",
  cron: "Cron Schedule",
  on_change: "On Change",
};

export function getTriggerLabel(trigger: string | null): string {
  if (!trigger) return "--";
  return TRIGGER_LABELS[trigger.toLowerCase()] ?? trigger;
}
