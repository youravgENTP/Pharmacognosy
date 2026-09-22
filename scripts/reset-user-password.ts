import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";
import { config } from "dotenv";

config({ path: ".env.local" });

class HiddenOutput extends Writable {
  muted = false;
  _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    if (!this.muted) process.stdout.write(chunk);
    callback();
  }
}

async function main() {
  if (!process.stdin.isTTY) throw new Error("Run this command in an interactive terminal.");

  const output = new HiddenOutput();
  const prompt = createInterface({ input: process.stdin, output, terminal: true });
  const hiddenQuestion = async (label: string) => {
    process.stdout.write(label);
    output.muted = true;
    const answer = await prompt.question("");
    output.muted = false;
    process.stdout.write("\n");
    return answer;
  };

  try {
    const email = (process.argv[2] ?? await prompt.question("User email: ")).trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Enter a valid user email.");
    const password = await hiddenQuestion("New password: ");
    const confirmation = await hiddenQuestion("Confirm new password: ");
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    if (password.length > 128) throw new Error("Password must be at most 128 characters.");
    if (password !== confirmation) throw new Error("Passwords do not match.");

    const { betterAuth } = await import("better-auth");
    const { drizzleAdapter } = await import("@better-auth/drizzle-adapter");
    const { db } = await import("../lib/db");
    const schema = await import("../lib/db/schema");
    const auth = betterAuth({
      database: drizzleAdapter(db, { provider: "pg", schema }),
      emailAndPassword: { enabled: true },
    });
    const context = await auth.$context;
    const target = await context.internalAdapter.findUserByEmail(email);
    if (!target) throw new Error(`No user exists for ${email}.`);

    const hashedPassword = await context.password.hash(password);
    const credential = await context.internalAdapter.findCredentialAccount(target.user.id);
    if (credential) await context.internalAdapter.updatePassword(target.user.id, hashedPassword);
    else await context.internalAdapter.createAccount({ userId: target.user.id, providerId: "credential", accountId: target.user.id, password: hashedPassword });
    await context.internalAdapter.deleteUserSessions(target.user.id);
    console.log(`Password reset for ${email}. All existing sessions were revoked.`);
  } finally {
    prompt.close();
    const { databaseClient } = await import("../lib/db");
    await databaseClient.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Password reset failed");
  process.exit(1);
});
