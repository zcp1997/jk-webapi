"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  AlertCircle,
  Braces,
  Eye,
  FolderPlus,
  History as HistoryIcon,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Send,
  SlidersHorizontal,
  Terminal,
  Trash2,
  Check
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
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/use-toast";

import { copyToClipboard } from "@/lib/clipboard";
import { decodeBase64ToUtf8, encodeUtf8ToBase64, isValidJson } from "@/lib/base64";
import { executeMultipartRequest } from "@/lib/request";
import {
  clearHistory,
  cloneGroup,
  clonePreset,
  createGroup,
  deleteGroup,
  deletePreset,
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
  appkey: z.string().min(1, "AppKey 必填"),
  password: z.string().min(1, "AppPassword 必填"),
  ver: z.string().min(1, "版本号必填"),
  timestamp: z.string().regex(/^\d{14}$/, "timestamp 必须是 yyyyMMddHHmmss"),
  dataRaw: z
    .string()
    .min(1, "请填写 data 原始 JSON")
    .superRefine((value, ctx) => {
      try {
        JSON.parse(value);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "JSON 结构无效" });
      }
    }),
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
  const [isSending, setIsSending] = useState(false);
  const [sign, setSign] = useState("");
  const [result, setResult] = useState<ResultView | null>(null);
  const [lastExecution, setLastExecution] = useState<LastExecution | null>(null);
  const [activeTab, setActiveTab] = useState("json");
  const [isDerivedInfoOpen, setIsDerivedInfoOpen] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isCurlOpen, setIsCurlOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const watchTimestamp = form.watch("timestamp");
  const watchPassword = form.watch("password");
  const watchDataB64 = form.watch("dataB64");
  const watchDataRaw = form.watch("dataRaw");
  const watchUrl = form.watch("url");
  const watchAppkey = form.watch("appkey");
  const watchVer = form.watch("ver");

  const jsonStatus = useMemo(() => {
    const raw = watchDataRaw ?? "";
    if (!raw.trim()) {
      return { valid: false, message: "JSON 内容为空" } as const;
    }
    try {
      JSON.parse(raw);
      return { valid: true } as const;
    } catch (error) {
      return { valid: false, message: (error as Error).message } as const;
    }
  }, [watchDataRaw]);

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
      setActiveTab("json");
      toast({
        title: "已载入请求",
        description: `${preset.name}`
      });
    },
    [form]
  );

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
  }, [selectedGroupId, selectedPresetId, groupsState, fillFromPreset]);

  useEffect(() => {
    saveGroups(groupsState);
  }, [groupsState]);

  useEffect(() => {
    saveHistory(historyState);
  }, [historyState]);

  const curlPreview = useMemo(() => {
    if (!watchUrl || !watchAppkey || !watchPassword || !watchDataB64 || !watchTimestamp || !sign) {
      return "";
    }
    const sanitizedUrl = watchUrl.trim();
    if (!sanitizedUrl) return "";
    const fields = [
      `-F "appkey=${watchAppkey}"`,
      `-F "timestamp=${watchTimestamp}"`,
      `-F "data=${watchDataB64}"`,
      `-F "sign=${sign}"`,
      `-F "ver=${watchVer || "1"}"`
    ];
    return [`curl -X POST '${sanitizedUrl}' \\`, ...fields.map((line) => `  ${line}`)].join("\n");
  }, [watchUrl, watchAppkey, watchPassword, watchDataB64, watchTimestamp, watchVer, sign]);

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

  const duplicateGroupAndSelect = useCallback(
    (groupId: string) => {
      let newGroupId = "";
      let newPresetId: string | undefined;
      setGroupsState((prev) => {
        const next = cloneGroup(groupId, prev);
        newGroupId = next.lastUsedGroupId ?? "";
        newPresetId = next.lastUsedPresetId;
        return next;
      });
      if (newGroupId) {
        setSelectedGroupId(newGroupId);
        setSelectedPresetId(newPresetId);
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

  const handleFormatJson = useCallback(() => {
    const raw = form.getValues("dataRaw");
    if (!raw) {
      toast({
        title: "请填写 JSON 文本",
        variant: "destructive"
      });
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      const pretty = JSON.stringify(parsed, null, 2);
      form.setValue("dataRaw", pretty, { shouldDirty: true, shouldTouch: true });
      const encoded = encodeUtf8ToBase64(pretty);
      form.setValue("dataB64", encoded, { shouldDirty: true, shouldTouch: true });
      toast({
        title: "JSON 已格式化",
        description: `长度 ${pretty.length}`
      });
    } catch (error) {
      toast({
        title: "格式化失败",
        description: (error as Error).message,
        variant: "destructive"
      });
    }
  }, [form]);

  const refreshTimestamp = useCallback(() => {
    const now = getTimestamp();
    form.setValue("timestamp", now, { shouldDirty: true, shouldTouch: true });
    return now;
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
        description: "请检查 JSON 内容是否正确",
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
      const currentTimestamp = refreshTimestamp();
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
            timestamp: currentTimestamp
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
        setActiveTab(view.json || view.jsonError ? "json" : "raw");
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
    [ensureRequiredBeforeSend, form, handleConvertBase64, refreshTimestamp, sign]
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
        title: "请求已保存",
        description: `${name}`
      });
    },
    [form]
  );

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
    setActiveTab("json");
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
        <div className="text-sm font-semibold">请求集合</div>
        <Button size="sm" variant="ghost" onClick={() => setDialogState({ type: "group-create" })}>
          <FolderPlus className="mr-2 h-4 w-4" />
          新增集合
        </Button>
      </div>
      <ScrollArea className="flex-1 rounded-md border bg-card">
        <div className="space-y-1 p-2">
          {groupsState.groups.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">暂无集合，点击「新增集合」创建。</div>
          ) : (
            groupsState.groups.map((group) => (
              <div
                key={group.id}
                className={cn(
                  "rounded-md border p-2",
                  selectedGroupId === group.id ? "border-primary ring-1 ring-primary" : "border-border"
                )}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setSelectedPresetId(undefined);
                    }}
                    className="flex-1 text-left font-medium hover:text-primary"
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
                      <DropdownMenuLabel>集合操作</DropdownMenuLabel>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedGroupId(group.id);
                          setDialogState({ type: "preset-save" });
                        }}
                      >
                        添加请求
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          const createdId = duplicateGroupAndSelect(group.id);
                          if (createdId) {
                            toast({ title: "集合已复制" });
                          }
                        }}
                      >
                        复制集合
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setDialogState({ type: "group-rename", group })}>
                        重命名
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          setGroupsState((prev) => deleteGroup(group.id, prev));
                          toast({ title: "集合已删除" });
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        删除集合
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
                          <DropdownMenuLabel>请求操作</DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => {
                              setGroupsState((prev) => clonePreset(group.id, preset, prev));
                              toast({ title: "请求已复制" });
                            }}
                          >
                            复制请求
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
                              toast({ title: "请求已删除" });
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除请求
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
                    添加请求
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
          保存到集合
        </Button>
        <Button variant="secondary" onClick={resetForm}>
          <RefreshCw className="mr-2 h-4 w-4" />
          清空表单
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={() => handleSend(true)}
          disabled={isSending}
        >
          {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          转为 Base64 并推送
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsDerivedInfoOpen(true)}>
          <Eye className="mr-2 h-4 w-4" />
          查看派生参数
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsAdvancedOpen(true)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          高级设置
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsCurlOpen(true)}>
          <Terminal className="mr-2 h-4 w-4" />
          请求预览
        </Button>
        <Button variant="outline" size="sm" onClick={() => setIsHistoryOpen(true)}>
          <HistoryIcon className="mr-2 h-4 w-4" />
          查看历史
        </Button>
      </div>
    </div>
  );

  const renderForm = () => (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle>请求构造</CardTitle>
        <CardDescription>填写请求信息，timestamp 将自动生成并随请求发送。</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col gap-6 overflow-y-auto pr-1">
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
                  <FormLabel>AppKey</FormLabel>
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
                  <FormLabel>AppPassword</FormLabel>
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
          </div>

          <FormField
            control={form.control}
            name="dataRaw"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FormLabel>data（原始 JSON）</FormLabel>
                    {jsonStatus.valid ? (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        JSON 合法
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        JSON 待修复
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">长度 {field.value?.length || 0}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleFormatJson}
                      disabled={!jsonStatus.valid}
                    >
                      <Braces className="mr-1 h-4 w-4" />
                      格式化
                    </Button>
                  </div>
                </div>
                <FormControl>
                  <Textarea
                    className="min-h-[240px]"
                    placeholder='{"hello": "world"}'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  支持中文字段名，发送前会自动转换为 Base64 并参与签名。
                </FormDescription>
                {!jsonStatus.valid && field.value ? (
                  <p className="text-xs text-destructive">{jsonStatus.message}</p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );

  const renderResult = () => (
    <Card className="flex min-h-0 flex-1 flex-col">
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
      <CardContent className="flex min-h-0 flex-1 flex-col">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full">
            <TabsTrigger value="json">JSON 视图</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
          <TabsContent value="json" className="flex-1 overflow-hidden rounded-md border bg-muted/20">
            <ScrollArea className="h-full">
              <pre className="whitespace-pre-wrap p-4 text-sm">
                {result?.json ?? result?.jsonError ?? "暂无数据"}
              </pre>
            </ScrollArea>
          </TabsContent>
          <TabsContent value="raw" className="flex-1 overflow-hidden rounded-md border bg-muted/20">
            <ScrollArea className="h-full">
              <pre className="whitespace-pre-wrap p-4 text-sm">
                {result?.raw ?? "暂无数据"}
              </pre>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );

  return (
    <Form {...form}>
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="border-b bg-background">
          <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between px-4">
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
          <aside className="hidden w-72 border-r bg-muted/20 p-4 lg:block">{renderGroups()}</aside>
          <section className="flex-1 overflow-hidden">
            <div className="mx-auto flex h-full w-full max-w-[1280px] flex-col gap-4 px-4 py-6">
              {renderToolbar()}
              <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  {renderForm()}
                </div>
                <div className="flex min-h-0 flex-col gap-4 lg:w-[480px] lg:flex-none">
                  {renderResult()}
                </div>
              </div>
            </div>
          </section>
        </main>

        <Dialog open={dialogState?.type === "group-create"} onOpenChange={(open) => !open && setDialogState(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新增集合</DialogTitle>
              <DialogDescription>为集合取一个名字，用于管理多个请求。</DialogDescription>
            </DialogHeader>
            <GroupNameForm
              onSubmit={(name) => {
                createGroupAndSelect(name);
                setDialogState(null);
                toast({ title: "集合已创建", description: name });
              }}
            />
          </DialogContent>
        </Dialog>

        {dialogState && dialogState.type === "group-rename" && (
          <Dialog open onOpenChange={(open) => !open && setDialogState(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>重命名集合</DialogTitle>
              </DialogHeader>
              <GroupNameForm
                defaultValue={dialogState.group.name}
                onSubmit={(name) => {
                  setGroupsState((prev) => renameGroup(dialogState.group.id, name, prev));
                  setDialogState(null);
                  toast({ title: "集合已重命名" });
                }}
              />
            </DialogContent>
          </Dialog>
        )}

        {dialogState?.type === "preset-save" && (
          <Dialog open onOpenChange={(open) => !open && setDialogState(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>保存为请求</DialogTitle>
                <DialogDescription>选择集合并为本次参数命名。</DialogDescription>
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
                <DialogTitle>重命名请求</DialogTitle>
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
                  toast({ title: "请求已重命名" });
                }}
              />
            </DialogContent>
          </Dialog>
        )}

        <Dialog open={isDerivedInfoOpen} onOpenChange={setIsDerivedInfoOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>派生参数</DialogTitle>
              <DialogDescription>查看签名与 Base64 数据，便于复制或排查。</DialogDescription>
            </DialogHeader>
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>data（Base64 后）</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">长度 {watchDataB64?.length ?? 0}</Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(watchDataB64 ?? "", "Base64 已复制")}
                      disabled={!watchDataB64}
                    >
                      复制
                    </Button>
                  </div>
                </div>
                <ScrollArea className="max-h-48 rounded-md border bg-muted/20">
                  <pre className="whitespace-pre-wrap break-all p-4 text-xs font-mono">
                    {watchDataB64 || "暂无数据"}
                  </pre>
                </ScrollArea>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>签名 sign</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(sign, "sign 已复制")}
                    disabled={!sign}
                  >
                    复制
                  </Button>
                </div>
                <Input readOnly value={sign} />
                <FormDescription>算法：MD5(timestamp + data + AppPassword)</FormDescription>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>高级设置</DialogTitle>
              <DialogDescription>调整请求细节以适配后端性能。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
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
          </DialogContent>
        </Dialog>

        <Dialog open={isCurlOpen} onOpenChange={setIsCurlOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>请求预览</DialogTitle>
              <DialogDescription>复制 curl 命令以便在终端复现请求。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(curlPreview, "cURL 已复制")}
                  disabled={!curlPreview}
                >
                  复制 cURL
                </Button>
              </div>
              <ScrollArea className="max-h-72 rounded-md border bg-muted/20">
                <pre className="whitespace-pre text-xs leading-6 p-4">
                  {curlPreview || "填写完整参数后将自动生成。"}
                </pre>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>请求历史</DialogTitle>
              <DialogDescription>最近发送的请求会自动保留，便于复用。</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                共 {historyState.items.length} 条记录（保留 {historyState.limit ?? 500} 条）
              </div>
              <Button size="sm" variant="ghost" onClick={handleClearHistory}>
                清空历史
              </Button>
            </div>
            <ScrollArea className="max-h-[420px]">
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
              </Table>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </Form>
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
          toast({ title: "请选择集合", variant: "destructive" });
          return;
        }
        if (!name.trim()) {
          toast({ title: "请求名称不能为空", variant: "destructive" });
          return;
        }
        onSubmit(groupId, name.trim());
      }}
    >
      <div className="space-y-2">
        <Label>选择集合</Label>
        <select
          value={groupId}
          onChange={(event) => setGroupId(event.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm"
        >
          <option value="" disabled>
            请选择集合
          </option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>请求名称</Label>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：测试环境-创建订单"
          autoFocus
        />
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <Label>快速新建集合</Label>
        <div className="flex gap-2">
          <Input
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="新集合名称"
          />
          <Button
            type="button"
            onClick={() => {
              if (!newGroupName.trim()) {
                toast({ title: "集合名称不能为空", variant: "destructive" });
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
            新建集合
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit">保存</Button>
      </DialogFooter>
    </form>
  );
}
