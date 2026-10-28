import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const once = process.argv.includes("--once");
const interval = Number(process.env.BACKUP_WORKER_INTERVAL_MS ?? 30_000);

async function execute() {
  const { runBackupWorker } = await import("@/lib/backup/worker");
  try { console.log(JSON.stringify(await runBackupWorker())); }
  catch (error) { console.error(error instanceof Error ? error.message : "Backup worker failed"); if (once) process.exitCode = 1; }
}

await execute();
if (!once) setInterval(() => void execute(), interval);
