const timestampFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hourCycle: "h23",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function formatTimestamp(value?: string | null, fallback = "Chưa cập nhật"): string {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? timestampFormatter.format(date) : fallback;
}

export function safeExternalUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
