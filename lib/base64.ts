export function encodeUtf8ToBase64(input: string): string {
  if (!input) {
    return "";
  }
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(input, "utf-8").toString("base64");
    }
  } catch {
  }
  return btoa(unescape(encodeURIComponent(input)));
}

export function decodeBase64ToUtf8(input: string): { data?: string; error?: string } {
  if (!input) {
    return { data: "" };
  }
  if (typeof Buffer !== "undefined") {
    try {
      const decoded = Buffer.from(input, "base64").toString("utf-8");
      return { data: decoded };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }
  try {
    const decoded = decodeURIComponent(escape(atob(input)));
    return { data: decoded };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

export function isValidJson(value: string): boolean {
  if (!value) {
    return false;
  }
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}
