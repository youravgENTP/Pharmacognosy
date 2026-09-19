import { asc, ilike, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crudeDrugs } from "@/lib/db/schema";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const rows = await db.select({ id: crudeDrugs.id, koreanName: crudeDrugs.koreanName, latinName: crudeDrugs.latinName, catalogIndex: crudeDrugs.catalogIndex, referenceIndex: crudeDrugs.referenceIndex }).from(crudeDrugs).where(query ? or(ilike(crudeDrugs.koreanName, `%${query}%`), ilike(crudeDrugs.latinName, `%${query}%`), sql`CAST(${crudeDrugs.catalogIndex} AS TEXT) ILIKE ${`%${query}%`}`, sql`CAST(${crudeDrugs.referenceIndex} AS TEXT) ILIKE ${`%${query}%`}`) : undefined).orderBy(asc(crudeDrugs.koreanName)).limit(30);
  return NextResponse.json(rows);
}
