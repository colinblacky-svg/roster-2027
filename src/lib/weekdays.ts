export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
export type FullWeekday = (typeof WEEKDAYS)[number];

// Only Mon-Thu can be a preferred/secondary call day (§4.3) — Friday only ever
// matters for weekend eligibility, never as a midweek preferred day.
export const CALL_WEEKDAYS = ["MON", "TUE", "WED", "THU"] as const;
export type CallWeekday = (typeof CALL_WEEKDAYS)[number];

export const WEEKDAY_LABELS: Record<FullWeekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
};

export function parseSecondaryDays(json: string): CallWeekday[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as CallWeekday[]) : [];
  } catch {
    return [];
  }
}
