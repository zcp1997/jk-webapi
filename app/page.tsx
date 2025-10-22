"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CloudUpload,
  Copy,
  FileDown,
  FileUp,
  FolderPlus,
  History as HistoryIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Send,
  Trash2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";

import { copyToClipboard } from "@/lib/clipboard";
import { decodeBase64ToUtf8, encodeUtf8ToBase64, isValidJson } from "@/lib/base64";
import { executeMultipartRequest } from "@/lib/request";
import {
  clearHistory,
  clonePreset,
  createGroup,
  deleteGroup,
  deletePreset,
  exportAll,
  importAll,
  loadGroups,
  loadHistory,
  pushHistory,
  renameGroup,
  saveGroups,
  saveHistory,
  upsertPreset
} from "@/lib/storage";
import { getTimestamp, formatIso } from "@/lib/time";
import type {
  GroupItem,
  HistoryItem,
  PresetItem,
  PresetRequest,
  StorageGroups,
  StorageHistory
} from "@/lib/types";
import { cn, generateId, isBrowser, safeJsonParse } from "@/lib/utils";

const formSchema = z.object({
  url: z.string().url("请输入合法的 URL"),
  appkey: z.string().min(1, "appkey 必填"),
  password: z.string().min(1, "AppPassword 必填"),
  ver: z.string().min(1, "版本号必填"),
  timestamp: z.string().regex(/^\d{14}$/, "timestamp 必须是 yyyyMMddHHmmss"),
  dataRaw: z.string().min(1, "请填写 data 原始 JSON"),
  dataB64: z.string().optional(),
  timeoutMs: z.coerce.number().min(1000, "最小 1s").max(600000, "最大 10 分钟")
});

type FormValues = z.infer<typeof formSchema>;

type DialogState =
  | { type: "group-create" }
  | { type: "group-rename"; group: GroupItem }
  | { type: "preset-save" }
  | { type: "preset-rename"; preset: PresetItem; groupId: string }
  | null;

interface LastExecution {
  status: number | null;
  ok: boolean;
  durationMs: number;
  timestamp: string;
  sign: string;
  time: string;
}

interface ResultView {
  raw: string;
  decoded?: string;
  json?: string;
  jsonError?: string;
  base64Error?: string;
}

const DEFAULT_TIMEOUT = 30000;

const initialRequest: PresetRequest = {
  url: "",
  appkey: "",
  password: "",
  ver: "1",
  dataRaw: "",
  timestamp: getTimestamp()
};

