import { runBackupWorker } from "@/lib/backup/worker";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }

async function run(request: Request) {
  const expected = process.env.BACKUP_WORKER_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return Response.json({ error: "Unauthorized worker invocation" }, { status: 401 });
  try { return Response.json(await runBackupWorker()); }
  catch (error) { console.error("Incremental backup worker failed", error); return Response.json({ error: error instanceof Error ? error.message : "Backup worker failed" }, { status: 500 }); }
}
