import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseBackupArchive } from "@/lib/backup/archive";
import { commitSelectiveRestore } from "@/lib/backup/restore-server";
import { consumeRestoreSafetyTicket } from "@/lib/backup/settings";
import type { RestoreSelection } from "@/lib/backup/restore";

export const runtime = "nodejs";
export const maxDuration = 300;

const selectionSchema = z.array(z.object({ drugId: z.string().uuid(), fields: z.array(z.string().min(1)).min(1) })).min(1);

export async function POST(request: Request) {
  const current = await getCurrentUser();
  if (!current || current.role !== "admin") return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    const safetyToken = form.get("safetyToken");
    const selectionText = form.get("selections");
    if (!(file instanceof File) || typeof safetyToken !== "string" || typeof selectionText !== "string") return NextResponse.json({ error: "복원 요청이 완전하지 않습니다." }, { status: 400 });
    const selections = selectionSchema.parse(JSON.parse(selectionText)) as RestoreSelection[];
    const buffer = Buffer.from(await file.arrayBuffer());
    await parseBackupArchive(buffer);
    if (!await consumeRestoreSafetyTicket(current.id, safetyToken)) return NextResponse.json({ error: "유효한 사전 안전 백업이 필요합니다. 안전 백업을 다시 내려받아주세요." }, { status: 409 });
    return NextResponse.json(await commitSelectiveRestore(buffer, selections));
  } catch (error) {
    console.error("Selective restore failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "복원을 완료하지 못했습니다." }, { status: 400 });
  }
}
