import { generateId, isBrowser } from "@/lib/utils";
import type {
  GroupItem,
  HistoryItem,
  PresetItem,
  PresetRequest,
  StorageGroups,
  StorageHistory
} from "@/lib/types";

const GROUPS_KEY = "jk_wms_webapi_groups";
const HISTORY_KEY = "jk_wms_webapi_history";
const HISTORY_LIMIT = 500;

function ensureWindow(): Storage | undefined {
  if (!isBrowser()) return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  const storage = ensureWindow();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  const storage = ensureWindow();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export function loadGroups(): StorageGroups {
  return readStorage<StorageGroups>(GROUPS_KEY, { groups: [] });
}

export function saveGroups(data: StorageGroups) {
  writeStorage(GROUPS_KEY, data);
}

export function loadHistory(): StorageHistory {
  return readStorage<StorageHistory>(HISTORY_KEY, { items: [], limit: HISTORY_LIMIT });
}

export function saveHistory(data: StorageHistory) {
  writeStorage(HISTORY_KEY, data);
}

export function upsertPreset(
  groupId: string,
  preset: PresetItem,
  existing: StorageGroups
): StorageGroups {
  const groups = existing.groups.map((group) => {
    if (group.id !== groupId) return group;
    const index = group.presets.findIndex((p) => p.id === preset.id);
    const presets =
      index === -1
        ? [...group.presets, preset]
        : group.presets.map((p) => (p.id === preset.id ? preset : p));
    return { ...group, presets, updatedAt: new Date().toISOString() };
  });
  const result: StorageGroups = {
    ...existing,
    groups,
    lastUsedGroupId: groupId,
    lastUsedPresetId: preset.id
  };
  saveGroups(result);
  return result;
}

export function createGroup(name: string, existing: StorageGroups): StorageGroups {
  const newGroup: GroupItem = {
    id: generateId(),
    name,
    presets: [],
    updatedAt: new Date().toISOString()
  };
  const result: StorageGroups = {
    groups: [...existing.groups, newGroup],
    lastUsedGroupId: newGroup.id,
    lastUsedPresetId: undefined
  };
  saveGroups(result);
  return result;
}

export function deleteGroup(groupId: string, existing: StorageGroups): StorageGroups {
  const result: StorageGroups = {
    ...existing,
    groups: existing.groups.filter((g) => g.id !== groupId),
    lastUsedGroupId:
      existing.lastUsedGroupId === groupId ? undefined : existing.lastUsedGroupId,
    lastUsedPresetId:
      existing.lastUsedPresetId &&
      existing.groups.some((g) =>
        g.presets.some((p) => p.id === existing.lastUsedPresetId)
      )
        ? existing.lastUsedPresetId
        : undefined
  };
  saveGroups(result);
  return result;
}

export function deletePreset(groupId: string, presetId: string, existing: StorageGroups): StorageGroups {
  const groups = existing.groups.map((group) => {
    if (group.id !== groupId) return group;
    return {
      ...group,
      presets: group.presets.filter((p) => p.id !== presetId),
      updatedAt: new Date().toISOString()
    };
  });
  const result: StorageGroups = {
    ...existing,
    groups,
    lastUsedPresetId: existing.lastUsedPresetId === presetId ? undefined : existing.lastUsedPresetId
  };
  saveGroups(result);
  return result;
}

export function renameGroup(groupId: string, name: string, existing: StorageGroups): StorageGroups {
  const groups = existing.groups.map((group) =>
    group.id === groupId ? { ...group, name, updatedAt: new Date().toISOString() } : group
  );
  const result: StorageGroups = { ...existing, groups };
  saveGroups(result);
  return result;
}

export function clonePreset(groupId: string, preset: PresetItem, existing: StorageGroups): StorageGroups {
  const clone: PresetItem = {
    ...preset,
    id: generateId(),
    name: `${preset.name} Copy`,
    updatedAt: new Date().toISOString()
  };
  const groups = existing.groups.map((group) =>
    group.id === groupId
      ? { ...group, presets: [...group.presets, clone], updatedAt: new Date().toISOString() }
      : group
  );
  const result: StorageGroups = { ...existing, groups };
  saveGroups(result);
  return result;
}

export function ensureGroupWithPreset(existing: StorageGroups, groupName: string, preset: PresetRequest) {
  let data = existing;
  if (!existing.groups.length) {
    data = createGroup(groupName, existing);
  }
  const group = data.groups[0];
  const newPreset: PresetItem = {
    id: generateId(),
    name: "示例 Preset",
    request: preset,
    updatedAt: new Date().toISOString()
  };
  return upsertPreset(group.id, newPreset, data);
}

export function pushHistory(entry: HistoryItem, existing: StorageHistory): StorageHistory {
  const limit = existing.limit ?? HISTORY_LIMIT;
  const items = [entry, ...existing.items].slice(0, limit);
  const result: StorageHistory = { ...existing, items, limit };
  saveHistory(result);
  return result;
}

export function clearHistory(): StorageHistory {
  const result: StorageHistory = { items: [], limit: HISTORY_LIMIT };
  saveHistory(result);
  return result;
}

export function exportAll(groups: StorageGroups, history: StorageHistory) {
  return {
    groups,
    history
  };
}

export function importAll(data: unknown): { groups: StorageGroups; history: StorageHistory } | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { groups?: StorageGroups; history?: StorageHistory };
  if (!payload.groups || !payload.history) return null;
  saveGroups(payload.groups);
  saveHistory(payload.history);
  return { groups: payload.groups, history: payload.history };
}
