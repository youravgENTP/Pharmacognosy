import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Herb Overflow", description: "생약 지식 데이터베이스와 학습 공간" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
