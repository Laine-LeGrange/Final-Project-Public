// Relative time "ago" formatter
export function ago(input?: string | Date | number | null): string {
  if (!input && input !== 0) return "—";

  // Parse input to timestamp
  const timestamp = typeof input === "string" || typeof input === "number"
    ? new Date(input).getTime()
    : input instanceof Date
      ? input.getTime()
      : NaN;

  if (!Number.isFinite(timestamp)) return "—";

  // Calculate elapsed time
  const secondsElapsed = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (secondsElapsed < 60) return "Just now";

  const minutesElapsed = Math.floor(secondsElapsed / 60);
  if (minutesElapsed < 60) {
    return `${minutesElapsed} min${minutesElapsed === 1 ? "" : "s"} ago`;
  }

  const hoursElapsed = Math.floor(minutesElapsed / 60);
  if (hoursElapsed < 24) {
    return `${hoursElapsed} hour${hoursElapsed === 1 ? "" : "s"} ago`;
  }

  const daysElapsed = Math.floor(hoursElapsed / 24);
  return `${daysElapsed} day${daysElapsed === 1 ? "" : "s"} ago`;
}

// Format date time in a locale-aware way - otherwise gmt
export function fmtDateTime(
  input?: string | Date | number | null,
  locale?: string
): string {
  if (!input && input !== 0) return "";

  // Parse input to Date object
  const dateObject =
    typeof input === "string" || typeof input === "number"
      ? new Date(input)
      : input instanceof Date
      ? input
      : null;

  // Validate date object
  if (!dateObject || isNaN(dateObject.getTime())) return "";

  // Format date to locale string
  return dateObject.toLocaleString(locale);
}
