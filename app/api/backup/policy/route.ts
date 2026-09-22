import { z } from "zod";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { canAttemptCatchUpPeriod, duePeriod } from "@/lib/backup/policy";
import { createRestoreSafetyTicket, loadBackupPolicy, saveBackupPolicy } from "@/lib/backup/settings";

const policySchema = z.object({ enabled: z.boolean(), frequency: z.enum(["daily", "weekly"]), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().min(1).max(100), catchUp: z.boolean() });
const actionSchema = z.object({ action: z.enum(["attempt", "success", "safety"]), periodKey: z.string().datetime().optional() });

async function admin() { const current = await getCurrentUser(); return current?.role === "admin" ? current : null; }

export async function GET() {
  if (!await admin()) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const policy = await loadBackupPolicy();
  return NextResponse.json({ policy, schedule: duePeriod(policy), status: duePeriod(policy).overdue ? "overdue" : "up-to-date" });
}

export async function PATCH(request: Request) {
  if (!await admin()) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = policySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  try { new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone }).format(); }
  catch { return NextResponse.json({ error: "올바른 timezone이 아닙니다." }, { status: 400 }); }
  const current = await loadBackupPolicy();
  const policy = await saveBackupPolicy({ ...current, ...parsed.data });
  return NextResponse.json({ policy, schedule: duePeriod(policy) });
}

export async function POST(request: Request) {
  const currentUser = await admin();
  if (!currentUser) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  if (parsed.data.action === "safety") {
    return NextResponse.json({ token: await createRestoreSafetyTicket(currentUser.id) });
  }
  const policy = await loadBackupPolicy();
  const schedule = duePeriod(policy);
  if (parsed.data.action === "attempt" && parsed.data.periodKey) {
    if (schedule.periodKey !== parsed.data.periodKey) return NextResponse.json({ error: "백업 예정 기간이 변경되었습니다.", schedule }, { status: 409 });
    if (!canAttemptCatchUpPeriod(policy, parsed.data.periodKey)) return NextResponse.json({ error: "이 예정 기간의 자동 백업은 이미 시도했습니다.", schedule }, { status: 409 });
  }
  if (parsed.data.action === "success" && parsed.data.periodKey && policy.lastAttemptPeriodKey !== parsed.data.periodKey) {
    return NextResponse.json({ error: "완료할 자동 백업 시도를 찾을 수 없습니다." }, { status: 409 });
  }
  const now = new Date().toISOString();
  const updated = await saveBackupPolicy({ ...policy, lastAttemptAt: now, ...(parsed.data.action === "attempt" && parsed.data.periodKey ? { lastAttemptPeriodKey: parsed.data.periodKey } : {}), ...(parsed.data.action === "success" ? { lastSuccessfulLocalBackupAt: now } : {}) });
  return NextResponse.json({ policy: updated, schedule: duePeriod(updated) });
}