export default function HomePage() {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      url: "",
      appkey: "",
      password: "",
      ver: "1",
      timestamp: getTimestamp(),
      dataRaw: "",
      dataB64: "",
      timeoutMs: DEFAULT_TIMEOUT
    },
    mode: "onBlur"
  });

  const [groupsState, setGroupsState] = useState<StorageGroups>({ groups: [] });
  const [historyState, setHistoryState] = useState<StorageHistory>({ items: [], limit: 500 });
  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>();
  const [selectedPresetId, setSelectedPresetId] = useState<string | undefined>();
  const [dialogState, setDialogState] = useState<DialogState>(null);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [confirmImport, setConfirmImport] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sign, setSign] = useState("");
  const [result, setResult] = useState<ResultView | null>(null);
  const [lastExecution, setLastExecution] = useState<LastExecution | null>(null);
  const [activeTab, setActiveTab] = useState("raw");

  const watchTimestamp = form.watch("timestamp");
  const watchPassword = form.watch("password");
  const watchDataB64 = form.watch("dataB64");
  const watchDataRaw = form.watch("dataRaw");

  useEffect(() => {
    if (!isBrowser()) return;
    const storedGroups = loadGroups();
    const storedHistory = loadHistory();
    setGroupsState(storedGroups);
    setHistoryState(storedHistory);
    if (storedGroups.lastUsedGroupId) {
      setSelectedGroupId(storedGroups.lastUsedGroupId);
    } else if (storedGroups.groups[0]) {
      setSelectedGroupId(storedGroups.groups[0].id);
    }
    if (storedGroups.lastUsedPresetId) {
      setSelectedPresetId(storedGroups.lastUsedPresetId);
    }
  }, []);

  useEffect(() => {
    async function compute() {
      if (!watchTimestamp || !watchPassword || !watchDataB64) {
        setSign("");
        return;
      }
      const upper = await (await import("@/lib/sign")).md5UpperHex(
        `${watchTimestamp}${watchDataB64}${watchPassword}`
      );
      setSign(upper);
    }
    compute();
  }, [watchTimestamp, watchPassword, watchDataB64]);

  useEffect(() => {
    if (!selectedGroupId || !groupsState.groups.length) return;
    const group = groupsState.groups.find((g) => g.id === selectedGroupId);
    if (!group) return;
    if (!selectedPresetId && group.presets.length) {
      setSelectedPresetId(group.presets[0].id);
      fillFromPreset(group.presets[0]);
      return;
    }
    if (selectedPresetId) {
      const preset = group.presets.find((p) => p.id === selectedPresetId);
      if (preset) {
        fillFromPreset(preset);
      }
    }
  }, [selectedGroupId, selectedPresetId, groupsState]);

  useEffect(() => {
    saveGroups(groupsState);
  }, [groupsState]);

  useEffect(() => {
    saveHistory(historyState);
  }, [historyState]);

  const fillFromPreset = useCallback(
    (preset: PresetItem) => {
      form.reset({
        url: preset.request.url,
        appkey: preset.request.appkey,
        password: preset.request.password,
        ver: preset.request.ver ?? "1",
        timestamp: preset.request.timestamp ?? getTimestamp(),
        dataRaw: preset.request.dataRaw,
        dataB64: preset.request.dataB64 ?? "",
        timeoutMs: form.getValues("timeoutMs") || DEFAULT_TIMEOUT
      });
      setResult(null);
      setActiveTab("raw");
      toast({
        title: "已载入预设",
        description: `${preset.name}`
      });
    },
    [form]
  );

  const selectedGroup = useMemo(
    () => groupsState.groups.find((group) => group.id === selectedGroupId),
    [groupsState, selectedGroupId]
  );

  const selectedPreset = useMemo(() => {
    if (!selectedGroup) return undefined;
    return selectedGroup.presets.find((preset) => preset.id === selectedPresetId);
  }, [selectedGroup, selectedPresetId]);

  const createGroupAndSelect = useCallback(
    (name: string) => {
      let newGroupId = "";
      setGroupsState((prev) => {
        const next = createGroup(name, prev);
        newGroupId = next.lastUsedGroupId ?? "";
        return next;
      });
      if (newGroupId) {
        setSelectedGroupId(newGroupId);
        setSelectedPresetId(undefined);
      }
      return newGroupId;
    },
    []
  );

  const handleConvertBase64 = useCallback(
    (silent?: boolean) => {
      const raw = form.getValues("dataRaw");
      if (!raw) {
        toast({
          title: "请填写 JSON 文本",
          variant: "destructive"
        });
        return false;
      }
      if (!isValidJson(raw)) {
        toast({
          title: "JSON 格式错误",
          description: "请检查 data 原始 JSON 是否为合法格式",
          variant: "destructive"
        });
        return false;
      }
      const encoded = encodeUtf8ToBase64(raw);
      form.setValue("dataB64", encoded, { shouldDirty: true, shouldTouch: true });
      if (!silent) {
        toast({
          title: "已转换为 Base64",
          description: `长度 ${encoded.length}`
        });
      }
      return true;
    },
    [form]
  );

  const ensureTimestamp = useCallback(() => {
    const now = getTimestamp();
    form.setValue("timestamp", now, { shouldDirty: true, shouldTouch: true });
    toast({
      title: "已刷新 timestamp",
      description: now
    });
  }, [form]);

  const ensureRequiredBeforeSend = useCallback(() => {
    const values = form.getValues();
    const validation = formSchema.safeParse(values);
    if (!validation.success) {
      toast({
        title: "表单校验失败",
        description: validation.error.issues.map((x) => x.message).join("\n"),
        variant: "destructive"
      });
      return false;
    }
    if (!values.dataB64) {
      toast({
        title: "Base64 数据为空",
        description: "请先点击「转为 Base64」",
        variant: "destructive"
      });
      return false;
    }
    return true;
  }, [form]);

  const handleSend = useCallback(
    async (convertFirst: boolean) => {
      if (convertFirst) {
        const ok = handleConvertBase64(true);
        if (!ok) return;
      }
      if (!ensureRequiredBeforeSend()) return;
      setIsSending(true);
      const values = form.getValues();
      try {
        const execution = await executeMultipartRequest({
          request: {
            url: values.url,
            appkey: values.appkey,
            password: values.password,
            ver: values.ver,
            dataRaw: values.dataRaw,
            dataB64: values.dataB64 ?? "",
            timestamp: values.timestamp
          },
          timeoutMs: values.timeoutMs
        });
        const decoded = decodeBase64ToUtf8(execution.responseText);
        let json: string | undefined;
        let jsonError: string | undefined;
        if (decoded.data) {
          const parsed = safeJsonParse(decoded.data);
          if (parsed.data) {
            json = JSON.stringify(parsed.data, null, 2);
          } else if (parsed.error) {
            jsonError = parsed.error.message;
          }
        } else {
          const parsedRaw = safeJsonParse(execution.responseText);
          if (parsedRaw.data) {
            json = JSON.stringify(parsedRaw.data, null, 2);
          } else if (parsedRaw.error) {
            jsonError = parsedRaw.error.message;
          }
        }
        const view: ResultView = {
          raw: execution.responseText,
          decoded: decoded.data,
          base64Error: decoded.error,
          json,
          jsonError
        };
        setResult(view);
        setActiveTab("raw");
        const snapshot: PresetRequest = {
          url: values.url,
          appkey: values.appkey,
          password: values.password,
          ver: values.ver,
          timestamp: execution.timestamp,
          dataRaw: values.dataRaw,
          dataB64: values.dataB64 ?? ""
        };
        const log: HistoryItem = {
          id: generateId(),
          ts: new Date().toISOString(),
          durationMs: execution.durationMs,
          status: execution.status,
          ok: execution.ok,
          requestSummary: {
            url: values.url,
            appkey: values.appkey,
            ver: values.ver,
            timestamp: execution.timestamp,
            sign: execution.sign,
            dataB64Len: (values.dataB64 ?? "").length
          },
          responseText: execution.responseText,
          errorMessage: execution.ok ? undefined : "HTTP 非 2xx",
          request: snapshot
        };
        setHistoryState((prev) => pushHistory(log, prev));
        setLastExecution({
          status: execution.status,
          ok: execution.ok,
          durationMs: execution.durationMs,
          timestamp: execution.timestamp,
          sign: execution.sign,
          time: new Date().toISOString()
        });
        toast({
          title: execution.ok ? "请求成功" : "请求完成（非 2xx）",
          description: `耗时 ${execution.durationMs} ms`
        });
      } catch (error) {
        const message = (error as Error).message;
        toast({
          title: "请求失败",
          description: message,
          variant: "destructive"
        });
        const snapshot: PresetRequest = {
          url: values.url,
          appkey: values.appkey,
          password: values.password,
          ver: values.ver,
          timestamp: values.timestamp,
          dataRaw: values.dataRaw,
          dataB64: values.dataB64 ?? ""
        };
        const log: HistoryItem = {
          id: generateId(),
          ts: new Date().toISOString(),
          durationMs: 0,
          status: null,
          ok: false,
          requestSummary: {
            url: values.url,
            appkey: values.appkey,
            ver: values.ver,
            timestamp: values.timestamp,
            sign: sign,
            dataB64Len: (values.dataB64 ?? "").length
          },
          responseText: "",
          errorMessage: message,
          request: snapshot
        };
        setHistoryState((prev) => pushHistory(log, prev));
        setLastExecution(null);
      } finally {
        setIsSending(false);
      }
    },
    [ensureRequiredBeforeSend, form, handleConvertBase64, sign]
  );

  const handleSavePreset = useCallback(
    (groupId: string, name: string) => {
      const values = form.getValues();
      const preset: PresetItem = {
        id: generateId(),
        name,
        request: {
          url: values.url,
          appkey: values.appkey,
          password: values.password,
          ver: values.ver,
          timestamp: values.timestamp,
          dataRaw: values.dataRaw,
          dataB64: values.dataB64
        },
        updatedAt: new Date().toISOString()
      };
      setGroupsState((prev) => upsertPreset(groupId, preset, prev));
      setSelectedGroupId(groupId);
      setSelectedPresetId(preset.id);
      toast({
        title: "预设已保存",
        description: `${name}`
      });
    },
    [form]
  );

  const handleExport = useCallback(() => {
    const data = exportAll(groupsState, historyState);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jk-webapi-helper-backup-${getTimestamp()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      title: "数据已导出",
      description: "已下载备份 JSON 文件"
    });
  }, [groupsState, historyState]);

  const handleImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importText);
      const result = importAll(parsed);
      if (!result) {
        toast({
          title: "导入失败",
          description: "JSON 结构不正确",
          variant: "destructive"
        });
        return;
      }
      setGroupsState(result.groups);
      setHistoryState(result.history);
      setSelectedGroupId(result.groups.lastUsedGroupId ?? result.groups.groups[0]?.id);
      setSelectedPresetId(result.groups.lastUsedPresetId);
      setImportDialogOpen(false);
      setImportText("");
      setConfirmImport(false);
      toast({
        title: "导入成功",
        description: "本地数据已更新"
      });
    } catch (error) {
      toast({
        title: "导入失败",
        description: (error as Error).message,
        variant: "destructive"
      });
    }
  }, [importText]);

  const resetForm = useCallback(() => {
    form.reset({
      url: "",
      appkey: "",
      password: "",
      ver: "1",
      timestamp: getTimestamp(),
      dataRaw: "",
      dataB64: "",
      timeoutMs: DEFAULT_TIMEOUT
    });
    setResult(null);
    setLastExecution(null);
    setActiveTab("raw");
  }, [form]);

  const handleClearHistory = useCallback(() => {
    setHistoryState(clearHistory());
    toast({
      title: "历史已清空"
    });
  }, []);

  const handleHistoryRestore = useCallback(
    (item: HistoryItem) => {
      const request = item.request;
      if (!request) {
        toast({
          title: "历史记录缺少完整信息",
          variant: "destructive"
        });
        return;
      }
      form.reset({
        url: request.url,
        appkey: request.appkey,
        password: request.password,
        ver: request.ver,
        timestamp: request.timestamp ?? getTimestamp(),
        dataRaw: request.dataRaw,
        dataB64: request.dataB64 ?? "",
        timeoutMs: form.getValues("timeoutMs") || DEFAULT_TIMEOUT
      });
      toast({
        title: "已回填",
        description: "参数已填入表单"
      });
    },
    [form]
  );

  const renderGroups = () => (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">工作目录</div>
        <Button size="sm" variant="ghost" onClick={() => setDialogState({ type: "group-create" })}>
          <FolderPlus className="mr-2 h-4 w-4" />
          新增
        </Button>
      </div>
      <ScrollArea className="flex-1 rounded-md border bg-card">
        <div className="p-2 space-y-1">
          {groupsState.groups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">暂无分组，点击新增创建。</div>
          ) : (
            groupsState.groups.map((group) => (
              <div
                key={group.id}
                className={cn(
                  "rounded-md border p-2",
                  selectedGroupId === group.id ? "border-primary ring-1 ring-primary" : "border-border"
                )}
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setSelectedPresetId(undefined);
                    }}
                    className="w-full text-left font-medium hover:text-primary"
                  >
                    {group.name}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>分组操作</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => setDialogState({ type: "group-rename", group })}>
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          setGroupsState((prev) => deleteGroup(group.id, prev));
                          toast({ title: "分组已删除" });
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除分组
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1">
                  {group.presets.map((preset) => (
                    <div
                      key={preset.id}
                      className={cn(
                        "flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted/60",
                        selectedPresetId === preset.id ? "bg-primary/10" : ""
                      )}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          setSelectedPresetId(preset.id);
                          fillFromPreset(preset);
                        }}
                      >
                        {preset.name}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>预设操作</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => {
                              setGroupsState((prev) => clonePreset(group.id, preset, prev));
                              toast({ title: "预设已复制" });
                            }}
                          >
                            复制
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              setDialogState({ type: "preset-rename", preset, groupId: group.id })
                            }
                          >
                            重命名
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              setGroupsState((prev) => deletePreset(group.id, preset.id, prev));
                              toast({ title: "预设已删除" });
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setDialogState({ type: "preset-save" });
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    新建预设
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );

  const renderToolbar = () => (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button onClick={() => setDialogState({ type: "preset-save" })}>
          <Save className="mr-2 h-4 w-4" />
          保存为预设
        </Button>
        <Button variant="secondary" onClick={resetForm}>
          <RefreshCw className="mr-2 h-4 w-4" />
          清空表单
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={handleExport}>
          <FileDown className="mr-2 h-4 w-4" />
          导出数据
        </Button>
        <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
          <FileUp className="mr-2 h-4 w-4" />
          导入数据
        </Button>
      </div>
    </div>
  );

  const renderForm = () => (
    <Card>
      <CardHeader>
        <CardTitle>请求构造</CardTitle>
        <CardDescription>填写请求信息，支持 Base64 签名自动计算。</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>后端地址</FormLabel>
                    <FormControl>
                      <Input placeholder="https://api.example.com/endpoint" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="appkey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>appkey</FormLabel>
                    <FormControl>
                      <Input placeholder="appkey" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>password (AppPassword)</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="AppPassword" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ver"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ver</FormLabel>
                    <FormControl>
                      <Input placeholder="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="timestamp"
                render={({ field }) => (
                  <FormItem className="relative">
                    <FormLabel>timestamp</FormLabel>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Input readOnly {...field} />
                      </FormControl>
                      <Button type="button" variant="outline" size="icon" onClick={ensureTimestamp}>
                        <RotateCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <FormDescription>格式 yyyyMMddHHmmss，可随时刷新。</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="dataRaw"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>data（Base64 前，原始 JSON）</FormLabel>
                      <Badge variant="secondary">长度 {field.value?.length || 0}</Badge>
                    </div>
                    <FormControl>
                      <Textarea rows={8} placeholder='{"hello": "world"}' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dataB64"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>data（Base64 后）</FormLabel>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">长度 {field.value?.length || 0}</Badge>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => copyToClipboard(field.value ?? "", "Base64 已复制")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <FormControl>
                      <Textarea rows={8} readOnly value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                签名 sign
                <Badge variant="outline">MD5(timestamp + data + AppPassword)</Badge>
              </Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={sign} />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(sign, "sign 已复制")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced">
                <AccordionTrigger>高级设置</AccordionTrigger>
                <AccordionContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="timeoutMs"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>超时时间 (ms)</FormLabel>
                          <FormControl>
                            <Input type="number" min={1000} step={1000} {...field} />
                          </FormControl>
                          <FormDescription>默认 30000 ms，可根据接口延迟调整。</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </form>
        </Form>
      </CardContent>
    </Card>
  );

  const renderActions = () => (
    <Card>
      <CardHeader>
        <CardTitle>请求操作</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => handleConvertBase64(false)}>
          <CloudUpload className="mr-2 h-4 w-4" />
          转为 Base64
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => handleSend(false)}
          disabled={isSending}
        >
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          推送
        </Button>
        <Button type="button" onClick={() => handleSend(true)} disabled={isSending}>
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          转为 Base64 并推送
        </Button>
      </CardContent>
    </Card>
  );

  const renderResult = () => (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>响应结果</CardTitle>
        {lastExecution ? (
          <CardDescription className="flex flex-wrap items-center gap-3">
            <Badge variant={lastExecution.ok ? "secondary" : "outline"}>
              状态 {lastExecution.status ?? "N/A"}
            </Badge>
            <span>耗时 {lastExecution.durationMs} ms</span>
            <span>请求时间 {formatIso(lastExecution.time)}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(lastExecution.sign, "签名已复制")}
            >
              复制签名
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyToClipboard(result?.raw ?? "", "响应已复制")}
            >
              复制响应
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setResult(null)}>
              清空显示
            </Button>
          </CardDescription>
        ) : (
          <CardDescription>等待请求完成后显示结果。</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex h-[420px] flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="raw">Raw</TabsTrigger>
            <TabsTrigger value="decoded">Base64 解码</TabsTrigger>
            <TabsTrigger value="json">JSON 视图</TabsTrigger>
            <TabsTrigger value="history">
              <HistoryIcon className="mr-2 h-4 w-4" />
              历史
            </TabsTrigger>
          </TabsList>
          <TabsContent value="raw" className="flex-1 overflow-hidden rounded-md border bg-muted/20">
            <ScrollArea className="h-full">
              <pre className="whitespace-pre-wrap p-4 text-sm">
                {result?.raw ?? "暂无数据"}
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="decoded" className="flex-1 overflow-hidden rounded-md border bg-muted/20">
            <ScrollArea className="h-full">
              <pre className="whitespace-pre-wrap p-4 text-sm">
                {result?.decoded ?? result?.base64Error ?? "暂无数据"}
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="json" className="flex-1 overflow-hidden rounded-md border bg-muted/20">
            <ScrollArea className="h-full">
              <pre className="whitespace-pre-wrap p-4 text-sm">
                {result?.json ?? result?.jsonError ?? "暂无数据"}
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="history" className="flex-1 overflow-hidden rounded-md border bg-muted/20 p-0">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <div className="text-sm text-muted-foreground">
                  共 {historyState.items.length} 条记录（保留 {historyState.limit ?? 500} 条）
                </div>
                <Button size="sm" variant="ghost" onClick={handleClearHistory}>
                  清空历史
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>耗时</TableHead>
                      <TableHead>appkey</TableHead>
                      <TableHead>数据长度</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyState.items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          暂无历史记录
                        </TableCell>
                      </TableRow>
                    ) : (
                      historyState.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{formatIso(item.ts)}</TableCell>
                          <TableCell>
                            <Badge variant={item.ok ? "secondary" : "outline"}>
                              {item.status ?? "错误"}
                            </Badge>
                          </TableCell>
                          <TableCell>{item.durationMs} ms</TableCell>
                          <TableCell>{item.requestSummary.appkey}</TableCell>
                          <TableCell>{item.requestSummary.dataB64Len}</TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyToClipboard(item.responseText, "响应已复制")}
                            >
                              复制响应
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleHistoryRestore(item)}
                            >
                              回填
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                  <TableCaption>请求历史会自动保留最近 500 条。</TableCaption>
                </Table>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div>
            <div className="text-lg font-semibold">jk-webapi-helper</div>
            <div className="text-xs text-muted-foreground">
              构造 multipart/form-data 请求，调试 jk webapi。
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div>Base64 长度 {form.getValues("dataB64")?.length ?? 0}</div>
            <Separator orientation="vertical" className="h-4" />
            <div>JSON 长度 {watchDataRaw?.length ?? 0}</div>
          </div>
        </div>
      </header>
      <main className="flex flex-1 overflow-hidden">
        <aside className="hidden w-72 border-r bg-muted/20 p-4 md:block">{renderGroups()}</aside>
        <section className="flex-1 overflow-y-auto">
          <div className="container mx-auto flex flex-col gap-4 px-4 py-6">
            {renderToolbar()}
            {renderForm()}
            {renderActions()}
            {renderResult()}
          </div>
        </section>
      </main>

      <Dialog open={dialogState?.type === "group-create"} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增分组</DialogTitle>
            <DialogDescription>为分组取一个名字，用于管理多个接口预设。</DialogDescription>
          </DialogHeader>
          <GroupNameForm
            onSubmit={(name) => {
              createGroupAndSelect(name);
              setDialogState(null);
              toast({ title: "分组已创建", description: name });
            }}
          />
        </DialogContent>
      </Dialog>

      {dialogState && dialogState.type === "group-rename" && (
        <Dialog open onOpenChange={(open) => !open && setDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重命名分组</DialogTitle>
            </DialogHeader>
            <GroupNameForm
              defaultValue={dialogState.group.name}
              onSubmit={(name) => {
                setGroupsState((prev) => renameGroup(dialogState.group.id, name, prev));
                setDialogState(null);
                toast({ title: "分组已重命名" });
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {dialogState?.type === "preset-save" && (
        <Dialog open onOpenChange={(open) => !open && setDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>保存为预设</DialogTitle>
              <DialogDescription>选择分组并为本次参数命名。</DialogDescription>
            </DialogHeader>
            <PresetSaveForm
              groups={groupsState.groups}
              selectedGroupId={selectedGroupId}
              onSubmit={(groupId, name) => {
                handleSavePreset(groupId, name);
                setDialogState(null);
              }}
              onCreateGroup={(name) => {
                const id = createGroupAndSelect(name);
                return id;
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {dialogState && dialogState.type === "preset-rename" && (
        <Dialog open onOpenChange={(open) => !open && setDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>重命名预设</DialogTitle>
            </DialogHeader>
            <GroupNameForm
              defaultValue={dialogState.preset.name}
              onSubmit={(name) => {
                const preset: PresetItem = {
                  ...dialogState.preset,
                  name,
                  updatedAt: new Date().toISOString()
                };
                setGroupsState((prev) => upsertPreset(dialogState.groupId, preset, prev));
                setDialogState(null);
                toast({ title: "预设已重命名" });
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导入数据</DialogTitle>
            <DialogDescription>
              粘贴导出的 JSON 文本。导入前请确认数据来源可靠，导入后当前数据将被覆盖。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="粘贴 jk_webapi_helper 导出的 JSON"
          />
          <div className="flex items-center gap-2">
            <input
              id="confirm-import"
              type="checkbox"
              checked={confirmImport}
              onChange={(e) => setConfirmImport(e.target.checked)}
            />
            <Label htmlFor="confirm-import">确认覆盖当前数据</Label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleImport} disabled={!confirmImport}>
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupNameForm({
  defaultValue = "",
  onSubmit
}: {
  defaultValue?: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(defaultValue);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          toast({ title: "名称不能为空", variant: "destructive" });
          return;
        }
        onSubmit(name.trim());
      }}
    >
      <div className="space-y-2">
        <Label>名称</Label>
        <Input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </div>
      <DialogFooter>
        <Button type="submit">确定</Button>
      </DialogFooter>
    </form>
  );
}

function PresetSaveForm({
  groups,
  selectedGroupId,
  onSubmit,
  onCreateGroup
}: {
  groups: GroupItem[];
  selectedGroupId?: string;
  onSubmit: (groupId: string, name: string) => void;
  onCreateGroup: (name: string) => string | undefined;
}) {
  const [groupId, setGroupId] = useState<string>(selectedGroupId ?? groups[0]?.id ?? "");
  const [name, setName] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  useEffect(() => {
    if (!groups.length) return;
    if (!groupId) {
      setGroupId(groups[0].id);
    }
  }, [groups, groupId]);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!groupId) {
          toast({ title: "请选择分组", variant: "destructive" });
          return;
        }
        if (!name.trim()) {
          toast({ title: "预设名称不能为空", variant: "destructive" });
          return;
        }
        onSubmit(groupId, name.trim());
      }}
    >
      <div className="space-y-2">
        <Label>选择分组</Label>
        <select
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm"
        >
          <option value="" disabled>
            请选择分组
          </option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>预设名称</Label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：测试环境-创建订单"
          autoFocus
        />
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <Label>快速新建分组</Label>
        <div className="flex gap-2">
          <Input
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="新分组名称"
          />
          <Button
            type="button"
            onClick={() => {
              if (!newGroupName.trim()) {
                toast({ title: "分组名称不能为空", variant: "destructive" });
                return;
              }
              const createdId = onCreateGroup(newGroupName.trim());
              if (createdId) {
                setGroupId(createdId);
              }
              setNewGroupName("");
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            新建
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  );
}
