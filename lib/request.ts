import { md5UpperHex } from "@/lib/sign";
import { getTimestamp } from "@/lib/time";
import type { PresetRequest } from "@/lib/types";

export interface RequestOptions {
  request: PresetRequest;
  timeoutMs: number;
  forceTime?: string;
}

export interface RequestExecution {
  responseText: string;
  status: number | null;
  ok: boolean;
  durationMs: number;
  timestamp: string;
  sign: string;
}

export async function executeMultipartRequest(
  options: RequestOptions
): Promise<RequestExecution> {
  const { request, timeoutMs, forceTime } = options;
  const timestamp = forceTime ?? request.timestamp ?? getTimestamp();
  const dataB64 =
    request.dataB64 && request.dataB64.length > 0
      ? request.dataB64
      : "";
  const sign = await md5UpperHex(`${timestamp}${dataB64}${request.password}`);

  const form = new FormData();
  form.append("appkey", request.appkey);
  form.append("timestamp", timestamp);
  form.append("data", dataB64);
  form.append("sign", sign);
  form.append("ver", request.ver || "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const res = await fetch(request.url, {
      method: "POST",
      body: form,
      signal: controller.signal
    });
    const text = await res.text();
    return {
      responseText: text,
      status: res.status,
      ok: res.ok,
      durationMs: Math.round(performance.now() - startedAt),
      timestamp,
      sign
    };
  } finally {
    clearTimeout(timeout);
  }
}
