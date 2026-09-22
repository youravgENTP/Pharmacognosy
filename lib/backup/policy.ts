export const BACKUP_POLICY_KEY = "backup.policy.v1";
export const RESTORE_SAFETY_KEY = "backup.restore-safety.v1";

export type BackupFrequency = "daily" | "weekly";
export type BackupPolicy = {
  enabled: boolean;
  frequency: BackupFrequency;
  time: string;
  timezone: string;
  catchUp: boolean;
  lastSuccessfulLocalBackupAt: string | null;
  lastAttemptAt: string | null;
  lastAttemptPeriodKey: string | null;
};

export const defaultBackupPolicy: BackupPolicy = { enabled: false, frequency: "weekly", time: "03:00", timezone: "Asia/Seoul", catchUp: true, lastSuccessfulLocalBackupAt: null, lastAttemptAt: null, lastAttemptPeriodKey: null };

export function canAttemptCatchUpPeriod(policy: BackupPolicy, periodKey: string) {
  return policy.lastAttemptPeriodKey !== periodKey;
}

export function catchUpAttemptKey(periodKey: string) { return `backup-catchup-attempt:${periodKey}`; }

export function isValidRestoreSafetyTicket(value: { token?: string; createdAt?: string; consumed?: boolean } | undefined, token: string, now = new Date()) {
  return Boolean(value?.token && value.token === token && !value.consumed && value.createdAt && now.getTime() - new Date(value.createdAt).getTime() <= 15 * 60_000 && now.getTime() >= new Date(value.createdAt).getTime());
}

export function duePeriod(policy: BackupPolicy, now = new Date()) {
  if (!policy.enabled) return { overdue: false, dueAt: null, nextAt: null, periodKey: null };
  const local = zonedParts(now, policy.timezone);
  const [hour, minute] = policy.time.split(":").map(Number);
  const today = { year: local.year, month: local.month, day: local.day };
  const todayDue = zonedDateToUtc(today.year, today.month, today.day, hour, minute, policy.timezone);
  let dueDate = now < todayDue ? addCalendarDays(today, -1) : today;
  if (policy.frequency === "weekly") {
    const weekday = new Date(Date.UTC(dueDate.year, dueDate.month - 1, dueDate.day)).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    dueDate = addCalendarDays(dueDate, -daysSinceMonday);
  }
  const dueAt = zonedDateToUtc(dueDate.year, dueDate.month, dueDate.day, hour, minute, policy.timezone);
  const nextDate = addCalendarDays(dueDate, policy.frequency === "daily" ? 1 : 7);
  const nextAt = zonedDateToUtc(nextDate.year, nextDate.month, nextDate.day, hour, minute, policy.timezone);
  const lastSuccess = policy.lastSuccessfulLocalBackupAt ? new Date(policy.lastSuccessfulLocalBackupAt) : null;
  return { overdue: !lastSuccess || lastSuccess < dueAt, dueAt: dueAt.toISOString(), nextAt: nextAt.toISOString(), periodKey: dueAt.toISOString() };
}

function addCalendarDays(value: { year: number; month: number; day: number }, days: number) {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function zonedDateToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const shown = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(guess);
  const get = (type: string) => Number(shown.find((part) => part.type === type)?.value);
  const shownUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess.getTime() + (guess.getTime() - shownUtc));
}
