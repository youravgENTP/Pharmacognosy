import { authorizeApi } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getIncrementalBackupStatus, requestFullSnapshot } from "@/lib/backup/worker";

export const runtime = "nodejs";

export async function GET() {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  return Response.json(await getIncrementalBackupStatus(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authError = await authorizeApi("admin"); if (authError) return authError;
  const current = await getCurrentUser(request.headers);
  try { const result = await requestFullSnapshot(current?.id); return Response.json(result, { status: result.coalesced ? 200 : 202 }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "전체 스냅샷 요청에 실패했습니다." }, { status: 503 }); }
}
