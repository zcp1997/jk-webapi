export interface PresetRequest {
  url: string;
  appkey: string;
  password: string;
  ver: string;
  timestamp?: string;
  dataRaw: string;
  dataB64?: string;
}

export interface PresetItem {
  id: string;
  name: string;
  request: PresetRequest;
  updatedAt: string;
}

export interface GroupItem {
  id: string;
  name: string;
  presets: PresetItem[];
  updatedAt: string;
}

export interface StorageGroups {
  groups: GroupItem[];
  lastUsedGroupId?: string;
  lastUsedPresetId?: string;
}

export interface HistoryItem {
  id: string;
  ts: string;
  durationMs: number;
  status: number | null;
  ok: boolean;
  requestSummary: {
    url: string;
    appkey: string;
    ver: string;
    timestamp: string;
    sign: string;
    dataB64Len: number;
  };
  request?: PresetRequest;
  responseText: string;
  errorMessage?: string;
}

export interface StorageHistory {
  items: HistoryItem[];
  limit?: number;
}

export interface RequestResult {
  raw: string;
  decoded?: string;
  json?: string;
  jsonError?: string;
  base64Error?: string;
}
