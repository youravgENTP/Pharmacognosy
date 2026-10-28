import { authorizeApi } from "@/lib/auth/permissions";
import { diagnoseMediaAsset } from "@/lib/media/diagnostics";
import { uuidSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const ids = [...new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean))];
  if (!ids.length || ids.length > 25 || ids.some((id) => !uuidSchema.safeParse(id).success)) return Response.json({ error: "Provide 1–25 valid media IDs." }, { status: 400 });
  return Response.json({ diagnostics: await Promise.all(ids.map(diagnoseMediaAsset)) }, { headers: { "Cache-Control": "no-store" } });
}
