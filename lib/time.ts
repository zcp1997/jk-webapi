import { format } from "date-fns";

export function getTimestamp(date = new Date()): string {
  return format(date, "yyyyMMddHHmmss");
}

export function formatIso(ts: string): string {
  try {
    return format(new Date(ts), "yyyy-MM-dd HH:mm:ss");
  } catch {
    return ts;
  }
}
