import type { Metadata } from "next";
import { THEME_INITIALIZER } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = { title: "Herb Overflow", description: "생약 지식 데이터베이스와 학습 공간" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko" data-theme="night" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_INITIALIZER }}/></head><body>{children}</body></html>;
}
