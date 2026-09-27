import type { NextConfig } from "next";

const pdfFontFiles = [
  "./node_modules/@fontsource/noto-sans-kr/package.json",
  "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff",
  "./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff",
  ...[98, 101, 102, 104, 105, 107, 108].flatMap((subset) => [400, 700].map((weight) => `./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-${subset}-${weight}-normal.woff`)),
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/export/drugs": pdfFontFiles,
    "/api/collections/*/export/pdf": pdfFontFiles,
  },
};
export default nextConfig;
