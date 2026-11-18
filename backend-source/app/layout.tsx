import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "螺旋寺院考核排行榜",
  description: "螺旋寺院机制考核的成绩服务。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
