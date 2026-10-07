import { authorizeApi } from "@/lib/auth/permissions";
import { getFamilyExplorerData } from "@/lib/data/family";
import { createFamiliesXlsx } from "@/lib/export/families-xlsx";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const denied = await authorizeApi("user");
  if (denied) return denied;
  try {
    const buffer = await createFamiliesXlsx(await getFamilyExplorerData());
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": "attachment; filename=HerbOverflow-Botanical-Families.xlsx",
      "Content-Length": String(buffer.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    console.error("Botanical Family XLSX export failed", error);
    return Response.json({ error: "Botanical Family Excel 파일 생성에 실패했습니다." }, { status: 500 });
  }
}
