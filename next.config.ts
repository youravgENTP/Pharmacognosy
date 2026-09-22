import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/export/drugs": ["./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-*.woff"],
    "/api/collections/*/export/pdf": ["./node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-*.woff"],
  },
};
export default nextConfig;
