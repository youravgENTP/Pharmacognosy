import { authorizeApi } from "@/lib/auth/permissions";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, crudeDrugs, families } from "@/lib/db/schema";
export async function GET() { const authError = await authorizeApi("user"); if (authError) return authError;
  const [drugRows, familyRows, categoryRows] = await Promise.all([db.select().from(crudeDrugs).orderBy(asc(crudeDrugs.catalogIndex), asc(crudeDrugs.referenceIndex)), db.select().from(families).orderBy(asc(families.koreanName)), db.select().from(categories).orderBy(asc(categories.position))]);
  return new Response(JSON.stringify({ schema: "pharmacognosy.backup", version: 1, exportedAt: new Date().toISOString(), categories: categoryRows, families: familyRows, drugs: drugRows }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="pharmacognosy-${new Date().toISOString().slice(0, 10)}.json"` } });
}
