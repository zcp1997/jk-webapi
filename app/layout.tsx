import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";

import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "jk-webapi-helper",
  description:
    "桌面端工具，用于构造并发送 multipart/form-data 请求，配合 jk webapi 接口调试。"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className={cn("min-h-screen bg-background font-sans antialiased", inter.className)}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
