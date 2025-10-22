# jk-webapi-helper

本仓库提供一个基于 **Next.js (App Router) + TailwindCSS + shadcn/ui + Tauri v2** 的桌面应用，支持从本地构造并发送 `multipart/form-data` 请求，适配 jk webapi 的签名规范。

## 功能概览

- 分组 + 预设管理，持久化于 `localStorage`。
- Base64 转换、MD5 签名计算（由 Tauri Rust 后端提供，前端有兜底）。
- 支持「转为 Base64」「推送」「转为 Base64 并推送」三种操作。
- 请求历史记录（最多 500 条），可复制响应、快速回填。
- 响应支持 `Raw / Base64 解码 / JSON` 多视图切换，错误信息友好展示。
- 导入 / 导出全部本地数据（JSON）。

## 目录结构

```
.
├── app
│   ├── globals.css          # Tailwind + 设计系统变量
│   ├── layout.tsx           # App Layout，挂载 Toaster
│   └── page.tsx             # 主界面（预设、表单、历史、结果视图）
├── components
│   └── ui                   # shadcn/ui 组件集合（Button/Card/Form/Tabs/...）
├── lib
│   ├── base64.ts            # Base64 编解码与 JSON 校验
│   ├── clipboard.ts         # 统一的复制提示
│   ├── request.ts           # fetch + 超时控制 + 签名调用
│   ├── sign.ts              # 调用 tauri md5 命令，带浏览器兜底
│   ├── storage.ts           # localStorage 数据读写、导入导出
│   ├── time.ts              # 时间格式化与 timestamp 生成
│   ├── types.ts             # 统一的 TypeScript 接口
│   └── utils.ts             # 通用工具函数
├── public                   # 可放置图标资源（空）
├── src-tauri
│   ├── Cargo.toml           # Rust 依赖配置
│   ├── build.rs             # Tauri build 脚本
│   └── src
│       └── main.rs          # md5_upper_hex 命令实现与窗口配置
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── tauri.conf.json
├── next.config.mjs
└── README.md
```

## 本地开发

```bash
pnpm install
# 仅前端（浏览器环境）开发调试
pnpm dev

# 桌面端（Tauri）调试，自动启动 Next dev
pnpm tauri:dev
```

### 生产构建与打包

```bash
# Next.js 生产构建
pnpm build

# Tauri 桌面应用打包（含多平台产物）
pnpm tauri:build
```

## 备注

- `localStorage` 命名空间统一为 `jk_wms_webapi_*`。
- 若在纯浏览器环境下运行（`pnpm dev`），签名计算会自动退回前端 `crypto-js` 实现。
- Base64 处理考虑了中文字符，默认使用 `encodeURIComponent`/`decodeURIComponent` 方案。
