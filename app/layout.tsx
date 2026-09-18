import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";

export const metadata: Metadata = { title: "Pharmacognosy", description: "생약 지식 데이터베이스와 학습 공간" };

export default function RootLayout({ children, modal }: Readonly<{ children: React.ReactNode; modal: React.ReactNode }>) {
  return <html lang="ko"><body><Shell>{children}</Shell>{modal}</body></html>;
}
