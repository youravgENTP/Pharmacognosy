import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured");
export const databaseClient = postgres(process.env.DATABASE_URL, { prepare: false, max: 5 });
export const db = drizzle(databaseClient, { schema });
