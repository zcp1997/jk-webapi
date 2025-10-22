import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function safeJsonParse<T>(value: string): { data?: T; error?: Error } {
  try {
    return { data: JSON.parse(value) as T };
  } catch (error) {
    return { error: error as Error };
  }
}

export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export function generateId(): string {
  const cryptoRef = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
